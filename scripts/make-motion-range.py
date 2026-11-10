"""Build the motion frames for one stretch of time now, ahead of the full run (same output, same caches).
Usage: .venv/bin/python scripts/make-motion-range.py <old_ma> <young_ma>     e.g. 510 450
"""
import importlib.util, os, sys
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m", os.path.join(HERE, "make-motion-frames.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
old, young = int(sys.argv[1]), int(sys.argv[2])
os.makedirs(m.WORK, exist_ok=True); os.makedirs(m.OUT, exist_ok=True)
steps = list(range(young - young % 5, old + 1, 5))
with ThreadPoolExecutor(4) as pool:
    list(pool.map(lambda t: (m.elevation(t), m.positions(t)), steps))
for t in sorted(steps, reverse=True):
    if t - m.STEP >= young - 4:
        m.make_pair(t)
        print(f"frames {t}..{t - 4}", flush=True)
m.colour(m.elevation(young).astype("float32")).save(os.path.join(m.OUT, f"{young}.jpg"), quality=74, optimize=True)
print("done", old, young)
