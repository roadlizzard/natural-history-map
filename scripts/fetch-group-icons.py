"""Download the hand-picked PhyloPic silhouette for each major group, with its licence and contributor.

Writes data/icons/<group>.svg and data/group-icons.json.
Usage: python3 scripts/fetch-group-icons.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from netcache import DATA, fetch, fetch_json

API = "https://api.phylopic.org/images/{}?build=562"

# Picked by eye for legibility at icon size; CC0 or public domain, except graptolites, conodonts and forams (CC BY 3.0,
# credited on the page from data/group-icons.json).
ICONS = [
    ("trilobites", "3c497a41-4a2c-4165-a1f2-e1d4d898d77c"),
    ("arthropods", "7e290615-e253-4b0b-907e-cf1d9364f9ad"),
    ("molluscs", "8008be3b-c5f6-40c3-8611-2fb4009a200b"),
    ("brachiopods", "6b5881bc-bc71-468f-9958-a69e1b57b805"),
    ("corals-sponges", "32eeaa29-2e90-40b5-92fb-eb8d7fcab9ab"),
    ("echinoderms", "7e27ce06-1f4f-45d8-a359-dcba8fc54b9b"),
    ("fish", "2f52370e-b3db-461f-809b-b47f494d6440"),
    ("amphibians", "c387bde8-a9de-4101-928b-e99f2a7a33e5"),
    ("reptiles", "0e2a08ed-13a1-4b9e-a047-ef4045e7d88f"),
    ("dinosaurs", "82af16f5-3a45-4de5-93c6-0fc71d50d0b2"),
    ("mammals", "e191c6d0-184c-4bb5-9e49-8b354f4e0014"),
    ("plants", "a8ddb1f7-64f2-4c27-b52c-7c47751ca292"),
    ("bryozoans", "191ad6ce-78f2-444d-b4ad-9c4162b1803f"),      # Ectoprocta
    ("graptolites", "023c767f-0348-4f52-855e-872b2893009b"),    # Rhabdopleura, a living graptolite
    ("conodonts", "1946f963-7bc4-40ec-a7a3-22e91c595fda"),      # Euconodonta
    ("algae", "6b8fa6c9-f4f2-4a39-8d61-95590b50c405"),          # Acetabularia, a dasyclad alga
    ("forams", "77296cce-9e94-49d0-a093-45a62a335f57"),         # Nummulites, a giant foram
]


def main():
    os.makedirs(os.path.join(DATA, "icons"), exist_ok=True)
    credits = {}
    for group, uuid in ICONS:
        rec = fetch_json(API.format(uuid), "phylopic")
        links = rec["_links"]
        svg = fetch(links["vectorFile"]["href"], "phylopic", ext="svg")
        with open(os.path.join(DATA, "icons", f"{group}.svg"), "wb") as f:
            f.write(svg)
        credits[group] = {
            "taxon": links["specificNode"]["title"],
            "contributor": links["contributor"]["title"],
            "license": links["license"]["href"],
            "source": f"https://www.phylopic.org/images/{uuid}",
        }
        print(f"{group:15} {len(svg) // 1024:4d} KB  {credits[group]['taxon']}")
    with open(os.path.join(DATA, "group-icons.json"), "w") as f:
        json.dump(credits, f, indent=1)


if __name__ == "__main__":
    main()
