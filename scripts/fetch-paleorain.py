"""Ancient rainfall for one time step, from the same HadCM3L climate runs as the temperatures (CC BY 4.0).

Suite scotese_02 (Valdes et al. 2021) on the PALEOMAP paleogeography, the runs behind Scotese et al. (2021)'s
temperature grids (fetch-paleotemp.py), so wet and dry places sit on the same landmasses. Each age has five
20-year means of monthly rainfall; they are averaged. Two numbers per spot:
  year   mean rainfall over the year, mm
  dry    rainfall of the driest three months, as a yearly rate in mm: how long and hard the dry season is
         (a monsoon forest and a steady rainforest can share a yearly total; a desert has neither)

The climate model has its known biases: today's Amazon comes out too dry (about 630 mm against ~2,300 real),
the Sahara somewhat too wet (~300 mm). The model is on a coarse 3.75° x 2.5° grid, interpolated to 1°.

Source: https://zenodo.org/records/8237751 (scotese_02_pr.zip, kept zipped in cache/scotese-pr/).
Judd et al. PhanDA model priors; simulations by the BRIDGE group, University of Bristol.
Writes nothing itself: build-slice.py stores the grid in the slice as "rain". To add rain to slices already
built: python3 scripts/fetch-paleorain.py <time_ma> [...] --write

Usage: python3 scripts/fetch-paleorain.py <time_ma> [...] [--write]   (prints a summary)
"""
import base64
import io
import json
import os
import re
import sys
import zipfile

import h5py
import numpy as np
from scipy.interpolate import RegularGridInterpolator

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP = os.path.join(ROOT, "cache", "scotese-pr", "scotese_02_pr.zip")
COLS, ROWS = 360, 180
CITATION = ("Valdes, P.J., Scotese, C.R. & Lunt, D.J. (2021). Deep ocean temperatures through time. Climate of the Past "
            "17, 1483-1508 (HadCM3L scotese_02 runs). Grids: Judd et al., PhanDA HadCM3L model priors, "
            "zenodo.org/records/8237751, CC BY 4.0.")


def grid(time_ma):
    """(age of the map used, yearly mm, driest-quarter mm/yr), each ROWS x COLS on the PaleoDEM's 1° grid."""
    if not os.path.exists(ZIP):
        raise FileNotFoundError(f"no rainfall archive at {ZIP}; see this file's docstring")
    z = zipfile.ZipFile(ZIP)
    files = {}
    for n in z.namelist():
        if (m := re.match(r"scotese_02_\d+_(\d+)Ma_\d+pCO2_M\d_pr\.nc$", n)):
            files.setdefault(int(m.group(1)), []).append(n)
    age = min(files, key=lambda a: abs(a - time_ma))
    if abs(age - time_ma) > 5:
        raise ValueError(f"no rainfall map within 5 Myr of {time_ma} Ma (closest {age} Ma)")
    months = []
    for n in sorted(files[age]):
        with h5py.File(io.BytesIO(z.read(n)), "r") as f:
            lat, lon = np.array(f["lat"]), np.array(f["lon"])
            months.append(np.array(f["pr"][:, 0], dtype=np.float64))     # (12, lon, lat), mm/yr rates
    pr = np.nan_to_num(np.mean(months, 0), nan=0.0).transpose(0, 2, 1)   # (12, lat, lon)
    quarters = np.stack([pr[[m, (m + 1) % 12, (m + 2) % 12]].mean(0) for m in range(12)])
    fields = [pr.mean(0), quarters.min(0)]
    if lat[0] > lat[-1]:
        lat, fields = lat[::-1], [x[::-1] for x in fields]
    lon = np.concatenate([lon, [lon[0] + 360]])                        # wrap east-west
    la = np.clip(90.0 - np.arange(ROWS), lat[0], lat[-1])
    lo = (np.arange(COLS) - 180.0 - lon[0]) % 360 + lon[0]
    pts = np.stack(np.meshgrid(la, lo, indexing="ij"), -1).reshape(-1, 2)
    out = [np.maximum(RegularGridInterpolator((lat, lon), np.concatenate([x, x[:, :1]], 1))(pts).reshape(ROWS, COLS), 0)
           for x in fields]
    return age, out[0], out[1]


def encoded(time_ma):
    age, year, dry = grid(time_ma)
    enc = lambda a: base64.b64encode(np.round(np.minimum(a, 65535)).astype("<u2").tobytes()).decode()
    return {"cols": COLS, "rows": ROWS, "lon0": -180, "lat0": 90, "step": 1, "age": age, "unit": "mm per year",
            "source": CITATION, "year": enc(year), "dry": enc(dry)}


def decode(d):
    """A slice's "rain" entry back to (yearly mm, driest-quarter mm/yr), ROWS x COLS each."""
    f = lambda k: np.frombuffer(base64.b64decode(d[k]), dtype="<u2").reshape(d["rows"], d["cols"]).astype(np.float32)
    return f("year"), f("dry")


if __name__ == "__main__":
    write = "--write" in sys.argv
    for t in [a for a in sys.argv[1:] if a != "--write"]:
        age, year, dry = grid(float(t))
        w = np.cos(np.radians(90.0 - np.arange(ROWS)))[:, None]
        print(f"{t} Ma (map {age} Ma): yearly {year.min():.0f}..{year.max():.0f} mm, area-weighted mean "
              f"{(year * w).sum() / (w.sum() * COLS):.0f} mm; driest quarter mean {(dry * w).sum() / (w.sum() * COLS):.0f}")
        if write:
            path = os.path.join(ROOT, "data", f"slice-{t}.json")
            sl = json.load(open(path))
            sl["rain"] = encoded(float(t))
            json.dump(sl, open(path + ".tmp", "w"), separators=(",", ":"))
            os.replace(path + ".tmp", path)
