"""A flat (equirectangular) picture of the ancient terrain, coloured and hill-shaded to match the globe.

Uses the high-resolution PaleoDEM (0.1°) cached by make-terrain-tiles.py. Needs numpy, h5py, Pillow (.venv).
Usage: .venv/bin/python scripts/make-flat-terrain.py <time_ma>  -> data/terrain/<time>-flat.jpg
"""
import importlib.util
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("tiles", os.path.join(HERE, "make-terrain-tiles.py"))
tiles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tiles)

# Same colour stops as RELIEF in map.js: [elevation in m, colour].
RELIEF = [(-7000, "#081a33"), (-4000, "#0d2a4f"), (-2000, "#143d69"), (-500, "#1f5a86"), (-150, "#2c7aa3"),
          (-30, "#3e95b5"), (0, "#5aaabf"), (0.5, "#4f7038"), (250, "#5f7d41"), (600, "#7a8550"), (1000, "#8e815a"),
          (1600, "#9c8565"), (2500, "#a99880"), (4000, "#c3b9aa"), (6000, "#ddd8cf")]


def main(time_ma):
    elev, source = tiles.grid(time_ma)          # rows 90..-90, cols -180..180 at 0.1°
    elev = elev[:-1, :-1]                        # drop the duplicated last row/column -> 1800 x 3600
    stops = np.array([e for e, _ in RELIEF], dtype=float)
    rgb = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for _, c in RELIEF], dtype=float)
    img = np.dstack([np.interp(elev, stops, rgb[:, k]) for k in range(3)])
    # Hill shading, light from the north-west, like MapLibre's.
    lat = np.linspace(90, -90, elev.shape[0])[:, None]
    dx = 11132.0 * np.cos(np.radians(lat)).clip(0.05)   # metres per 0.1° east-west
    gy, gx = np.gradient(elev, 11132.0, axis=0), np.gradient(elev, axis=1) / dx
    exag = np.where(elev > 0, 6.0, 2.0)
    slope = np.arctan(exag * np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az, alt = np.radians(315), np.radians(45)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    img *= (0.62 + 0.5 * shade)[..., None]
    out = os.path.join(os.path.dirname(HERE), "data", "terrain", f"{time_ma:g}-flat.jpg")
    Image.fromarray(img.clip(0, 255).astype(np.uint8)).save(out, quality=84, optimize=True)
    print(f"{source} -> {os.path.basename(out)} ({os.path.getsize(out) // 1024} KB)")


if __name__ == "__main__":
    main(float(sys.argv[1]))
