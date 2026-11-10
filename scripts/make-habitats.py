"""Remake each period's environments: which plants and animals could have lived at every spot of its Earth.

A niche model per kind of life (genus), in the PaleoENM tradition (Myers, Stigall & Lieberman 2015):
its finds give the environment it lived in, a MaxEnt model learns that environment from the period's
real climate, and every 2° spot with a matching environment is scored for how well it suits it.

Environment per 2° cell:
  temperature  yearly surface temperature, Scotese et al. (2021) HadCM3L-based grids, on the same PALEOMAP
               plate model as the coastlines (a land find is read at lowland level: dig sites are basins)
  latitude     its distance from the equator (day length and seasons)
  sea life also: depth, and distance from the coast
Fitting: MaxEnt with linear and squared features (so it can learn a preferred middle), regularised more
the fewer places it was found. The background is a sample of its group's own dig sites in the same
habitat (target-group background, Phillips et al. 2009), so the model learns what sets the kind apart
from where palaeontologists happened to dig, not where they dug. Kinds found in fewer than MIN_MAXENT
places get a simple climate envelope instead, widened the fewer places they were found.

Where it is allowed: only its own landmass or sea, the connected land (or shelf sea, or for swimmers and
drifters the open ocean) that holds its finds, and within REACH_KM of one. A trilobite from one
continent is not placed on another that it could never have reached.

Writes data/habitat-<time>.bin, every kind likely at each 2° cell (90 rows from the north, 180 columns from
-180°), best first: a Uint32 block of N+1 offsets (cell i's entries are offsets[i] to offsets[i+1]), a Uint16
block of genus indexes (into data/slice-<time>.json's genera), then a Uint8 block of scores. Score 255 means
it was FOUND in that cell; 1-254 is how well the cell suits it (a guess from the model).

Usage: python3 scripts/make-habitats.py <time_ma> [<time_ma> ...]
"""
import base64
import collections
import json
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from groups import LAND, WATER  # noqa: E402

DATA = os.path.join(os.path.dirname(HERE), "data")
ROWS, COLS = 90, 180
MIN_SCORE = 0.12          # the range maps' faintest band
MIN_MAXENT = 8            # distinct find cells needed to fit a model
REACH_KM = 4000           # furthest a guessed place may be from one of its finds
SHELF_M = -2500           # sea floor shallower than this is shelf and slope (bottom dwellers)
DRIFTERS = {"graptolites", "conodonts", "fish"}            # swam or drifted in open water
EARTH_KM = 6371.0


def components(mask):
    """Label 4-connected patches of a ROWS x COLS mask (wrapping east-west). -1 outside the mask."""
    lab = np.full(mask.shape, -1, int)
    n = 0
    for r0, c0 in zip(*np.nonzero(mask)):
        if lab[r0, c0] >= 0:
            continue
        lab[r0, c0] = n
        st = [(r0, c0)]
        while st:
            r, c = st.pop()
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                rr, cc = r + dr, (c + dc) % COLS
                if 0 <= rr < ROWS and mask[rr, cc] and lab[rr, cc] < 0:
                    lab[rr, cc] = n
                    st.append((rr, cc))
        n += 1
    return lab


def maxent(F, presence, background, n_found):
    """Fit MaxEnt (linear + squared features) on feature rows F; return a 0-1 suitability per row."""
    B = F[background]
    mu, sd = B.mean(0), B.std(0) + 1e-6
    def feats(X):
        Z = (X - mu) / sd
        return np.hstack([Z, Z * Z])
    Xb, Xp = feats(B), feats(F[presence])
    target = Xp.mean(0)
    w = np.zeros(Xb.shape[1])
    lam = 0.05 * max(1.0, 30.0 / n_found)
    for _ in range(300):                                    # gradient ascent on the regularised log-likelihood
        s = Xb @ w
        p = np.exp(s - s.max()); p /= p.sum()
        w += 0.3 * (target - p @ Xb - lam * w)
    score = feats(F) @ w
    ref = np.quantile(feats(F[presence]) @ w, 0.1)          # 90% of its finds count as fully suitable
    return np.exp(np.minimum(0.0, score - ref))


def build(time):
    sl = json.load(open(os.path.join(DATA, f"slice-{time}.json")))
    e1 = np.frombuffer(base64.b64decode(sl["dem"]["elev"]), dtype="<i2").reshape(180, 360).astype(np.float32)
    t1 = np.frombuffer(base64.b64decode(sl["temp"]["t"]), dtype="<i2").reshape(180, 360).astype(np.float32) / 10
    elev = e1.reshape(ROWS, 2, COLS, 2).mean(axis=(1, 3))
    temp = t1.reshape(ROWS, 2, COLS, 2).mean(axis=(1, 3))
    low = (t1 + 6.5 * np.maximum(e1, 0) / 1000).reshape(ROWS, 2, COLS, 2).mean(axis=(1, 3))   # at lowland level
    land = elev > 0

    # Distance to the coast (cells), by breadth-first search from every cell beside the shore.
    coast = np.full((ROWS, COLS), -1, int)
    q = collections.deque()
    for r in range(ROWS):
        for c in range(COLS):
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                rr = r + dr
                if 0 <= rr < ROWS and land[rr, (c + dc) % COLS] != land[r, c]:
                    coast[r, c] = 0; q.append((r, c)); break
    while q:
        r, c = q.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            rr, cc = r + dr, (c + dc) % COLS
            if 0 <= rr < ROWS and coast[rr, cc] < 0:
                coast[rr, cc] = coast[r, c] + 1; q.append((rr, cc))
    coast[coast < 0] = 60

    lat = 89.0 - 2 * np.arange(ROWS)
    alat = np.abs(lat)[:, None] * np.ones((1, COLS))
    lon = np.radians(-179.0 + 2 * np.arange(COLS))[None, :]
    rlat = np.radians(lat)[:, None]

    # The connected land, shelf seas and open ocean of this period: a kind stays within the ones holding its finds.
    shelf = ~land & (elev > SHELF_M)
    comp = {"land": components(land & (elev <= 3000)), "shelf": components(shelf), "ocean": components(~land)}
    ok = {"land": land & (elev <= 3000), "shelf": shelf, "ocean": ~land}

    groups, genera = sl["groups"], sl["genera"]
    try:
        eco = json.load(open(os.path.join(DATA, f"life-{time}.json")))
    except FileNotFoundError:
        eco = {}
    finds = collections.defaultdict(collections.Counter)            # genus -> Counter[(r, c)]
    group_cells = collections.defaultdict(set)                      # group -> dig-site cells
    for lng, la, occ, *_ in sl["sites"]:
        r, c = min(ROWS - 1, max(0, int((90 - la) // 2))), int((lng + 180) // 2) % COLS
        for gi, _f, n in occ:
            finds[gi][(r, c)] += n
            group_cells[genera[gi]["group"]].add(r * COLS + c)

    flat = lambda a: a.ravel()
    F_sea = np.stack([flat(temp), flat(np.minimum(elev, 0)) / 1000, flat(np.minimum(coast, 40)) / 10, flat(alat) / 30], 1)
    F_land = np.stack([flat(temp), flat(alat) / 30], 1)
    F_land_found = np.stack([flat(low), flat(alat) / 30], 1)          # a find's climate, at lowland level

    best = [[] for _ in range(ROWS * COLS)]                          # per cell: [(score 0-1 or 2 = found, genus)]
    n_model = n_env = 0
    for g, cells_c in finds.items():
        grp = groups[genera[g]["group"]]
        cells = list(cells_c)
        rs = np.array([rc[0] for rc in cells]); cs = np.array([rc[1] for rc in cells])
        at_sea = (~land[rs, cs]).sum()
        # Groups that can be either (reptiles, arthropods) count as sea life only when most finds lie offshore
        # (over 200 m deep): land animals are often found on old coasts that the coarse map shows as shallow sea.
        offshore = (elev[rs, cs] < -200).sum()
        sea = grp in WATER or (grp not in LAND and offshore * 2 > len(cells))
        habit = (eco.get(genera[g]["name"], {}).get("eco") or {}).get("life_habit", "")
        drifter = grp in DRIFTERS or bool(re.search(r"nekton|plankton|pelagic", habit))
        kind = "land" if not sea else "ocean" if drifter else "shelf"
        lab = comp[kind]
        # its patches: the ones under its finds or right beside them (a coastal find can fall on the other
        # side of the coarse map's shoreline)
        own = {int(lab[rr, (c + dc) % COLS]) for r, c in cells for dr in (-1, 0, 1) for dc in (-1, 0, 1)
               if 0 <= (rr := r + dr) < ROWS and lab[rr, (c + dc) % COLS] >= 0}
        allowed = ok[kind] & np.isin(lab, list(own)) if own else np.zeros_like(land)
        # ...and within REACH_KM of a find.
        near = np.zeros((ROWS, COLS), bool)
        for r, c in cells:
            p_lat, p_lon = np.radians(89.0 - 2 * r), np.radians(-179.0 + 2 * c)
            d = np.arccos(np.clip(np.sin(rlat) * np.sin(p_lat) + np.cos(rlat) * np.cos(p_lat) * np.cos(lon - p_lon), -1, 1)) * EARTH_KM
            near |= d <= REACH_KM
        allowed &= near

        idx = rs * COLS + cs
        pres = np.unique(idx[ok[kind].ravel()[idx]])
        score = np.zeros(ROWS * COLS)
        if len(pres) >= MIN_MAXENT and allowed.sum() > 20:
            # target-group background: its group's dig sites in the allowed area, topped up with the area itself
            tg = np.array(sorted(i for i in group_cells[genera[g]["group"]] if allowed.ravel()[i]), int)
            area = np.nonzero(allowed.ravel())[0]
            bg = tg if len(tg) >= 40 else np.union1d(tg, area[:: max(1, len(area) // 2000)])
            F = F_sea if sea else F_land
            if not sea:                                                   # finds read at lowland level
                F = F.copy(); F[pres] = F_land_found[pres]
            score = maxent(F, pres, bg, len(pres))
            if not sea:
                score = np.maximum(score, 0)
            n_model += 1
        else:
            # A climate envelope: its finds' temperatures and latitudes, with margins that widen the fewer
            # places it was found (a few finds only hint at what it could take).
            widen = 1 + 3 / np.sqrt(len(cells))
            ft = (low if not sea else temp)[rs, cs]
            fl = alat[rs, cs]
            def z(x, lo, hi, s):
                return np.maximum(0, np.maximum(lo - x, x - hi)) / s
            env = np.exp(-0.5 * (z(temp, ft.min() - 2 * widen, ft.max() + 2 * widen, 2.5) ** 2
                                 + z(alat, fl.min() - 6 * widen, fl.max() + 6 * widen, 6) ** 2))
            if sea:
                fe = np.minimum(elev[rs, cs], 0)
                env *= np.exp(-0.5 * z(np.minimum(elev, 0), fe.min() - 300 * widen, fe.max() + 300 * widen, 400) ** 2)
            score = env.ravel()
            n_env += 1
        score = np.where(allowed.ravel(), np.minimum(score, 254 / 255), 0)
        # Where it was found, it surely lived: its find's cell if that is its habitat, else the next cell that is
        # (a coastal land find often falls on the sea side of the coarse 2° shoreline). Land life never in the sea.
        hab = ok[kind]
        for r, c in cells:
            if hab[r, c]:
                score[r * COLS + c] = 2.0
                continue
            for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                rr, cc = r + dr, (c + dc) % COLS
                if 0 <= rr < ROWS and hab[rr, cc]:
                    score[rr * COLS + cc] = 2.0
                    break
        for cell in np.nonzero(score >= MIN_SCORE)[0]:
            best[cell].append((float(score[cell]), g))

    offsets, ids, scs = [0], [], []
    for lst in best:
        lst.sort(reverse=True)
        for s, g in lst:
            ids.append(g); scs.append(255 if s > 1 else max(1, min(254, int(round(s * 255)))))
        offsets.append(len(ids))
    path = os.path.join(DATA, f"habitat-{time}.bin")
    with open(path, "wb") as f:
        f.write(np.array(offsets, "<u4").tobytes()); f.write(np.array(ids, "<u2").tobytes())
        f.write(np.array(scs, np.uint8).tobytes())
    filled = sum(1 for lst in best if lst)
    found = sum(1 for s in scs if s == 255)
    print(f"{time} Ma: {len(finds)} kinds placed ({n_model} MaxEnt, {n_env} climate envelope), "
          f"{filled} of {ROWS * COLS} cells with life, {found} found / {len(scs) - found} guessed entries, "
          f"{os.path.getsize(path) // 1024} KB", file=sys.stderr)


if __name__ == "__main__":
    for t in sys.argv[1:]:
        build(int(t))
