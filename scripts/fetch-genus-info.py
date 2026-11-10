"""Fetch a description, lead image and image credits for every genus in a slice.

Wikipedia first (intro text + lead image, checked to be about the right kind of organism);
genera without a usable article get a plain description built from PBDB taxonomy in the browser.
Also does the same for the slice's phyla, classes, orders and families.
Writes data/genus-info-<time>.json, data/taxon-info-<time>.json and thumbnails to data/img/.
Usage: python3 scripts/fetch-genus-info.py <time_ma>
"""
import html
import json
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from netcache import DATA, fetch, fetch_json

API = "https://en.wikipedia.org/w/api.php"
THUMB = 330          # a standard Wikimedia thumbnail step
EXTRACT_CHARS = 650

# An article only counts if its intro mentions the kind of organism PBDB says the genus is.
FAMILY_WORDS = {
    "invert": r"trilobite|arthropod|insect|crustacean|crab|shrimp|lobster|beetle|cockroach|ostracod|spider|scorpion|"
              r"horseshoe|dragonfly|damselfly|wasp|\bfly\b|flies|mayfly|cicada|bug|moth|mollus|ammonit|belemnit|bivalve|"
              r"clam|oyster|mussel|scallop|gastropod|snail|cephalopod|nautil|brachiopod|coral|sponge|cnidarian|"
              r"hydrozoa|stromatopor|echinoderm|sea urchin|echinoid|crinoid|starfish|sea star|brittle star|"
              r"ophiuroid|sea lil|invertebrate|bryozoa|graptolite|hemichordate|pterobranch",
    "vert": r"fish|shark|\bray\b|lungfish|coelacanth|actinopterygian|amphibian|frog|salamander|temnospondyl|"
            r"albanerpetontid|caecilian|reptile|crocodyl|turtle|pterosaur|plesiosaur|pliosaur|ichthyosaur|lizard|"
            r"sphenodont|squamate|rhynchocephal|choristoder|dinosaur|theropod|sauropod|ornithopod|ornithischian|"
            r"stegosaur|ankylosaur|iguanodont|bird|avialan|mammal|multituberculate|synapsid|cynodont|tetrapod|"
            r"conodont|chordate|vertebrate",
    "plant": r"plant|fern|conifer|cycad|ginkgo|horsetail|seed|gymnosperm|alga|bennettit|moss|liverwort|"
             r"\bleaf\b|leaves|pollen|spore|lycophyte|lycopod|flora|wood",
    "other": r"radiolarian|foraminifer|worm|annelid|bryozoan|protist|plankton|polychaete|cyanobacter|alga|"
             r"dinoflagellate|coccolith|microfossil|ciliate|tintinnid",
}
GROUP_FAMILY = {"trilobites": "invert", "arthropods": "invert", "molluscs": "invert", "brachiopods": "invert",
                "bryozoans": "invert", "corals-sponges": "invert", "echinoderms": "invert", "graptolites": "invert",
                "conodonts": "vert", "fish": "vert", "amphibians": "vert", "reptiles": "vert", "dinosaurs": "vert",
                "mammals": "vert", "plants": "plant", "algae": "plant", "forams": "other", "other": "other"}
# Same name, wrong organism (e.g. a modern orchid sharing a fossil plant's name).
REJECT = re.compile(r"flowering plant|orchid|\bmoths?\b|butterfl|asteraceae|\bband\b|\balbum\b|\bfilm\b", re.I)


def title_for(name):
    return name.split(" (")[0]       # "Diplopodia (Pseudodiadema)" -> "Diplopodia"


def clean(text):
    """Tidy plain-text extracts: Wikipedia strips pronunciation guides but leaves their brackets behind."""
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\(\s*[;,]\s*", "(", text)                    # "( ; from Greek…" -> "(from Greek…"
    text = re.sub(r"\s*\(\s*\)", "", text)                       # empty "( )"
    text = re.sub(r"\(\s+", "(", text)                          # "( AL-o-SAWR-us)" -> "(AL-o-SAWR-us)"
    text = re.sub(r"\s\(\s*(?=(is|was|are|were)\b)", " ", text)  # "Torvosaurus ( is a genus" -> "Torvosaurus is a genus"
    return text


# Sentence ends: a full stop and a space, but not after an initial or a common abbreviation ("T. tanneri", "sp.").
SENTENCE_END = re.compile(r"(?<![A-Z])(?<!\bsp)(?<!\bca)(?<!\bc)(?<!e\.g)(?<!i\.e)\.\s")


def trim(text):
    text = clean(text)
    if len(text) <= EXTRACT_CHARS:
        return text
    ends = [m.start() for m in SENTENCE_END.finditer(text[:EXTRACT_CHARS])]
    return text[:ends[-1] + 1] if ends and ends[-1] > 200 else text[:EXTRACT_CHARS].rstrip() + "…"


def strip_html(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def query_articles(titles):
    """Return {requested title: page dict} for up to 20 titles, following redirects."""
    params = {
        "action": "query", "format": "json", "formatversion": "2", "redirects": "1",
        "prop": "extracts|pageimages|description|pageprops", "exintro": "1", "explaintext": "1",
        "exlimit": "20", "piprop": "thumbnail|name", "pithumbsize": str(THUMB), "pilimit": "20",
        "ppprop": "disambiguation", "titles": "|".join(titles),
    }
    res = fetch_json(API + "?" + urllib.parse.urlencode(params), "wikipedia", pause=2.0)["query"]
    hop = {n["from"]: n["to"] for n in res.get("normalized", [])}
    hop.update({r["from"]: r["to"] for r in res.get("redirects", [])})
    pages = {p["title"]: p for p in res["pages"]}
    out = {}
    for t in titles:
        final = t
        for _ in range(3):
            final = hop.get(final, final)
        out[t] = pages.get(final)
    return out


def query_credits(files):
    """Return {file name: credit dict} for up to 50 File: pages."""
    params = {
        "action": "query", "format": "json", "formatversion": "2", "prop": "imageinfo",
        "iiprop": "extmetadata", "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl|ImageDescription",
        "titles": "|".join("File:" + f for f in files),
    }
    res = fetch_json(API + "?" + urllib.parse.urlencode(params), "wikipedia", pause=2.0)["query"]
    hop = {n["to"]: n["from"] for n in res.get("normalized", [])}
    out = {}
    for p in res["pages"]:
        meta = (p.get("imageinfo") or [{}])[0].get("extmetadata") or {}; meta = meta if isinstance(meta, dict) else {}
        name = hop.get(p["title"], p["title"])[len("File:"):]
        out[name] = {
            "artist": strip_html(meta.get("Artist", {}).get("value"))[:120],
            "license": meta.get("LicenseShortName", {}).get("value", ""),
            "license_url": meta.get("LicenseUrl", {}).get("value", ""),
            "caption": trim(strip_html(meta.get("ImageDescription", {}).get("value")))[:220],
            "file": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(name.replace(" ", "_")),
        }
    return out


def accept(page, group):
    if not page or page.get("missing") or page.get("pageprops", {}).get("disambiguation") is not None:
        return False
    text = (page.get("description", "") + " " + page.get("extract", "")[:600])
    if REJECT.search(text):
        return False
    return re.search(FAMILY_WORDS[GROUP_FAMILY[group]], text, re.I) is not None


TAXON_WORDS = re.compile(r"family|order|class|phylum|clade|group|superfamily|suborder|subclass|infraorder|"
                         r"taxon|genus|genera|species|extinct|lineage", re.I)


def accept_taxon(page):
    """Higher groups (families, orders…): any real article that reads like it is about a taxon."""
    if not page or page.get("missing") or page.get("pageprops", {}).get("disambiguation") is not None:
        return False
    text = page.get("description", "") + " " + page.get("extract", "")[:600]
    return not REJECT.search(text) and TAXON_WORDS.search(text) is not None


def lookup(names, accept_page, prefix=""):
    """Wikipedia intro, lead image and image credits for each name that passes accept_page(name, page)."""
    titles = sorted({title_for(n) for n in names})
    pages = {}
    for i in range(0, len(titles), 20):
        pages.update(query_articles(titles[i:i + 20]))
        print(f"\rarticles {min(i + 20, len(titles))}/{len(titles)}", end="", file=sys.stderr)
    print(file=sys.stderr)

    info, files = {}, set()
    for name in names:
        page = pages.get(title_for(name))
        if not accept_page(name, page):
            continue
        entry = {"title": page["title"], "text": trim(page.get("extract", ""))}
        if page.get("thumbnail") and page.get("pageimage"):
            entry["image"] = {"src": page["thumbnail"]["source"], "file": page["pageimage"],
                              "w": page["thumbnail"]["width"], "h": page["thumbnail"]["height"]}
            files.add(page["pageimage"])
        info[name] = entry

    credits = {}
    files = sorted(files)
    for i in range(0, len(files), 50):
        credits.update(query_credits(files[i:i + 50]))

    img_dir = os.path.join(DATA, "img")
    os.makedirs(img_dir, exist_ok=True)
    for name, entry in info.items():
        img = entry.get("image")
        if not img:
            continue
        ext = os.path.splitext(urllib.parse.urlparse(img["src"]).path)[1].lower() or ".jpg"
        local = prefix + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") + ext
        try:
            # Always ask for a standard width (portrait photos come back at odd widths, which Wikimedia refuses)
            img["src"] = re.sub(r"/\d+px-", f"/{THUMB}px-", img["src"])
            if img["w"] != THUMB:
                img["h"], img["w"] = round(img["h"] * THUMB / img["w"]), THUMB
            raw = fetch(img["src"], "wikimedia", ext=ext.lstrip("."), pause=1.0)
        except Exception as e:  # one bad image shouldn't stop the run
            print(f"\nskip image for {name}: {e}", file=sys.stderr)
            del entry["image"]
            continue
        with open(os.path.join(img_dir, local), "wb") as f:
            f.write(raw)
        entry["image"] = {"path": f"data/img/{local}", "w": img["w"], "h": img["h"],
                          **credits.get(img["file"], {})}
    return info


def write(info, path, label, total):
    with open(path, "w") as f:
        json.dump(info, f, separators=(",", ":"), ensure_ascii=False)
    with_img = sum(1 for e in info.values() if e.get("image"))
    print(f"{total} {label}: {len(info)} with a Wikipedia description, {with_img} with an image "
          f"-> {os.path.basename(path)} ({os.path.getsize(path) // 1024} KB)")


def main(time_ma):
    slice_ = json.load(open(os.path.join(DATA, f"slice-{time_ma:g}.json")))
    genera = slice_["genera"]
    group_of = {g["name"]: slice_["groups"][g["group"]] for g in genera}
    info = lookup([g["name"] for g in genera], lambda n, page: accept(page, group_of[n]))
    write(info, os.path.join(DATA, f"genus-info-{time_ma:g}.json"), "genera", len(genera))

    # Phylum, class, order and family names, for the classification trail in the pop-out card.
    taxa = sorted({t for g in genera for t in g.get("taxonomy", []) if t})
    info = lookup(taxa, lambda n, page: accept_taxon(page), prefix="taxon-")
    write(info, os.path.join(DATA, f"taxon-info-{time_ma:g}.json"), "higher groups", len(taxa))


if __name__ == "__main__":
    main(float(sys.argv[1]))
