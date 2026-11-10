"""Where each kind of life lived in one time slice: a smoothed range per group, on the sea or land it lived in.

Reads data/slice-<time>.json (fossil sites at ancient positions + the ancient elevation grid) and writes
data/ranges-<time>.json:
  { "cols", "rows", "groups": [ { "group", "grid": base64 bytes 0-255 per 1° cell, "labels": [[lng, lat, size]] } ] }
A cell's value is how strongly the finds point to that group living there: high near many finds, fading
with distance, and zero on the wrong side of the shore (no fish on land, no dinosaurs at sea).

Usage: python3 scripts/make-life-ranges.py <time_ma> [<time_ma> ...]
"""
import base64
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")

SIGMA_KM = 260          # how far one find's evidence spreads (Gaussian width)
REACH_KM = 3 * SIGMA_KM
EARTH_KM = 6371.0
sys.path.insert(0, HERE)
from groups import LAND, WATER  # noqa: E402
# reptiles and arthropods: wherever their own finds sit (sea reptiles at sea, crocodiles and insects on land)
# The wide reach: a group found anywhere in a period also lived across the matching land or shallow sea
# around it, fading slowly with distance, so continents and shelves fill with the life their fossils show.
WIDE_KM = 1500          # how quickly that wide reach fades (exponential scale)
WIDE_REACH_KM = 6000
WIDE_WEIGHT = 2.2
SHELF_M = -2000         # sea life's wide reach stops at this depth: no shelly sea floor in the deep ocean
LABEL_LEVEL = 0.5       # a patch at least this strong gets a name on the map
MIN_LABEL_CELLS = 12


def build(time):
    slice_ = json.load(open(os.path.join(DATA, f"slice-{time}.json")))
    dem = slice_["dem"]
    cols, rows = dem["cols"], dem["rows"]
    elev = np.frombuffer(base64.b64decode(dem["elev"]), dtype="<i2").reshape(rows, cols)
    sea = elev <= 0

    lon = np.radians(np.arange(cols) - 180.0)[None, :]
    lat = np.radians(90.0 - np.arange(rows))[:, None]
    sin_lat, cos_lat = np.sin(lat), np.cos(lat)

    def cell(lng, la):
        return max(0, min(rows - 1, int(round(90 - la)))), int(round(lng + 180)) % cols

    groups = slice_["groups"]
    genera = slice_["genera"]
    # per group: [(lng, lat, weight, at_sea)]
    finds = {g: [] for g in groups}
    for lng, la, occ, *_ in slice_["sites"]:
        by_group = {}
        for gi, _fm, n in occ:
            grp = groups[genera[gi]["group"]]
            kinds, count = by_group.get(grp, (set(), 0))
            kinds.add(gi)
            by_group[grp] = (kinds, count + n)
        r, c = cell(lng, la)
        for grp, (kinds, count) in by_group.items():
            # more kinds and more fossils = stronger evidence, with diminishing returns
            finds[grp].append((lng, la, 0.6 + 0.4 * np.log1p(len(kinds)) + 0.2 * np.log1p(count), bool(sea[r, c])))

    out = {"time": time, "cols": cols, "rows": rows, "groups": []}
    for grp in groups:
        pts = finds[grp]
        if not pts:
            continue
        dens_sea = np.zeros((rows, cols))
        dens_land = np.zeros((rows, cols))
        wide_sea = np.zeros((rows, cols))
        wide_land = np.zeros((rows, cols))
        for lng, la, w, at_sea in pts:
            p_lat, p_lon = np.radians(la), np.radians(lng)
            cosd = sin_lat * np.sin(p_lat) + cos_lat * np.cos(p_lat) * np.cos(lon - p_lon)
            d = np.arccos(np.clip(cosd, -1, 1)) * EARTH_KM
            k = np.where(d < REACH_KM, w * np.exp(-0.5 * (d / SIGMA_KM) ** 2), 0.0)
            kw = np.where(d < WIDE_REACH_KM, w * WIDE_WEIGHT * np.exp(-d / WIDE_KM), 0.0)
            in_sea = grp in WATER or (grp not in LAND and at_sea)
            if in_sea:
                dens_sea += k
                wide_sea += kw
            else:
                dens_land += k
                wide_land += kw
        wide_sea = np.where(elev >= SHELF_M, wide_sea, 0.0)
        dens = np.where(sea, dens_sea + wide_sea, dens_land + wide_land)
        # deep ocean floor far from any shore was not where shelly sea life lived
        dens = np.where(elev < -4500, dens * 0.25, dens)
        v = 1 - np.exp(-dens)                      # 0 = no evidence, towards 1 = strong
        grid = np.round(v * 255).astype(np.uint8)
        out["groups"].append({"group": grp, "finds": len(pts), "grid": base64.b64encode(grid.tobytes()).decode(),
                              "labels": labels(v >= LABEL_LEVEL, v, cols)})
        print(f"{time} Ma {grp:15s} {len(pts):5d} sites  {(v >= 0.2).sum():6d} cells", file=sys.stderr)

    path = os.path.join(DATA, f"ranges-{time}.json")
    json.dump(out, open(path, "w"), separators=(",", ":"))
    print(f"wrote {path} ({os.path.getsize(path) // 1024} KB)", file=sys.stderr)


def labels(mask, v, cols):
    """The strongest cell of each sizeable patch: a point always inside the range, for its name."""
    rows = mask.shape[0]
    seen = np.zeros_like(mask)
    found = []
    for r0, c0 in zip(*np.nonzero(mask)):
        if seen[r0, c0]:
            continue
        stack, cells = [(r0, c0)], []
        seen[r0, c0] = True
        while stack:
            r, c = stack.pop()
            cells.append((r, c))
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                rr, cc = r + dr, (c + dc) % cols
                if 0 <= rr < rows and mask[rr, cc] and not seen[rr, cc]:
                    seen[rr, cc] = True
                    stack.append((rr, cc))
        if len(cells) < MIN_LABEL_CELLS:
            continue
        r, c = max(cells, key=lambda rc: v[rc])
        found.append([int(c) - 180, 90 - int(r), len(cells)])
    return sorted(found, key=lambda x: -x[2])[:3]


if __name__ == "__main__":
    for t in sys.argv[1:]:
        build(int(t))
