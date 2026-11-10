"""Find a life restoration (an artist's picture of the living animal) for each genus with a description.

Searches Wikimedia Commons for files named after the genus that look like restorations, not fossils.
Writes data/life-images-<time>.json and thumbnails to data/img/life-*.jpg (credits kept for each).
Usage: python3 scripts/fetch-life-images.py <time_ma>
"""
import json
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from netcache import DATA, fetch, fetch_json

API = "https://commons.wikimedia.org/w/api.php"
WANT = re.compile(r"restor|reconstr|life|paleoart|palaeoart|artist|illustrat|drawing|model", re.I)
SKIP = re.compile(r"skelet|fossil|holotype|skull|bone|specimen|\bcast\b|mount|museum|jaw|tooth|teeth|vertebra|cladogram|map|diagram|size|scale|comparison"
                  r"|caudal|\bfin\b|original_illustration|original illustration|conchologia|shell", re.I)   # body parts and old shell plates


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


WIKI = "https://en.wikipedia.org/w/api.php"
# Commons categories that mark a picture as an artist's idea of the living animal or plant.
LIFE_CAT = re.compile(r"paleoart|palaeoart|life restoration|restorations? of|reconstructions? of|paleoartists?|"
                      r"illustrations? of (?:extinct|prehistoric)|prehistoric (?:animals|life) in art|dinosaur art", re.I)
FOSSIL_CAT = re.compile(r"fossils? (?:of|in|from)|specimens?|skeletons?|holotypes?|museum|casts?|skulls?|teeth|bones?", re.I)


def candidates(genus, article):
    """File titles that might show the living animal: every image on its Wikipedia article, plus a Commons search."""
    titles = []
    if article:
        params = {"action": "query", "format": "json", "formatversion": "2", "prop": "images", "imlimit": "50",
                  "redirects": "1", "titles": article}
        pages = fetch_json(WIKI + "?" + urllib.parse.urlencode(params), "wikipedia", pause=1.0)["query"]["pages"]
        titles += [i["title"] for i in (pages[0].get("images") or [])] if pages else []
    q = f'"{genus}" (restoration OR reconstruction OR paleoart OR life)'
    params = {"action": "query", "format": "json", "formatversion": "2", "list": "search", "srnamespace": "6",
              "srlimit": "20", "srsearch": q}
    titles += [h["title"] for h in fetch_json(API + "?" + urllib.parse.urlencode(params), "commons", pause=1.5)["query"]["search"]]
    seen, out = set(), []
    for t in titles:
        if t not in seen and re.search(r"\.(jpe?g|png)$", t, re.I):
            seen.add(t)
            out.append(t)
    return out[:40]


def find(genus, article=None):
    """(file title, imageinfo) of the best life restoration for a genus, or None.

    A picture counts only if its Commons categories, name or description say it is a restoration or paleoart,
    it names the genus somewhere, and nothing marks it as a fossil, skeleton or museum specimen."""
    files = candidates(genus, article)
    best, best_score = None, 0
    for i in range(0, len(files), 25):
        params = {"action": "query", "format": "json", "formatversion": "2", "prop": "imageinfo",
                  "titles": "|".join(files[i:i + 25]), "iiprop": "url|extmetadata", "iiurlwidth": "500",
                  "iiextmetadatafilter": "Artist|LicenseShortName|ImageDescription|Categories|ObjectName"}
        for page in fetch_json(API + "?" + urllib.parse.urlencode(params), "commons", pause=1.5)["query"]["pages"]:
            ii = (page.get("imageinfo") or [{}])[0]
            if not ii.get("thumburl"):
                continue
            meta = ii.get("extmetadata") or {}; meta = meta if isinstance(meta, dict) else {}
            cats = strip_html(meta.get("Categories", {}).get("value", "")).replace("|", " ; ")
            desc = strip_html(meta.get("ImageDescription", {}).get("value", "")) + " " + strip_html(meta.get("ObjectName", {}).get("value", ""))
            name = page["title"]
            text = f"{name} {desc} {cats}"
            if genus.lower() not in text.lower():
                continue                                   # must be about this genus
            if SKIP.search(name) or (FOSSIL_CAT.search(cats) and not LIFE_CAT.search(cats)):
                continue
            score = (3 if LIFE_CAT.search(cats) else 0) + (2 if WANT.search(name) else 0) + (1 if WANT.search(desc) else 0)
            if score > best_score:
                best, best_score = (name, ii), score
    return best if best_score >= 2 else None


def main(time_ma):
    info = json.load(open(os.path.join(DATA, f"genus-info-{time_ma:g}.json")))
    out = {}
    names = sorted(n for n, e in info.items() if len(e.get("text", "")) >= 200)
    for i, name in enumerate(names):
        genus = name.split(" (")[0]
        hit = find(genus, info[name].get("title"))
        print(f"\r{i + 1}/{len(names)} found {len(out)}", end="", file=sys.stderr)
        if not hit:
            continue
        title, ii = hit
        meta = ii.get("extmetadata") or {}; meta = meta if isinstance(meta, dict) else {}
        ext = ".png" if ii["thumburl"].lower().endswith(".png") else ".jpg"
        local = "life-" + re.sub(r"[^a-z0-9]+", "-", genus.lower()).strip("-") + ext
        try:
            raw = fetch(ii["thumburl"], "wikimedia", ext=ext.lstrip("."), pause=1.0)
        except Exception as e:  # one bad image shouldn't stop the run
            print(f"\nskip {genus}: {e}", file=sys.stderr)
            continue
        with open(os.path.join(DATA, "img", local), "wb") as f:
            f.write(raw)
        out[name] = {
            "path": f"data/img/{local}",
            "artist": strip_html(meta.get("Artist", {}).get("value"))[:120],
            "license": meta.get("LicenseShortName", {}).get("value", ""),
            "caption": strip_html(meta.get("ImageDescription", {}).get("value"))[:200],
            "file": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")),
        }
    print(file=sys.stderr)
    path = os.path.join(DATA, f"life-images-{time_ma:g}.json")
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    print(f"{len(out)} of {len(names)} genera have a life restoration -> {os.path.basename(path)}")


if __name__ == "__main__":
    main(float(sys.argv[1]))
