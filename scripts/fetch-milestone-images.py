"""One picture per milestone of the story of life (Wikipedia lead images), saved as small thumbnails.

Writes data/img/ms-<age>.jpg and data/milestone-images.json ({age: {file, title, credit_url}}).
Usage: python3 scripts/fetch-milestone-images.py
"""
import json
import os
import sys
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from netcache import DATA, fetch, fetch_json

TITLES = {541: "Trilobite", 485: "Orthoceras", 480: "Arandaspis", 430: "Cooksonia", 410: "Rhyniognatha",
          400: "Dunkleosteus", 370: "Ichthyostega", 340: "Eryops", 320: "Hylonomus", 310: "Lepidodendron",
          290: "Cycad", 252: "Dimetrodon", 230: "Eoraptor", 225: "Morganucodon", 200: "Brachiosaurus",
          180: "Araucaria araucana", 150: "Archaeopteryx", 130: "Archaefructus", 66: "Chicxulub crater",
          56: "Plesiadapis", 55: "Eohippus", 50: "Pakicetus", 25: "Proconsul (primate)", 20: "Grassland",
          2.6: "Homo erectus", 0.01: "Woolly mammoth"}

out = {}
for age, title in TITLES.items():
    try:
        s = fetch_json("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title.replace(" ", "_")), "wikipedia")
        src = (s.get("thumbnail") or {}).get("source")
        if not src:
            print("no image", title, file=sys.stderr); continue
        body = fetch(src, "wikimedia", ext=src.rsplit(".", 1)[-1].lower()[:4])
        name = f"ms-{str(age).replace('.', '_')}.jpg"
        data = body if isinstance(body, bytes) else open(body, "rb").read()
        open(os.path.join(DATA, "img", name), "wb").write(data)
        out[str(age)] = {"file": f"data/img/{name}", "title": title, "page": s.get("content_urls", {}).get("desktop", {}).get("page")}
        print("ok", title, file=sys.stderr)
    except Exception as e:
        print("fail", title, e, file=sys.stderr)
json.dump(out, open(os.path.join(DATA, "milestone-images.json"), "w"), indent=1)
