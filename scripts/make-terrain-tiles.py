"""Cut the high-resolution PaleoDEM (0.1°, PALEOMAP, Scotese & Wright 2018) into elevation tiles for MapLibre.

Tiles are Web Mercator, 512 px, Terrarium-encoded PNG (elevation = R*256 + G + B/256 - 32768), so the browser
does the hill shading and colouring on the graphics card. Needs numpy, h5py and Pillow (.venv).

The source grid is pulled out of the 207 MB Zenodo archive with HTTP range requests, so only the one map
needed (~26 MB) is downloaded, and it is cached.
Usage: .venv/bin/python scripts/make-terrain-tiles.py <time_ma> [max_zoom=3]
"""
import http.client
import io
import time
import urllib.error
import math
import os
import re
import ssl
import sys
import urllib.request
import zipfile

import h5py
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "cache", "paleodem")
URL = "https://zenodo.org/api/records/5460860/files/Scotese_Wright_2018_Maps_1-88_6minX6min_PaleoDEMS_nc.zip/content"
UA = {"User-Agent": "anthropocene-natural-history-map/0.1 (personal non-commercial project)"}
SSL_CTX = ssl.create_default_context(cafile="/etc/ssl/cert.pem" if os.path.exists("/etc/ssl/cert.pem") else None)
TILE = 512


class RangeFile(io.RawIOBase):
    """Read-only, seekable view of a remote file, fetched in pieces with HTTP Range requests."""

    def __init__(self, url):
        head = urllib.request.urlopen(urllib.request.Request(url, method="HEAD", headers=UA), context=SSL_CTX, timeout=60)
        self.url, self.size, self.pos = head.geturl(), int(head.headers["Content-Length"]), 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def readinto(self, b):
        n = min(len(b), self.size - self.pos)
        if n <= 0:
            return 0
        req = urllib.request.Request(self.url, headers={**UA, "Range": f"bytes={self.pos}-{self.pos + n - 1}"})
        for attempt in range(6):                  # Zenodo sometimes cuts a piece short: ask again
            try:
                data = urllib.request.urlopen(req, context=SSL_CTX, timeout=120).read()
                if len(data) == n:
                    break
            except (http.client.HTTPException, urllib.error.URLError, TimeoutError, ConnectionError):
                if attempt == 5:
                    raise
            time.sleep(5 * (attempt + 1))
        b[:len(data)] = data
        self.pos += len(data)
        return len(data)


def grid(time_ma):
    """(elevation array [lat 90..-90, lon -180..180], map name) for the PaleoDEM nearest time_ma."""
    os.makedirs(CACHE, exist_ok=True)
    cached = [f for f in os.listdir(CACHE) if f.endswith(".nc") and re.search(rf"_{int(time_ma)}Ma\.nc$", f)]
    if not cached:
        z = zipfile.ZipFile(io.BufferedReader(RangeFile(URL), buffer_size=1 << 20))
        names = {n: int(m.group(1)) for n in z.namelist() if (m := re.search(r"_(\d+)Ma\.nc$", n))}
        name = min(names, key=lambda n: abs(names[n] - time_ma))
        if abs(names[name] - time_ma) > 5:
            raise ValueError(f"no PaleoDEM within 5 Myr of {time_ma} Ma")
        cached = [os.path.basename(name)]
        data = z.read(name)                      # read fully first, so a dropped download leaves no half file
        with open(os.path.join(CACHE, cached[0]) + ".part", "wb") as f:
            f.write(data)
        os.replace(os.path.join(CACHE, cached[0]) + ".part", os.path.join(CACHE, cached[0]))
    with h5py.File(os.path.join(CACHE, cached[0]), "r") as f:
        lat, lon, elev = f["latitude"][:], f["longitude"][:], f["z"][:].astype(np.float32)
    assert lat[0] > lat[-1] and lon[0] < lon[-1], "unexpected grid orientation"
    return elev, cached[0]


def sample(elev, lon, lat):
    """Bilinear elevation at arrays of lon/lat (grid is 0.1°, rows from 90°N, columns from 180°W)."""
    rows, cols = elev.shape
    r = (90 - lat) / 180 * (rows - 1)
    c = (lon + 180) / 360 * (cols - 1)
    r0 = np.clip(np.floor(r).astype(int), 0, rows - 2)
    c0 = np.clip(np.floor(c).astype(int), 0, cols - 2)
    fr, fc = r - r0, c - c0
    return ((elev[r0, c0] * (1 - fc) + elev[r0, c0 + 1] * fc) * (1 - fr)
            + (elev[r0 + 1, c0] * (1 - fc) + elev[r0 + 1, c0 + 1] * fc) * fr)


def terrarium(h):
    # Whole metres on land and 10 m steps at sea: invisible in the shading, and the PNGs compress far better.
    h = np.where(h > 0, np.round(h), np.round(h / 10) * 10)
    v = np.clip(h + 32768.0, 0, 65535.99)
    r = np.floor(v / 256)
    g = np.floor(v - r * 256)
    b = np.floor((v - r * 256 - g) * 256)
    return np.dstack([r, g, b]).astype(np.uint8)


def calm_poles(elev, start=80.0, end=84.5):
    """The globe fills the cap above 85° by stretching the tiles' last row toward the pole, which turns any
    relief there into a starburst. So, near each pole, ease the terrain toward one even height."""
    elev = elev.astype(np.float32).copy()
    rows = elev.shape[0]
    lat = 90 - np.arange(rows) * 180 / (rows - 1)
    for sign in (1, -1):
        band = (sign * lat >= end) & (sign * lat <= 90)
        level = float(np.median(elev[band]))
        w = np.clip((sign * lat - start) / (end - start), 0, 1)
        w = w * w * (3 - 2 * w)                            # smooth start
        elev = elev * (1 - w[:, None]) + level * w[:, None]
    return elev


def main(time_ma, max_zoom=3):
    elev, source = grid(time_ma)
    elev = calm_poles(elev)
    out = os.path.join(ROOT, "data", "terrain", f"{time_ma:g}")
    total = 0
    for z in range(max_zoom + 1):
        n = 2 ** z
        px = (np.arange(TILE) + 0.5) / TILE
        for x in range(n):
            lon = ((x + px) / n) * 360 - 180
            for y in range(n):
                my = (y + px) / n
                lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * my))))
                LON, LAT = np.meshgrid(lon, lat)
                img = Image.fromarray(terrarium(sample(elev, LON, LAT)), "RGB")
                path = os.path.join(out, str(z), str(x), f"{y}.png")
                os.makedirs(os.path.dirname(path), exist_ok=True)
                img.save(path, optimize=True)
                total += os.path.getsize(path)
        print(f"zoom {z}: {n * n} tiles", file=sys.stderr)
    print(f"{source} -> data/terrain/{time_ma:g}/ ({total // 1024} KB, zoom 0-{max_zoom})")


if __name__ == "__main__":
    main(float(sys.argv[1]), int(sys.argv[2]) if len(sys.argv) > 2 else 3)
