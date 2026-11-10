"""Look after the period builds on this Mac:
 - publish each period as soon as its build finishes (scripts/publish.sh);
 - if a build crashes, start it again (up to MAX_TRIES times; downloads are cached, so it resumes);
 - every few minutes, report each period's state to Cloudflare (the `builds` table), where the cron
   flags reports that stop coming (Mac asleep or offline) and /status shows it all.
Exits when every period is live, or when nothing is left running and the rest have used up their retries.
Usage: .venv/bin/python scripts/watch-builds.py     (log in cache/logs/watch.log)
"""
import datetime
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ("slice-{t}.json", "genus-info-{t}.json", "life-images-{t}.json", "terrain/{t}", "terrain/{t}-flat.jpg")
MAX_TRIES = 3
REPORT_EVERY = 300          # seconds
slices = {f"{s['time']:g}": s for s in json.load(open(os.path.join(ROOT, "data", "slices.json")))}
tries = {t: 0 for t in slices}
last_report = 0


def built(t):
    return all(os.path.exists(os.path.join(ROOT, "data", f.format(t=t))) for f in FILES)


def live(t):
    return os.path.exists(os.path.join(ROOT, "cache", f"published-{t}"))


def running(t):
    out = subprocess.run(["pgrep", "-f", f"build-period.sh {t} "], capture_output=True, text=True).stdout.split()
    return bool(out)


def last_line(t):
    try:
        with open(os.path.join(ROOT, "cache", "logs", f"{t}.log"), "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - 1500))
            lines = [l for l in f.read().decode(errors="replace").replace("\r", "\n").splitlines() if l.strip()]
        return lines[-1][:300] if lines else ""
    except OSError:
        return ""


def restart(t):
    s = slices[t]
    log = open(os.path.join(ROOT, "cache", "logs", f"{t}.log"), "a")
    subprocess.Popen(["sh", "scripts/build-period.sh", t, s["intervals"], s["label"]], cwd=ROOT,
                     stdout=log, stderr=subprocess.STDOUT, start_new_session=True)


def report(states):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    q = lambda v: "'" + str(v).replace("'", "''") + "'"
    sql = " ".join(f"INSERT INTO builds (time, state, detail, tries, updated) VALUES ({q(t)}, {q(st)}, {q(d)}, {tries[t]}, {q(now)}) "
                   f"ON CONFLICT(time) DO UPDATE SET state=excluded.state, detail=excluded.detail, tries=excluded.tries, updated=excluded.updated;"
                   for t, (st, d) in states.items())
    r = subprocess.run(["npx", "wrangler", "d1", "execute", "natural-history-map", "--remote", "--command", sql],
                       cwd=ROOT, capture_output=True, text=True)
    if r.returncode:
        print("status report failed:", r.stderr[-300:], flush=True)


while True:
    states = {}
    for t in slices:
        if live(t):
            states[t] = ("live", "")
        elif built(t):
            code = subprocess.call(["sh", "scripts/publish.sh", t], cwd=ROOT,
                                   stdout=open(os.path.join(ROOT, "cache", "logs", "publish.log"), "a"), stderr=subprocess.STDOUT)
            states[t] = ("live", "") if code == 0 else ("failed", "publishing failed (cache/logs/publish.log)")
            print(f"{t} Ma: {states[t][0]}", flush=True)
        elif running(t):
            states[t] = ("running", last_line(t))
        elif tries[t] < MAX_TRIES:
            tries[t] += 1
            states[t] = ("retrying", f"try {tries[t]} after: {last_line(t)}")
            print(f"{t} Ma crashed, restarting (try {tries[t]}): {last_line(t)}", flush=True)
            restart(t)
        else:
            states[t] = ("failed", last_line(t))
    if time.time() - last_report > REPORT_EVERY or all(s == "live" for s, _ in states.values()):
        report(states)
        last_report = time.time()
    if all(s == "live" for s, _ in states.values()):
        print("every period is live", flush=True)
        break
    if all(s in ("live", "failed") for s, _ in states.values()):
        print("stopped: these need a fix:", [t for t, (s, _) in states.items() if s == "failed"], flush=True)
        sys.exit(1)
    time.sleep(60)
