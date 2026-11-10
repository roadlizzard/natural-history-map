"""Refresh every period from the latest PBDB records, check the result, and get it ready to deploy.

1. Copy the current data (the last good build) to cache/last-good/.
2. Fetch PBDB again (only PBDB: plate positions, climate grids and Wikipedia stay cached), then rebuild each
   period: fossils, articles, ecology, pictures, names, ranges, habitats and zones.
3. Run scripts/check-data.py against the last good build.
4. Checks pass and something changed: leave the new data in place and mark it ready (cache/refresh/ready);
   deploying it is a separate step, scripts/deploy-refresh.sh, run only after a person says yes.
   Checks fail or a step crashes: put the last good data back. Nothing changed: nothing to deploy.
A report goes to cache/refresh/<date>.md either way, and the last line printed is its verdict
(READY / NO CHANGE / FAILED), for whatever runs this on a schedule.

Usage: .venv/bin/python scripts/refresh.py [--lanes 3] [--only 150,510] [--discard]
"""
import argparse
import datetime
import fcntl
import glob
import json
import os
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA, CACHE = os.path.join(ROOT, "data"), os.path.join(ROOT, "cache")
GOOD, OUT = os.path.join(CACHE, "last-good"), os.path.join(CACHE, "refresh")
PY = os.path.join(ROOT, ".venv", "bin", "python")
# Per-period files a refresh rewrites (and so backs up and can put back).
FILES = ["slice-{t}.json", "genus-info-{t}.json", "taxon-info-{t}.json", "life-{t}.json", "life-images-{t}.json",
         "names-{t}.json", "ranges-{t}.json", "habitat-{t}.bin", "zones-{t}.bin", "zones-{t}.json", "pictures-{t}.json"]
STEPS = ["fetch-genus-info", "fetch-life-history", "fetch-life-images", "make-map-names", "make-life-ranges",
         "make-habitats", "make-zones", "make-pictures"]


def run_period(s, env):
    t = s["time"]
    log = open(os.path.join(CACHE, "logs", f"refresh-{t}.log"), "w")
    started = time.time()
    for cmd in [["build-slice", str(t), s["intervals"], s["label"]]] + [[step, str(t)] for step in STEPS]:
        log.write(f"\n=== {' '.join(cmd)}\n"); log.flush()
        step_start = time.time()
        code = subprocess.call([PY, os.path.join(ROOT, "scripts", cmd[0] + ".py")] + cmd[1:],
                               cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
        log.write(f"\n=== {cmd[0]} took {time.time() - step_start:.0f} s\n")
        if code:
            return t, f"{cmd[0]} failed (exit {code}), see cache/logs/refresh-{t}.log"
    print(f"{t:>4} Ma rebuilt in {time.time() - started:.0f} s", flush=True)
    return t, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lanes", type=int, default=3)
    ap.add_argument("--only")
    ap.add_argument("--discard", action="store_true", help="put the last good data back and drop a READY refresh")
    a = ap.parse_args()
    if a.discard:
        for f in glob.glob(os.path.join(GOOD, "*")):
            if not f.endswith("slices.json"):
                shutil.copy2(f, DATA)
        if os.path.exists(os.path.join(OUT, "ready")):
            os.remove(os.path.join(OUT, "ready"))
        print("discarded: data/ is back to the last good build")
        return
    os.makedirs(OUT, exist_ok=True); os.makedirs(os.path.join(CACHE, "logs"), exist_ok=True)
    lock = open(os.path.join(OUT, "lock"), "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        sys.exit("FAILED: another refresh is running")
    if os.path.exists(os.path.join(OUT, "ready")):
        sys.exit("FAILED: the last refresh is still waiting to be deployed (scripts/deploy-refresh.sh) or "
                 "discarded (rm cache/refresh/ready)")

    slices = json.load(open(os.path.join(DATA, "slices.json")))
    if a.only:
        keep = {float(x) for x in a.only.split(",")}
        slices = [s for s in slices if s["time"] in keep]
    times = [s["time"] for s in slices]

    # 1. the last good build
    shutil.rmtree(GOOD, ignore_errors=True); os.makedirs(GOOD)
    shutil.copy(os.path.join(DATA, "slices.json"), GOOD)
    for t in times:
        for f in FILES:
            p = os.path.join(DATA, f.format(t=t))
            if os.path.exists(p):
                shutil.copy2(p, GOOD)

    # 2. rebuild with fresh PBDB answers
    env = dict(os.environ, NETCACHE_FRESH="pbdb", NETCACHE_SINCE=str(time.time()))
    started = datetime.datetime.now()
    with ThreadPoolExecutor(a.lanes) as pool:
        crashed = {t: err for t, err in pool.map(lambda s: run_period(s, env), slices) if err}

    # 3. checks
    check_json = os.path.join(OUT, "check.json")
    checked = subprocess.run([PY, os.path.join(ROOT, "scripts", "check-data.py"), "--against", GOOD, "--json", check_json],
                             cwd=ROOT, capture_output=True, text=True)
    report = json.load(open(check_json)) if os.path.exists(check_json) else {}
    report = {k: v for k, v in report.items() if float(k) in times}
    failed = bool(crashed) or any(v["fail"] for v in report.values())
    changed = any(v["note"] for v in report.values())

    # 4. verdict
    if failed:
        for f in glob.glob(os.path.join(GOOD, "*")):
            if not f.endswith("slices.json"):
                shutil.copy2(f, DATA)
        verdict = "FAILED"
    elif changed:
        open(os.path.join(OUT, "ready"), "w").write(started.isoformat())
        verdict = "READY"
    else:
        verdict = "NO CHANGE"

    day = started.strftime("%Y-%m-%d")
    lines = [f"# Data refresh {day}", "",
             f"**{verdict}** · started {started:%H:%M}, took {(datetime.datetime.now() - started).seconds // 60} min · "
             f"PBDB re-fetched for {len(times)} periods", ""]
    if verdict == "READY":
        lines += ["Every check passed and the data changed. The new data is in `data/` but **not live**.",
                  "Deploy: `sh scripts/deploy-refresh.sh` · Discard: `.venv/bin/python scripts/refresh.py --discard`", ""]
    elif verdict == "FAILED":
        lines += ["Something failed, so the last good data was put back. Nothing changed on the site.", ""]
    for t, err in sorted(crashed.items(), key=lambda kv: -kv[0]):
        lines.append(f"- **{t:g} Ma crashed:** {err}")
    lines += ["", "| Period | Result | Genera | Sites | Occurrences | Other | Details |", "|---|---|---|---|---|---|---|"]
    for k, v in sorted(report.items(), key=lambda kv: -float(kv[0])):
        st = v["stats"]
        res = "FAIL" if v["fail"] else ("changed" if v["note"] else "same")
        detail = "; ".join(v["fail"] + v["note"]).replace("|", "/")
        lines.append(f"| {float(k):g} Ma {v['label']} | {res} | {st.get('genera', '')} | {st.get('sites', '')} | "
                     f"{st.get('occurrences', '')} | {st.get('other', 0):.1%} | {detail} |")
    lines += ["", "Full check output:", "```", checked.stdout.strip() + checked.stderr.strip()[-2000:], "```"]
    path = os.path.join(OUT, f"{day}.md")
    open(path, "w").write("\n".join(lines) + "\n")
    print(f"report: {path}")
    print(verdict)


if __name__ == "__main__":
    main()
