"""Download PBDB fossil occurrences for one time slice.

Usage: python3 scripts/fetch-occurrences.py <intervals>   e.g. Kimmeridgian,Tithonian
Writes cache/pbdb/... (raw) and prints a summary. Plants are fetched as two more queries so we can tell
land plants (Embryophyta) from algae (the rest of PBDB's Plantae, which lived in the sea).
Only certain identifications: no "cf.", "aff.", "?" or informal names (PBDB idqual=certain).
"""
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from netcache import fetch_json

BASE = "https://paleobiodb.org/data1.2/occs/list.json"


def query(intervals, base_name=None):
    params = (
        f"interval={urllib.parse.quote(intervals)}&timerule=major&taxon_reso=genus&pres=regular&idqual=certain"
        "&show=coords,classext,strat,loc"
    )
    if base_name:
        params += f"&base_name={base_name}"
    out = fetch_json(f"{BASE}?{params}", "pbdb")
    for w in out.get("warnings", []):
        print("PBDB warning:", w, file=sys.stderr)
    return out["records"]


def fetch_slice(intervals):
    """Return (all occurrence records, ids that are Plantae, ids that are land plants)."""
    records = query(intervals)
    plant_ids = {r["oid"] for r in query(intervals, "Plantae")}
    land_ids = {r["oid"] for r in query(intervals, "Embryophyta")}
    return records, plant_ids, land_ids


if __name__ == "__main__":
    recs, plants, land = fetch_slice(sys.argv[1])
    print(f"{len(recs)} occurrences, {len(land)} land plants, {len(plants) - len(land)} algae, "
          f"{len({r['cid'] for r in recs})} collections")
