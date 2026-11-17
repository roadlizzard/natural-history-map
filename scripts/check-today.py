"""The today test: score the 0 Ma habitat map against where its kinds are actually recorded alive.

Today is the one period whose answer is known. Every kind (genus) in data/slice-0.json that still lives
has modern records in GBIF (observations and museum specimens, no fossils). Each kind's modelled range
(data/habitat-0.bin) is compared with its GBIF range on the same 2° grid:

  covered   share of the kind's real cells that the map also gives it (high = the map does not miss places)
  correct   share of the map's cells for it that are real (high = the map does not invent places).
            GBIF has gaps of its own, so this is a floor: the true figure is somewhat higher.
  finds     "covered" for the fossil finds alone, before any modelling: what the model had to start from.

And for the map as a whole: does the number of kinds per cell rise and fall where the real number does
(rank correlation over land cells), and how do some well-known places compare.

A kind counts as living only with at least MIN_CELLS GBIF cells; the rest are extinct, unmatched or too
rarely recorded to judge. Known slack: GBIF also holds introduced, farmed and garden records (horses and
wheat everywhere), and some genera are split differently in GBIF than in PBDB.

Writes data/check-today.json. Usage: python3 scripts/check-today.py [sample size, default all] [seed]
"""
import base64
import collections
import io
import json
import os
import random
import sys
import urllib.parse

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from netcache import DATA, fetch, fetch_json  # noqa: E402

ROWS, COLS = 90, 180
MIN_CELLS = 5             # GBIF cells a kind needs before it is judged
MATCH = "https://api.gbif.org/v1/species/match?rank=GENUS&name={}&phylum={}"
# One 512 px tile per hemisphere in plain lat/long; a coloured pixel is a place with records.
TILE = ("https://api.gbif.org/v2/map/occurrence/density/0/{}/0@1x.png?srs=EPSG:4326&taxonKey={}&bin=square&squareSize=8"
        "&style=classic.poly&hasCoordinateIssue=false&basisOfRecord=HUMAN_OBSERVATION&basisOfRecord=PRESERVED_SPECIMEN"
        "&basisOfRecord=MACHINE_OBSERVATION&basisOfRecord=OBSERVATION&basisOfRecord=MATERIAL_SAMPLE")
PLACES = {"Sahara": (23, 10), "Arabian desert": (22, 48), "Central Australia": (-25, 133), "Congo": (0, 22),
          "Amazon": (-5, -62), "Borneo": (1, 114), "New Guinea": (-5, 141), "Kansas": (38, -98),
          "Germany": (51, 10), "Siberia": (65, 100), "East Africa": (-3, 35), "India": (22, 79)}


def gbif_cells(name, phylum):
    """The 2° cells with living records of this genus (a ROWS x COLS bool grid), or None if GBIF has no such genus."""
    m = fetch_json(MATCH.format(urllib.parse.quote(name), urllib.parse.quote(phylum or "")), "gbif", pause=0.05)
    if m.get("rank") != "GENUS" or m.get("matchType") != "EXACT":
        return None
    key = m.get("acceptedUsageKey") or m["usageKey"]
    grid = np.zeros((ROWS, COLS), bool)
    for x in (0, 1):
        raw = fetch(TILE.format(x, key), "gbif", ext="png", pause=0.05)
        if not raw:                                           # 204: no records in this hemisphere
            continue
        ys, xs = np.nonzero(np.array(Image.open(io.BytesIO(raw)).convert("RGBA"))[..., 3] > 0)
        grid[ys * ROWS // 512, x * (COLS // 2) + xs * (COLS // 2) // 512] = True
    return grid


def ranks(a):
    r = np.empty(len(a)); r[np.argsort(a, kind="stable")] = np.arange(len(a))
    return r


def main():
    sample = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    sl = json.load(open(os.path.join(DATA, "slice-0.json")))
    genera, groups = sl["genera"], sl["groups"]
    e1 = np.frombuffer(base64.b64decode(sl["dem"]["elev"]), dtype="<i2").reshape(180, 360).astype(np.float32)
    land = e1.reshape(ROWS, 2, COLS, 2).mean(axis=(1, 3)) > 0

    b = open(os.path.join(DATA, "habitat-0.bin"), "rb").read()
    n_cells = ROWS * COLS
    off = np.frombuffer(b, "<u4", n_cells + 1)
    gi = np.frombuffer(b, "<u2", off[-1], 4 * (n_cells + 1))
    sc = np.frombuffer(b, "u1", off[-1], 4 * (n_cells + 1) + 2 * int(off[-1]))
    cell_of = np.repeat(np.arange(n_cells), np.diff(off))
    order = np.argsort(gi, kind="stable")
    starts = np.searchsorted(gi[order], np.arange(len(genera) + 1))

    todo = list(range(len(genera)))
    if sample:
        random.Random(int(sys.argv[2]) if len(sys.argv) > 2 else 1).shuffle(todo)
        todo = sorted(todo[:sample])

    rows = collections.defaultdict(list)                     # group -> [(covered, correct, finds)]
    rich_map, rich_real = np.zeros(n_cells), np.zeros(n_cells)
    skipped = collections.Counter()
    worst = []
    for k, g in enumerate(todo):
        if k % 200 == 0:
            print(f"  {k}/{len(todo)}", file=sys.stderr, flush=True)
        try:
            real = gbif_cells(genera[g]["name"], genera[g]["taxonomy"][0] if genera[g].get("taxonomy") else "")
        except Exception as e:                                # one bad answer must not stop the run
            skipped[f"fetch failed ({type(e).__name__})"] += 1
            continue
        if real is None:
            skipped["not a genus in GBIF"] += 1
            continue
        real = real.ravel()
        if real.sum() < MIN_CELLS:
            skipped["extinct or hardly recorded alive"] += 1
            continue
        mine = np.zeros(n_cells, bool); found = np.zeros(n_cells, bool)
        ent = order[starts[g]:starts[g + 1]]
        mine[cell_of[ent]] = True
        found[cell_of[ent[sc[ent] == 255]]] = True
        if not mine.any():
            skipped["living, but not on the map"] += 1
            continue
        hit = (mine & real).sum()
        row = (hit / real.sum(), hit / mine.sum(), (found & real).sum() / real.sum())
        rows[groups[genera[g]["group"]]].append(row)
        worst.append((row[1], row[0], genera[g]["name"], groups[genera[g]["group"]], int(mine.sum()), int(real.sum())))
        rich_map += mine; rich_real += real

    allrows = [r for v in rows.values() for r in v]
    out = {"tested": len(todo), "judged": len(allrows), "skipped": dict(skipped), "groups": {}, "places": {}}
    print(f"\nToday test: {len(todo)} kinds checked, {len(allrows)} judged against living records")
    for why, n in skipped.most_common():
        print(f"  left out: {n} {why}")
    print(f"\n{'group':16}{'kinds':>6}{'covered':>9}{'correct':>9}{'finds':>8}   (medians)")
    for name, v in sorted(rows.items(), key=lambda kv: -len(kv[1])) + [("ALL", allrows)]:
        if not v:
            continue
        med = np.median(np.array(v), 0)
        out["groups"][name] = {"kinds": len(v), "covered": round(float(med[0]), 3), "correct": round(float(med[1]), 3),
                               "finds": round(float(med[2]), 3)}
        print(f"{name:16}{len(v):>6}{med[0]:>9.0%}{med[1]:>9.0%}{med[2]:>8.1%}")

    m = land.ravel() & ((rich_map > 0) | (rich_real > 0))
    rho = float(np.corrcoef(ranks(rich_map[m]), ranks(rich_real[m]))[0, 1]) if m.sum() > 2 else float("nan")
    out["richness_rank_correlation_land"] = round(rho, 3)
    print(f"\nKinds per land cell, map against real: rank correlation {rho:.2f}  (1 = same pattern, 0 = unrelated)")
    print(f"\n{'place':20}{'map':>6}{'real':>6}")
    for name, (la, lo) in PLACES.items():
        i = int((90 - la) // 2) * COLS + int((lo + 180) // 2)
        out["places"][name] = [int(rich_map[i]), int(rich_real[i])]
        print(f"{name:20}{int(rich_map[i]):>6}{int(rich_real[i]):>6}")
    lat = np.abs(89.0 - 2 * np.arange(ROWS))[:, None] * np.ones((1, COLS))
    print(f"\n{'latitude':20}{'map':>6}{'real':>6}   (mean kinds per land cell)")
    out["latitude"] = {}
    for a, z in ((0, 15), (15, 30), (30, 45), (45, 60), (60, 90)):
        band = (land & (lat >= a) & (lat < z)).ravel()
        out["latitude"][f"{a}-{z}"] = [round(float(rich_map[band].mean()), 1), round(float(rich_real[band].mean()), 1)]
        print(f"{f'{a}-{z}°':20}{rich_map[band].mean():>6.0f}{rich_real[band].mean():>6.0f}")
    worst.sort()
    print("\nMost invented ranges (correct, covered, kind, group, map cells, real cells):")
    for w in worst[:8]:
        print(f"  {w[0]:.0%} {w[1]:.0%} {w[2]} ({w[3]}) {w[4]} / {w[5]}")
    json.dump(out, open(os.path.join(DATA, "check-today.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
