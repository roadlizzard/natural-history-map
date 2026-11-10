"""How each genus lived: PBDB ecology (habitat, movement, way of life, diet) for every genus, plus the
behaviour / diet / paleobiology sections of its Wikipedia article where it has one.

Needs data/slice-<time>.json and data/genus-info-<time>.json (run fetch-genus-info.py first).
Writes data/life-<time>.json: {genus name: {"eco": {...}, "sections": [[heading, text], ...]}}
Usage: python3 scripts/fetch-life-history.py <time_ma>
"""
import importlib.util
import json
import os
import re
import sys
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from netcache import DATA, fetch_json

spec = importlib.util.spec_from_file_location("fetch_genus_info", os.path.join(HERE, "fetch-genus-info.py"))
genus_info = importlib.util.module_from_spec(spec)
spec.loader.exec_module(genus_info)

PBDB = "https://paleobiodb.org/data1.2/taxa/list.json?show=ecospace&id="
WIKI = "https://en.wikipedia.org/w/api.php"
ECO_FIELDS = {"jev": "environment", "jmo": "motility", "jlh": "life_habit", "jdt": "diet"}

# The three things a card says about an animal, and the Wikipedia headings each can come from (best first).
# Anything about naming, history of research or the rock formation is skipped.
WANTED = {
    "Appearance": [r"^description$|appearance|anatomy|morpholog|size|features|skeleton|skull"],
    "Feeding": [r"diet|feeding|food|predat|hunting|prey"],
    "How it lived": [r"behavio|social|herd|nest|reproduc|parental|growth", r"locomot|movement|posture|swimming|flight|gait",
                     r"palaeobiology|paleobiology|biology|life ?style|habit"],
}
SECTION_CHARS = 700


def ecology(genera):
    """{genus name: {environment, motility, life_habit, diet}} from PBDB, 200 taxa per request."""
    ids = sorted({str(g["tid"]) for g in genera})
    by_id = {}
    for i in range(0, len(ids), 200):
        for t in fetch_json(PBDB + ",".join(ids[i:i + 200]), "pbdb")["records"]:
            eco = {name: t[k].strip('"') for k, name in ECO_FIELDS.items() if t.get(k)}
            if eco:
                by_id[t["oid"].replace("txn:", "")] = eco
    return {g["name"]: by_id[str(g["tid"])] for g in genera if str(g["tid"]) in by_id}


def sections(title):
    """[[Appearance|Feeding|How it lived, text], ...]: one Wikipedia section for each, where the article has one."""
    params = {"action": "query", "format": "json", "formatversion": "2", "prop": "extracts",
              "explaintext": "1", "exsectionformat": "wiki", "redirects": "1", "titles": title}
    pages = fetch_json(WIKI + "?" + urllib.parse.urlencode(params), "wikipedia", pause=2.0)["query"]["pages"]
    text = pages[0].get("extract", "") if pages else ""
    best = {}
    for m in re.finditer(r"^(=+)\s*(.+?)\s*\1\s*$", text, re.M):
        start = m.end()
        nxt = re.search(r"^=+\s*.+?\s*=+\s*$", text[start:], re.M)
        body = genus_info.clean(text[start:start + nxt.start()] if nxt else text[start:])
        if len(body) < 80:
            continue
        for label, pats in WANTED.items():
            rank = next((i for i, pat in enumerate(pats) if re.search(pat, m.group(2), re.I)), None)
            if rank is not None and (label not in best or rank < best[label][0]):
                best[label] = (rank, genus_info.trim(body)[:SECTION_CHARS + 50])
            if rank is not None:
                break
    return [[label, best[label][1]] for label in WANTED if label in best]


def main(time_ma):
    slice_ = json.load(open(os.path.join(DATA, f"slice-{time_ma:g}.json")))
    info = json.load(open(os.path.join(DATA, f"genus-info-{time_ma:g}.json")))
    eco = ecology(slice_["genera"])
    print(f"PBDB ecology for {len(eco)} of {len(slice_['genera'])} genera", file=sys.stderr)

    life = {name: {"eco": e} for name, e in eco.items()}
    for i, (name, entry) in enumerate(sorted(info.items())):
        secs = sections(entry["title"])
        if secs:
            life.setdefault(name, {})["sections"] = secs
        print(f"\rarticles {i + 1}/{len(info)}", end="", file=sys.stderr)
    print(file=sys.stderr)

    path = os.path.join(DATA, f"life-{time_ma:g}.json")
    with open(path, "w") as f:
        json.dump(life, f, separators=(",", ":"), ensure_ascii=False)
    with_secs = sum(1 for v in life.values() if v.get("sections"))
    print(f"{len(life)} genera with ecology or behaviour text ({with_secs} with Wikipedia sections) "
          f"-> {os.path.basename(path)} ({os.path.getsize(path) // 1024} KB)")


if __name__ == "__main__":
    main(float(sys.argv[1]))
