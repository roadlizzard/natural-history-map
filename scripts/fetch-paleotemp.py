"""Ancient yearly surface temperature for one time step, from Scotese et al. (2021), CC BY 4.0.

HadCM3L climate-model runs (Valdes et al. 2021) on the PALEOMAP paleogeography, adjusted to agree with
oxygen-isotope temperatures and climate-sensitive rocks (evaporites, coals, tillites, bauxites). The same
plate model as our coastlines and PaleoDEMs, so the warm and cold places sit on the right landmasses.

Source: https://zenodo.org/records/5718392 (gmst_scotese02a_v21321_nc.zip, unpacked into cache/scotese-temp/).
Writes nothing itself: build-slice.py stores the grid in the slice, on the PaleoDEM's 1° grid
(row 0 = 90°N, column 0 = 180°W, integer-degree centres), as int16 tenths of a °C.

Usage: python3 scripts/fetch-paleotemp.py <time_ma>   (prints a summary)
"""
import base64
import glob
import os
import re
import sys

import numpy as np
from scipy.interpolate import RegularGridInterpolator
from scipy.io import netcdf_file

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "cache", "scotese-temp")
COLS, ROWS = 360, 180
CITATION = ("Scotese, C.R., Song, H., Mills, B.J.W. & van der Meer, D.G. (2021). Phanerozoic paleotemperatures: "
            "The earth's changing climate during the last 540 million years. Earth-Science Reviews 215, 103503. "
            "Grids: zenodo.org/records/5718392, CC BY 4.0.")


def grid(time_ma):
    """(age of the map used, ROWS x COLS array of °C)."""
    files = {int(m.group(1)): p for p in glob.glob(os.path.join(DIR, "*_tas_*.nc"))
             if (m := re.match(r"(\d+)_tas_", os.path.basename(p)))}
    if not files:
        raise FileNotFoundError(f"no Scotese temperature grids in {DIR}; see this file's docstring")
    age = min(files, key=lambda a: abs(a - time_ma))
    if abs(age - time_ma) > 5:
        raise ValueError(f"no temperature map within 5 Myr of {time_ma} Ma (closest {age} Ma)")
    nc = netcdf_file(files[age], "r", mmap=False)
    v = nc.variables
    lat, lon = v["northing"][:].copy(), v["easting"][:].copy()
    t = np.array(next(x for k, x in v.items() if k.endswith("_tas_scotese02a_v21321"))[:], dtype=np.float64)
    nc.close()
    if lat[0] > lat[-1]:                                  # the interpolator wants rising coordinates
        lat, t = lat[::-1], t[::-1]
    t = np.where(np.abs(t) > 1e30, np.nan, t)
    f = RegularGridInterpolator((lat, lon), t, bounds_error=False, fill_value=None)
    la = np.clip(90.0 - np.arange(ROWS), lat[0], lat[-1])
    lo = np.arange(COLS) - 180.0
    out = f(np.stack(np.meshgrid(la, lo, indexing="ij"), -1).reshape(-1, 2)).reshape(ROWS, COLS)
    if np.isnan(out).any():
        raise ValueError(f"{age} Ma temperature map has gaps")
    return age, out


def encoded(time_ma):
    age, t = grid(time_ma)
    return {"cols": COLS, "rows": ROWS, "lon0": -180, "lat0": 90, "step": 1, "age": age, "unit": "0.1 °C",
            "source": CITATION,
            "t": base64.b64encode(np.round(t * 10).astype("<i2").tobytes()).decode()}


def decode(d):
    """A slice's "temp" entry back to a ROWS x COLS array of °C."""
    return np.frombuffer(base64.b64decode(d["t"]), dtype="<i2").reshape(d["rows"], d["cols"]).astype(np.float32) / 10


if __name__ == "__main__":
    age, t = grid(float(sys.argv[1]))
    w = np.cos(np.radians(90.0 - np.arange(ROWS)))[:, None]
    print(f"{age} Ma: {t.min():.1f}..{t.max():.1f} °C, area-weighted mean {(t * w).sum() / (w.sum() * COLS):.1f} °C")
