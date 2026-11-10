"""Names for the map besides the ancient continents and seas:
 - today's places (countries and regions) moved to where they sat at that time, so visitors can find home;
 - the terrain itself: the big mountain belts and the shallow seas that flooded the continents,
   found in the ancient elevation grid.

Usage: .venv/bin/python scripts/make-map-names.py <time_ma>   -> data/names-<time>.json
"""
import importlib.util
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from netcache import DATA


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), os.path.join(HERE, name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Present-day places: [name, lng, lat]. Picked so most of today's map has one, without crowding.
MODERN = [
    ["Canada", -105, 58], ["USA", -98, 39], ["Mexico", -102, 23], ["Brazil", -52, -10], ["Argentina", -65, -36],
    ["Greenland", -41, 73], ["UK", -2, 53], ["Spain", -4, 40], ["Germany", 10, 51], ["Scandinavia", 16, 63],
    ["Morocco", -7, 31], ["Egypt", 30, 26], ["Congo", 23, -2], ["South Africa", 24, -30], ["Madagascar", 47, -19],
    ["Arabia", 45, 23], ["Iran", 54, 32], ["India", 78, 21], ["Siberia", 100, 63], ["Mongolia", 103, 46],
    ["China", 108, 33], ["Japan", 138, 36], ["Indonesia", 115, -2], ["Australia", 134, -25],
    ["New Zealand", 172, -42], ["Antarctica", 30, -80],
]
COLS, ROWS = 360, 180
MIN_GAP_DEG = 18                 # keep terrain names of one kind this far apart


def components(mask):
    """Connected groups of True cells (8 neighbours, wrapping east-west) as lists of (row, col)."""
    seen, out = set(), []
    for start in range(COLS * ROWS):
        if not mask[start] or start in seen:
            continue
        stack, comp = [start], []
        seen.add(start)
        while stack:
            i = stack.pop()
            r, c = divmod(i, COLS)
            comp.append((r, c))
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    rr, cc = r + dr, (c + dc) % COLS
                    j = rr * COLS + cc
                    if 0 <= rr < ROWS and mask[j] and j not in seen:
                        seen.add(j)
                        stack.append(j)
        out.append(comp)
    return out


def cell_area(r):
    return math.cos(math.radians(90 - r - 0.5))          # relative area of a 1° cell at that row


def anchor(comp):
    """The cell of a group nearest its centre, so the name sits on the feature itself."""
    x = sum(math.cos(math.radians(c - 180)) for _, c in comp)
    y = sum(math.sin(math.radians(c - 180)) for _, c in comp)
    lon_c = math.degrees(math.atan2(y, x))
    lat_c = sum(90 - r for r, _ in comp) / len(comp)
    best = min(comp, key=lambda rc: (90 - rc[0] - lat_c) ** 2 + (((rc[1] - 180 - lon_c + 180) % 360) - 180) ** 2)
    return best[1] - 180 + 0.5, 90 - best[0] - 0.5


def far_enough(p, placed):
    return all(math.hypot(((p[0] - q[0] + 180) % 360) - 180, p[1] - q[1]) >= MIN_GAP_DEG for q in placed)


def terrain(elev):
    out = []
    kinds = [
        # name, test, smallest group (cells), most to show
        ("Mountains", lambda e: e > 1500, 6, 5),
        ("Shallow sea", lambda e: -200 < e <= 0, 30, 5),
    ]
    for name, test, min_cells, most in kinds:
        groups = [g for g in components([test(e) for e in elev]) if len(g) >= min_cells]
        groups.sort(key=lambda g: -sum(cell_area(r) for r, _ in g))
        placed = []
        for g in groups:
            p = anchor(g)
            if far_enough(p, placed):
                placed.append(p)
                high = max(elev[r * COLS + c] for r, c in g)
                label = name if name != "Mountains" or high > 2500 else "Highlands"
                out.append({"name": label, "kind": "terrain", "lng": round(p[0], 2), "lat": round(p[1], 2)})
            if len(placed) >= most:
                break
    return out


def main(time_ma):
    _, _, elev = load("fetch-paleodem").grid(time_ma)
    moved = load("reconstruct-points").reconstruct([(m[1], m[2]) for m in MODERN], time_ma)
    names = [{"name": m[0], "kind": "modern", "lng": round(p[0], 2), "lat": round(p[1], 2)}
             for m, p in zip(MODERN, moved) if p]
    names += terrain(elev)
    path = os.path.join(DATA, f"names-{time_ma:g}.json")
    with open(path, "w") as f:
        json.dump(names, f, indent=1)
    print(f"{time_ma:g} Ma: {sum(n['kind'] == 'modern' for n in names)} present-day places, "
          f"{sum(n['kind'] == 'terrain' for n in names)} terrain names -> {os.path.basename(path)}")


if __name__ == "__main__":
    main(float(sys.argv[1]))
