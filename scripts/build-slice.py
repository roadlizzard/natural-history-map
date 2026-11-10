"""Build one time slice: fossils at their ancient positions + coastlines, as data/slice-<time>.json.

Usage: python3 scripts/build-slice.py <time_ma> <pbdb intervals> <label>
   e.g. python3 scripts/build-slice.py 150 Kimmeridgian,Tithonian "Late Jurassic"
"""
import collections
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from netcache import DATA, fetch_json


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), os.path.join(HERE, name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


fetch_occurrences = load("fetch-occurrences")
reconstruct_points = load("reconstruct-points")
fetch_coastlines = load("fetch-coastlines")
fetch_paleodem = load("fetch-paleodem")
fetch_paleotemp = load("fetch-paleotemp")

from groups import GROUPS, group_of

# Leave out finds dated only loosely: a fossil whose age range spans more than this (Myr) cannot be placed
# in one slice with any confidence, and would sit on the wrong continent positions.
MAX_AGE_SPAN = 20
# A genus whose own PBDB age range misses the slice's time by more than this (Myr) is left out: its find here
# is a doubtful identification or a dating error (scripts/check-data.py checks the same margin).
AGE_MARGIN = 12
# Genera PBDB still lists that published work has shown are wrong here, each with its reason and source.
EXCLUDED = {k for k in json.load(open(os.path.join(HERE, "exclusions.json"))) if not k.startswith("_")}


def _named(v):
    """PBDB fills unknown ranks with NO_..._SPECIFIED; turn those into empty strings."""
    return "" if not v or v.startswith("NO_") else v


def genus_ranges(taxon_ids):
    """First and last appearance (Ma) for each genus taxon id, from PBDB."""
    out = {}
    ids = sorted(taxon_ids)
    for i in range(0, len(ids), 200):
        url = ("https://paleobiodb.org/data1.2/taxa/list.json?show=app&id="
               + ",".join(ids[i:i + 200]))
        for t in fetch_json(url, "pbdb")["records"]:
            if "fea" in t:
                out[t["oid"]] = (t["fea"], t["lla"])
    return out


def build(time_ma, intervals, label):
    recs, plant_ids, land_plant_ids = fetch_occurrences.fetch_slice(intervals)
    loose = [r for r in recs if float(r.get("eag", 0)) - float(r.get("lag", 0)) > MAX_AGE_SPAN]
    recs = [r for r in recs if float(r.get("eag", 0)) - float(r.get("lag", 0)) <= MAX_AGE_SPAN]

    # Reconstruct each distinct present-day location once.
    locs = sorted({(round(float(r["lng"]), 4), round(float(r["lat"]), 4)) for r in recs})
    paleo = dict(zip(locs, reconstruct_points.reconstruct(locs, time_ma)))

    genera, genus_idx = [], {}
    group_votes = collections.defaultdict(collections.Counter)   # genus index -> Counter[group]
    formations, formation_idx = [], {}
    sites = collections.defaultdict(collections.Counter)  # (plng, plat) -> Counter[(genus, formation)]
    countries = collections.defaultdict(collections.Counter)  # (plng, plat) -> Counter[present-day country code]
    unplaced, unmapped = 0, collections.Counter()
    for r in recs:
        if r["gnl"] == "NO_GENUS_SPECIFIED" or r["gnl"] in EXCLUDED:
            continue
        p = paleo[(round(float(r["lng"]), 4), round(float(r["lat"]), 4))]
        if p is None:
            unplaced += 1
            continue
        oid = r["oid"]
        group = group_of(r, "land" if oid in land_plant_ids else "algae" if oid in plant_ids else None)
        if group == "other":
            unmapped[(r.get("phl"), r.get("cll"))] += 1
        name = r["gnl"]
        if name not in genus_idx:
            genus_idx[name] = len(genera)
            genera.append({"name": name, "group": GROUPS.index(group), "tid": r.get("gnn", r["tid"]),
                           "taxonomy": [_named(r.get(k)) for k in ("phl", "cll", "odl", "fml")]})
        group_votes[genus_idx[name]][group] += 1
        fm = r.get("sfm", "")
        if fm not in formation_idx:
            formation_idx[fm] = len(formations)
            formations.append(fm)
        key = (round(p[0], 2), round(p[1], 2))
        sites[key][(genus_idx[name], formation_idx[fm])] += 1
        if r.get("cc2"):
            countries[key][r["cc2"]] += 1

    # PBDB files some records of a genus under different classes (e.g. Allosaurus under both Saurischia and
    # Reptilia). Any dinosaur record makes it a dinosaur; otherwise the most common group wins.
    # Some records only say "Reptilia" (Allosaurus, Archaeopteryx), so also check PBDB's own list of
    # every genus inside Dinosauria.
    dino_ids = {t["oid"] for t in fetch_json(
        "https://paleobiodb.org/data1.2/taxa/list.json?base_name=Dinosauria&rank=genus", "pbdb")["records"]}
    for i, votes in group_votes.items():
        dino = votes["dinosaurs"] or genera[i]["tid"] in dino_ids
        genera[i]["group"] = GROUPS.index("dinosaurs" if dino else votes.most_common(1)[0][0])

    ranges = genus_ranges({g["tid"].replace("txn:", "") for g in genera})
    for g in genera:
        fa_la = ranges.get(g["tid"])
        g["range"] = list(fa_la) if fa_la else None
        g["tid"] = int(g["tid"].replace("txn:", ""))

    # Drop genera whose own age range misses this time, then renumber what is left.
    keep = [i for i, g in enumerate(genera)
            if not g["range"] or g["range"][1] - AGE_MARGIN <= time_ma <= g["range"][0] + AGE_MARGIN]
    if len(keep) < len(genera):
        print("left out (age range misses this time):",
              ", ".join(genera[i]["name"] for i in range(len(genera)) if i not in set(keep)), file=sys.stderr)
        new = {old: k for k, old in enumerate(keep)}
        genera = [genera[i] for i in keep]
        for key in list(sites):
            c = collections.Counter({(new[gi], f): n for (gi, f), n in sites[key].items() if gi in new})
            if c:
                sites[key] = c
            else:
                del sites[key]
                countries.pop(key, None)

    return {
        "time": time_ma,
        "label": label,
        "intervals": intervals.split(","),
        "model": reconstruct_points.MODEL,
        "groups": GROUPS,
        "genera": genera,
        "formations": formations,
        # Each site: [lng, lat, [[genus index, formation index, occurrences], ...], present-day country code]
        "sites": [[lng, lat, [[g, f, n] for (g, f), n in c.items()],
                   countries[(lng, lat)].most_common(1)[0][0] if countries[(lng, lat)] else ""]
                  for (lng, lat), c in sites.items()],
        # Today's coastlines, moved to where they sat at this time; drawn as a faint outline for orientation.
        "coastlines": fetch_coastlines.coastlines(time_ma),
        # Ancient elevation/sea depth; the browser contours it into landform bands and true ancient shorelines.
        "dem": fetch_paleodem.encoded(time_ma),
        # Ancient yearly surface temperature (Scotese et al. 2021) on the same grid as the DEM.
        "temp": fetch_paleotemp.encoded(time_ma),
    }, unplaced, unmapped, len(recs), len(loose)


if __name__ == "__main__":
    time_ma, intervals, label = float(sys.argv[1]), sys.argv[2], sys.argv[3]
    out, unplaced, unmapped, total, loose = build(time_ma, intervals, label)
    path = os.path.join(DATA, f"slice-{time_ma:g}.json")
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    other = sum(unmapped.values())
    print(f"{total} occurrences (after dropping {loose} dated to within more than {MAX_AGE_SPAN} Myr) -> "
          f"{len(out['sites'])} sites, {len(out['genera'])} genera")
    print(f"dropped {unplaced} with no plate in {out['model']}; {other} in 'other' group")
    print("top 'other':", unmapped.most_common(6))
    print(f"wrote {path} ({os.path.getsize(path) // 1024} KB)")
