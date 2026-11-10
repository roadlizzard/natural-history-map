"""Run build-period.sh for every slice in data/slices.json, in N parallel lanes.
Usage: .venv/bin/python scripts/build-all.py [lanes=2]   (logs in cache/logs/<time>.log)
"""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(os.path.join(ROOT, "cache", "logs"), exist_ok=True)


def run(s):
    log = open(os.path.join(ROOT, "cache", "logs", f"{s['time']}.log"), "w")
    code = subprocess.call(["sh", "scripts/build-period.sh", str(s["time"]), s["intervals"], s["label"]],
                           cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    print(f"{s['time']} Ma: {'ok' if code == 0 else 'FAILED, see cache/logs/%s.log' % s['time']}", flush=True)


slices = json.load(open(os.path.join(ROOT, "data", "slices.json")))
with ThreadPoolExecutor(int(sys.argv[1]) if len(sys.argv) > 1 else 2) as pool:
    list(pool.map(run, slices))
