"""Names for the ancient land and seas, placed by moving present-day reference points back in time
with the same plate model, then checked against the ancient elevation (land names on land, seas on sea).

Usage: python3 scripts/make-paleo-labels.py <time_ma>   -> data/labels-<time>.json
"""
import importlib.util
import json
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


reconstruct = load("reconstruct-points").reconstruct
paleodem = load("fetch-paleodem")

# [name, kind, present-day lng, lat]. kind: "super" (supercontinent), "land", "sea".
# Fixed ancient positions (no present-day equivalent) are given as [name, kind, None, None, lng, lat].
LABELS = {
    150: [
        ["Laurasia", "super", 70, 62],
        ["Gondwana", "super", 25, -25],
        ["North America", "land", -100, 42],
        ["South America", "land", -58, -12],
        ["Africa", "land", 22, 8],
        ["European islands", "land", 12, 48],
        ["Asia", "land", 100, 52],
        ["India", "land", 78, 20],
        ["Antarctica", "land", 20, -78],
        ["Australia", "land", 134, -25],
        ["Tethys Ocean", "sea", None, None, 50, 12],
        ["Young Atlantic", "sea", None, None, -15, 28],
        ["Panthalassa Ocean", "sea", None, None, -150, 5],
    ],
}


def main(time_ma):
    rows = LABELS[int(time_ma)]
    present = [(r[2], r[3]) for r in rows if r[2] is not None]
    moved = iter(reconstruct(present, time_ma))
    _, _, grid = paleodem.grid(time_ma)
    out = []
    for r in rows:
        name, kind = r[0], r[1]
        pos = next(moved) if r[2] is not None else (r[4], r[5])
        if pos is None:
            print(f"{name}: no plate at this time, skipped")
            continue
        col, row = int(round(pos[0] + 180)) % 360, max(0, min(179, int(round(90 - pos[1]))))
        elev = grid[row * 360 + col]
        ok = elev <= 0 if kind == "sea" else elev > -200
        print(f"{name:20} {kind:5} -> {pos[0]:7.1f},{pos[1]:6.1f}  elev {elev:6d}  {'ok' if ok else 'CHECK'}")
        out.append({"name": name, "kind": kind, "lng": round(pos[0], 2), "lat": round(pos[1], 2), "ok": ok})
    with open(os.path.join(DATA, f"labels-{time_ma:g}.json"), "w") as f:
        json.dump([o for o in out if o["ok"]], f, indent=1)


if __name__ == "__main__":
    main(float(sys.argv[1]))
