"""Hand judgment work to the Cloudflare agent and collect its checked answers.

The Worker (worker/index.js) runs a cron that takes pending jobs from D1, asks Workers AI, checks each
answer with plain code and saves it. This script fills the queue from the built data and pulls results back.

Usage:
  .venv/bin/python scripts/agent-jobs.py push <time_ma> [<time_ma> ...]   queue images, habitats, descriptions, labels
  .venv/bin/python scripts/agent-jobs.py tours                            queue the guided tours (after slices exist)
  .venv/bin/python scripts/agent-jobs.py ready                            mark built slices in data/slices.json
  .venv/bin/python scripts/agent-jobs.py tours-if-complete                queue tours once every slice is ready
  .venv/bin/python scripts/agent-jobs.py status                           counts by kind and status
  .venv/bin/python scripts/agent-jobs.py pull                             write data/agent/*.json, labels, blurbs
"""
import collections
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "agent")
DB = "natural-history-map"
DESCRIBE_PER_SLICE = 40          # most-found genera with no article get a written description
DESCRIBE_PER_NEW_GROUP = 15      # ...plus this many of each group added in the 2026-11-10 accuracy pass
NEW_GROUPS = {"bryozoans", "graptolites", "conodonts", "forams", "algae"}


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), os.path.join(HERE, name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def d1(sql=None, file=None):
    cmd = ["npx", "wrangler", "d1", "execute", DB, "--remote", "--json"]
    cmd += ["--file", file] if file else ["--command", sql]
    out = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if out.returncode:
        sys.exit(out.stderr[-1500:] or out.stdout[-1500:])
    if file:
        return []
    return json.loads(out.stdout)[0]["results"]


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def push_jobs(jobs):
    """jobs: list of (id, kind, priority, input). Existing ids are left alone."""
    if not jobs:
        return
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        for jid, kind, pri, inp in jobs:
            f.write(f"INSERT OR IGNORE INTO jobs (id, kind, priority, input) VALUES "
                    f"({q(jid)}, {q(kind)}, {int(pri)}, {q(json.dumps(inp, ensure_ascii=False))});\n")
    d1(file=f.name)
    os.unlink(f.name)
    print(f"queued up to {len(jobs)} jobs ({collections.Counter(j[1] for j in jobs)})")


def read(name, time_ma, default=None):
    p = os.path.join(DATA, f"{name}-{time_ma:g}.json")
    return json.load(open(p)) if os.path.exists(p) else default


def occurrences(slice_):
    n = collections.Counter()
    where = collections.defaultdict(collections.Counter)
    forms = collections.defaultdict(collections.Counter)
    for lng, lat, occ, cc in slice_["sites"]:
        for g, f, k in occ:
            n[g] += k
            if cc:
                where[g][cc] += k
            if slice_["formations"][f]:
                forms[g][slice_["formations"][f]] += k
    return n, where, forms


def article(info, life):
    text = (info or {}).get("text", "")
    for title, body in (life or {}).get("sections", []):
        text += f"\n{title}: {body}"
    return text.strip()


# Present-day points moved back in time, so the agent knows where each landmass sat.
ANCHORS = [("North America", -100, 42), ("Greenland", -42, 72), ("South America", -58, -12), ("Africa", 22, 8),
           ("Arabia", 45, 24), ("Europe", 12, 48), ("Scandinavia", 18, 62), ("Siberia", 100, 62),
           ("China", 110, 32), ("India", 78, 20), ("Antarctica", 20, -78), ("Australia", 134, -25)]


def slice_job(time_ma, slice_, label):
    paleodem = load("fetch-paleodem")
    _, _, elev = paleodem.grid(time_ma)
    mask = "".join("#" if e > 0 else "~" if e > -200 else "." for e in elev)
    rows = []
    for r in range(0, 180, 5):
        rows.append("".join("#" if sum(elev[(r + i) * 360 + c + j] > 0 for i in range(5) for j in range(5)) >= 13
                            else "." for c in range(0, 360, 5)))
    moved = load("reconstruct-points").reconstruct([(a[1], a[2]) for a in ANCHORS], time_ma)
    anchors = "; ".join(f"{a[0]} at {p[0]:.0f},{p[1]:.0f}" for a, p in zip(ANCHORS, moved) if p)
    n, _, _ = occurrences(slice_)
    groups = collections.Counter()
    for g, k in n.items():
        groups[slice_["groups"][slice_["genera"][g]["group"]]] += k
    top = ", ".join(slice_["genera"][g]["name"] for g, _ in n.most_common(12))
    life = "groups by records: " + ", ".join(f"{k} {v}" for k, v in groups.most_common(6)) + f". Genera: {top}"
    return (f"slice:{time_ma:g}", "slice", 100,
            {"time": time_ma, "label": label, "grid": "\n".join(rows), "mask": mask, "anchors": anchors, "life": life})


def push(time_ma):
    slice_ = read("slice", time_ma)
    if not slice_:
        sys.exit(f"no data/slice-{time_ma:g}.json yet")
    info, taxa = read("genus-info", time_ma, {}), read("taxon-info", time_ma, {})
    life, life_images = read("life", time_ma, {}), read("life-images", time_ma, {})
    n, where, forms = occurrences(slice_)
    # Hand-checked names (the 150 Ma slice) are kept; other slices get the agent's.
    jobs = [] if os.path.exists(os.path.join(DATA, f"labels-{time_ma:g}.json")) else [slice_job(time_ma, slice_, slice_["label"])]
    for gi, g in enumerate(slice_["genera"]):
        name, group = g["name"], slice_["groups"][g["group"]]
        tax = " > ".join(t for t in g["taxonomy"] if t)
        weight = min(30, n[gi] // 5)
        for pic, pri in ((life_images.get(name), 60), ((info.get(name) or {}).get("image"), 40)):
            if pic:
                jobs.append((f"image:{pic['path']}", "image", pri + weight,
                             {"genus": name, "group": group, "taxonomy": tax, "path": pic["path"],
                              "caption": (pic.get("caption") or "")[:200]}))
        text = article(info.get(name), life.get(name))
        if len(text) >= 200:
            jobs.append((f"habitat:{name}", "habitat", 30 + weight, {"genus": name, "group": group, "text": text[:3000]}))
    # Descriptions for the most-found genera with no article, written only from PBDB facts.
    missing = [gi for gi, _ in n.most_common() if len((info.get(slice_["genera"][gi]["name"]) or {}).get("text", "")) < 200]
    chosen = missing[:DESCRIBE_PER_SLICE]
    for grp in NEW_GROUPS:
        chosen += [gi for gi in missing if slice_["groups"][slice_["genera"][gi]["group"]] == grp
                   and gi not in chosen][:DESCRIBE_PER_NEW_GROUP]
    for gi in chosen:
        g = slice_["genera"][gi]
        name = g["name"]
        eco = (life.get(name) or {}).get("eco", {})
        lines = [f"Genus: {name}", f"Group on the map: {slice_['groups'][g['group']]}",
                 "Classification (phylum > class > order > family): " + " > ".join(t or "?" for t in g["taxonomy"])]
        if g.get("range"):
            lines.append(f"Known from {g['range'][0]:g} to {g['range'][1]:g} million years ago")
        lines += [f"{k.replace('_', ' ')}: {v}" for k, v in eco.items()]
        lines.append(f"Fossil records in this {slice_['label']} map: {n[gi]}")
        if forms[gi]:
            lines.append("Rock formations: " + ", ".join(f for f, _ in forms[gi].most_common(4)))
        if where[gi]:
            lines.append("Found today in (country codes): " + ", ".join(c for c, _ in where[gi].most_common(5)))
        for t in reversed([t for t in g["taxonomy"] if t]):
            if (taxa.get(t) or {}).get("text"):
                lines.append(f"About the {t}: {taxa[t]['text'][:600]}")
                break
        jobs.append((f"describe:{name}", "describe", 20 + min(30, n[gi] // 5), {"genus": name, "facts": "\n".join(lines)}))
    push_jobs(jobs)
    requeue_regrouped(jobs, slice_)


def requeue_regrouped(jobs, slice_):
    """Jobs queued before a genus moved to a new group (a conodont once filed as fish, an alga as a plant)
    asked the model the wrong question. Give them the new input and run them again."""
    group_of = {g["name"]: slice_["groups"][g["group"]] for g in slice_["genera"]}
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        k = 0
        for jid, kind, _pri, inp in jobs:
            group = group_of.get(inp.get("genus"))
            if group not in NEW_GROUPS:
                continue
            stale = (f"json_extract(input, '$.group') != {q(group)}" if kind in ("image", "habitat")
                     else f"instr(input, {q('Group on the map: ' + group + chr(92) + 'n')}) = 0")
            f.write(f"UPDATE jobs SET input = {q(json.dumps(inp, ensure_ascii=False))}, status = 'pending', tries = 0, "
                    f"result = NULL, error = NULL WHERE id = {q(jid)} AND {stale};\n")
            k += 1
    if k:
        d1(file=f.name)
    os.unlink(f.name)
    print(f"checked {k} jobs of the new groups for stale inputs", file=sys.stderr)


THEMES = [
    ("sea-to-land", "From sea to land: how animals and plants moved out of the water"),
    ("dinosaurs", "The rise and fall of the dinosaurs"),
    ("ancient-seas", "Life in the ancient seas, from trilobites to sea reptiles"),
    ("mammals", "How mammals went from tiny to taking over"),
]


def tours():
    slices = json.load(open(os.path.join(DATA, "slices.json")))
    allowed, choices, facts = {}, [], []
    for s in slices:
        t = s["time"]
        slice_, info = read("slice", t), read("genus-info", t, {})
        if not slice_:
            continue
        n, _, _ = occurrences(slice_)
        good = [gi for gi, _ in n.most_common() if len(info.get(slice_["genera"][gi]["name"], {}).get("text", "")) >= 200
                and info[slice_["genera"][gi]["name"]].get("image")][:14]
        names = [slice_["genera"][gi]["name"] for gi in good]
        allowed[str(t)] = names
        choices.append(f"{t:g} ({s['label']}): " + ", ".join(
            f"{slice_['genera'][gi]['name']} [{slice_['groups'][slice_['genera'][gi]['group']]}]" for gi in good))
        for gi in good:
            first = re.split(r"(?<=[a-z]\.)\s", info[slice_["genera"][gi]["name"]]["text"])[0]
            facts.append(f"{slice_['genera'][gi]['name']}: {first[:220]}")
    jobs = [(f"tour:{key}", "tour", 90, {"theme": theme, "choices": "\n".join(choices),
                                         "facts": "\n".join(facts)[:12000], "allowed": allowed})
            for key, theme in THEMES]
    push_jobs(jobs)


def status():
    for r in d1("SELECT kind, status, COUNT(*) AS n FROM jobs GROUP BY kind, status ORDER BY kind, status"):
        print(f"{r['kind']:9} {r['status']:8} {r['n']}")
    for r in d1("SELECT id, error FROM jobs WHERE status = 'failed' LIMIT 8"):
        print("failed:", r["id"], "-", (r["error"] or "")[:140])


def built(t):
    return all(os.path.exists(os.path.join(DATA, f)) for f in
               (f"slice-{t}.json", f"genus-info-{t}.json", f"life-images-{t}.json", f"terrain/{t}", f"terrain/{t}-flat.jpg"))


def ready():
    path = os.path.join(DATA, "slices.json")
    slices = json.load(open(path))
    for s in slices:
        t = f"{s['time']:g}"
        s["ready"] = built(t)
        # A map can be shown (terrain, fossils at their ancient positions) before the article text is in.
        s["map"] = all(os.path.exists(os.path.join(DATA, f)) for f in (f"slice-{t}.json", f"terrain/{t}", f"terrain/{t}-flat.jpg"))
    with open(path, "w") as f:
        json.dump(slices, f, indent=1)
    print("ready:", [s["time"] for s in slices if s["ready"]])
    return all(s["ready"] for s in slices)


def pull():
    os.makedirs(OUT, exist_ok=True)
    rows = d1("SELECT id, kind, result FROM jobs WHERE status = 'done'")
    by = collections.defaultdict(dict)
    for r in rows:
        by[r["kind"]][r["id"].split(":", 1)[1]] = json.loads(r["result"])
    for kind, name in (("image", "images"), ("habitat", "habitats"), ("describe", "descriptions"), ("tour", "tours")):
        with open(os.path.join(OUT, f"{name}.json"), "w") as f:
            json.dump(by[kind], f, ensure_ascii=False, indent=None if kind != "tour" else 1)
    slices = json.load(open(os.path.join(DATA, "slices.json")))
    for s in slices:
        t = f"{s['time']:g}"
        s["ready"] = all(os.path.exists(os.path.join(DATA, f)) for f in
                         (f"slice-{t}.json", f"genus-info-{t}.json", f"life-images-{t}.json", f"terrain/{t}", f"terrain/{t}-flat.jpg"))
        res = by["slice"].get(t)
        if res:
            s["blurb"] = res["blurb"]
            with open(os.path.join(DATA, f"labels-{s['time']:g}.json"), "w") as f:
                json.dump([{"name": l["name"], "kind": l["kind"], "lng": round(l["lng"], 2), "lat": round(l["lat"], 2)}
                           for l in res["labels"]], f, indent=1)
    with open(os.path.join(DATA, "slices.json"), "w") as f:
        json.dump(slices, f, indent=1)
    print({k: len(v) for k, v in by.items()})


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "push":
        for t in sys.argv[2:]:
            push(float(t))
    elif cmd == "tours":
        tours()
    elif cmd == "ready":
        ready()
    elif cmd == "tours-if-complete":
        if ready():
            tours()
        else:
            print("not every slice is built yet; tours wait")
    elif cmd == "pull":
        pull()
    else:
        status()
