"""Download reconstructed coastline polygons for one time step (PALEOMAP).

Usage: python3 scripts/fetch-coastlines.py <time_ma>
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from netcache import fetch_json

URL = "https://gws.gplates.org/reconstruct/coastlines/"
MODEL = "PALEOMAP"


def coastlines(time_ma, model=MODEL, tolerance=0.08, min_points=4):
    """Return today's coastlines moved to their position at time_ma, simplified for a faint outline.

    Polygons are simplified (Douglas-Peucker, tolerance in degrees) and rings too small to see are dropped.
    """
    gj = fetch_json(f"{URL}?time={time_ma:g}&model={model}", "gplates")
    features = []
    for f in gj["features"]:
        geom = f["geometry"]
        polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        kept = []
        for poly in polys:
            rings = [_round(_simplify(ring, tolerance)) for ring in poly]
            if len(rings[0]) >= min_points:
                kept.append([r for r in rings if len(r) >= min_points])
        if kept:
            features.append({"type": "Feature", "properties": {},
                             "geometry": {"type": "MultiPolygon", "coordinates": kept}})
    return {"type": "FeatureCollection", "features": features}


def _simplify(points, tol):
    """Douglas-Peucker on a closed ring, iterative to avoid deep recursion."""
    if len(points) < 4:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = points[a][:2], points[b][:2]
        dx, dy = bx - ax, by - ay
        norm = (dx * dx + dy * dy) ** 0.5
        best, idx = 0.0, None
        for i in range(a + 1, b):
            px, py = points[i][:2]
            d = abs(dy * (px - ax) - dx * (py - ay)) / norm if norm else ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            if d > best:
                best, idx = d, i
        if idx is not None and best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(points, keep) if k]


def _round(c):
    return [round(c[0], 2), round(c[1], 2)] if isinstance(c[0], (int, float)) else [_round(x) for x in c]


if __name__ == "__main__":
    gj = coastlines(float(sys.argv[1]))
    print(len(gj["features"]), "features,", len(json.dumps(gj, separators=(",", ":"))) // 1024, "KB")
