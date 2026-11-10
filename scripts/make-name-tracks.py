"""Where each of today's places (the gold names) sat every 5 million years, 0-540 Ma, from the plate model,
so the names can ride along with the moving continents during time travel.
Usage: .venv/bin/python scripts/make-name-tracks.py   -> data/name-tracks.json
"""
import importlib.util, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from netcache import DATA


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), os.path.join(HERE, name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


MODERN = load("make-map-names").MODERN
reconstruct = load("reconstruct-points").reconstruct
times = list(range(0, 541, 5))
tracks = {m[0]: [] for m in MODERN}
for t in times:
    moved = [(m[1], m[2]) for m in MODERN] if t == 0 else reconstruct([(m[1], m[2]) for m in MODERN], t)
    for m, p in zip(MODERN, moved):
        tracks[m[0]].append([round(p[0], 2), round(p[1], 2)] if p else None)
    print(f"\r{t} Ma", end="", file=sys.stderr)
json.dump({"step": 5, "tracks": tracks}, open(os.path.join(DATA, "name-tracks.json"), "w"), separators=(",", ":"))
print("\nwrote data/name-tracks.json")
