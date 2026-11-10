"""Ancient elevation and sea depth from the PALEOMAP PaleoDEMs (Scotese & Wright 2018, CC BY 4.0).

1° grids every ~5 Myr from 540 Ma to today, from the same plate model as the fossil positions.
Usage: python3 scripts/fetch-paleodem.py <time_ma>   (prints which map it picked and its range)
"""
import base64
import os
import re
import struct
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from netcache import CACHE, fetch

URL = "https://zenodo.org/api/records/5460860/files/PaleoDEMS_long_lat_elev_csv_v2.zip/content"
CITATION = "Scotese & Wright 2018, PALEOMAP PaleoDEMs (CC BY 4.0), doi:10.5281/zenodo.5460860"
COLS, ROWS = 360, 180          # lon -180..179, lat 90..-89, 1° steps
ELEV_MIN, ELEV_MAX = -6000, 7000  # clamp; the raw files carry one 10500 m artefact at the pole


def _zip():
    path = os.path.join(CACHE, "paleodem", "paleodem-csv-v2.zip")
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(fetch(URL, "paleodem", ext="zip"))
    return zipfile.ZipFile(path)


def grid(time_ma):
    """Return (map name, map age, list of ROWS*COLS elevations in metres, row-major from 90°N, -180°)."""
    z = _zip()
    maps = {}
    for name in z.namelist():
        m = re.search(r"(Map\d+)_(\d+)Ma\.csv$", name)
        if m:
            maps[name] = (m.group(1), int(m.group(2)))
    name, (label, age) = min(maps.items(), key=lambda kv: abs(kv[1][1] - time_ma))
    if abs(age - time_ma) > 5:
        raise ValueError(f"no PaleoDEM within 5 Myr of {time_ma} Ma (closest {age} Ma)")
    values = [None] * (COLS * ROWS)
    for line in z.read(name).decode().splitlines():
        if line.startswith("#") or not line.strip():
            continue
        lon, lat, elev = (float(v) for v in line.split(","))
        col, row = int(round(lon + 180)), int(round(90 - lat))
        if 0 <= col < COLS and 0 <= row < ROWS:
            values[row * COLS + col] = max(ELEV_MIN, min(ELEV_MAX, round(elev)))
    missing = sum(v is None for v in values)
    if missing:
        raise ValueError(f"{label}: {missing} grid cells missing")
    return label, age, values


def encoded(time_ma):
    """Grid as compact JSON-ready dict: elevations as little-endian int16, base64."""
    label, age, values = grid(time_ma)
    return {
        "cols": COLS, "rows": ROWS, "lon0": -180, "lat0": 90, "step": 1,
        "map": label, "age": age, "source": CITATION,
        "elev": base64.b64encode(struct.pack(f"<{len(values)}h", *values)).decode(),
    }


if __name__ == "__main__":
    label, age, values = grid(float(sys.argv[1]))
    land = sum(v > 0 for v in values)
    print(f"{label} ({age} Ma): {min(values)}..{max(values)} m, {land / len(values):.0%} land")
