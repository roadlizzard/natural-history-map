"""One picture for every kind of life a click can show in a period, from the pictures already on disk.

In order of preference: a picture of it alive (made for any period), its Wikipedia article's own picture
(often a fossil), or a close relative's picture of it alive (same family, then order). Each says which it is.
Writes data/pictures-<time>.json: {genus name: {path, kind: "alive"|"article"|"relative", of, credit}}.

Usage: python3 scripts/make-pictures.py <time_ma> [<time_ma> ...]
"""
import collections, glob, hashlib, json, os, sys
import numpy as np

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
N, SLOTS = 90 * 180, 30


def credit(v):
    return ", ".join(x for x in [(v.get("artist") or "").split("http")[0].strip()[:60], v.get("license") or ""] if x)


def build(time):
    life, art, rel = {}, {}, collections.defaultdict(list)
    for f in glob.glob(os.path.join(DATA, "life-images-*.json")):
        for k, v in json.load(open(f)).items():
            if isinstance(v, dict) and v.get("path"): life.setdefault(k, v)
    for f in glob.glob(os.path.join(DATA, "genus-info-*.json")):
        for k, v in json.load(open(f)).items():
            if isinstance(v, dict) and (v.get("image") or {}).get("path"): art.setdefault(k, v["image"])
    for f in glob.glob(os.path.join(DATA, "slice-*.json")):
        for g in json.load(open(f))["genera"]:
            if g["name"] in life:
                for rank in (3, 2):
                    if len(g["taxonomy"]) > rank and g["taxonomy"][rank]: rel[(rank, g["taxonomy"][rank])].append(g["name"])
    sl = json.load(open(os.path.join(DATA, f"slice-{time}.json")))
    b = open(os.path.join(DATA, f"habitat-{time}.bin"), "rb").read()
    off = np.frombuffer(b[:(N + 1) * 4], dtype="<u4"); total = int(off[-1])
    shown = set(np.frombuffer(b[(N + 1) * 4:(N + 1) * 4 + total * 2], dtype="<u2").tolist())
    out, kinds = {}, collections.Counter()
    for g in shown:
        gen = sl["genera"][g]; n = gen["name"]
        if n in life:
            v = life[n]; out[n] = {"path": v["path"], "kind": "alive", "credit": credit(v)}
        elif n in art:
            v = art[n]; out[n] = {"path": v["path"], "kind": "article", "credit": credit(v)}
        else:
            for rank in (3, 2):
                t = gen["taxonomy"][rank] if len(gen["taxonomy"]) > rank else None
                if t and rel.get((rank, t)):
                    r = sorted(rel[(rank, t)])[0]; v = life[r]
                    out[n] = {"path": v["path"], "kind": "relative", "of": r, "credit": credit(v)}; break
        kinds[out[n]["kind"] if n in out else "none"] += 1
    # Kinds whose pictures are the same image (two articles sharing one plate) get one path, so a card never
    # shows the same picture twice.
    canon = {}
    for n in sorted(out):
        f = next((os.path.join(b, out[n]["path"]) for b in (os.path.dirname(DATA), DATA)
                  if os.path.exists(os.path.join(b, out[n]["path"]))), None)
        if f: out[n]["path"] = canon.setdefault(hashlib.md5(open(f, "rb").read()).hexdigest(), out[n]["path"])
    json.dump(out, open(os.path.join(DATA, f"pictures-{time}.json"), "w"), separators=(",", ":"))
    print(f"{time} Ma: {len(shown)} kinds shown; " + ", ".join(f"{k} {v}" for k, v in kinds.most_common()), file=sys.stderr)


if __name__ == "__main__":
    for t in sys.argv[1:]: build(int(t))
