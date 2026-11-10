"""Reconstruct present-day coordinates to their ancient positions with the GPlates Web Service.

Uses the same plate model as the coastlines (PALEOMAP), so fossils sit on the right landmasses.
Usage: python3 scripts/reconstruct-points.py <time_ma> <lng,lat> [<lng,lat> ...]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from netcache import fetch_json

URL = "https://gws.gplates.org/reconstruct/reconstruct_points/"
MODEL = "PALEOMAP"
BATCH = 300


def reconstruct(points, time_ma, model=MODEL):
    """points: list of (lng, lat). Returns a list of (lng, lat) or None where the model has no plate."""
    out = []
    for i in range(0, len(points), BATCH):
        chunk = points[i:i + BATCH]
        flat = ",".join(f"{lng:.4f},{lat:.4f}" for lng, lat in chunk)
        res = fetch_json(URL, "gplates", data={
            "points": flat, "time": time_ma, "model": model, "return_null_points": "",
        })
        coords = res["coordinates"]
        if len(coords) != len(chunk):
            raise RuntimeError(f"GPlates returned {len(coords)} points for {len(chunk)}")
        out += [tuple(c) if c else None for c in coords]
    return out


if __name__ == "__main__":
    pts = [tuple(map(float, p.split(","))) for p in sys.argv[2:]]
    for p, q in zip(pts, reconstruct(pts, float(sys.argv[1]))):
        print(p, "->", q)
