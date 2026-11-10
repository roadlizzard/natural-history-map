"""Frames of the ancient Earth every 1 million years, with the continents physically moving between them.

The PaleoDEMs give the terrain every 5 Myr. Between two of them, the plate model says where every piece of
crust went: a grid of present-day points is moved to both times, and each frame in between warps the older
terrain forward along those paths and the younger terrain back, then blends the two. So continents slide,
rift and collide instead of fading from one map to the next.

Writes data/motion/<t>.jpg (flat, equirectangular, 1440 x 720) for t = 0 .. 540.
Usage: .venv/bin/python scripts/make-motion-frames.py [workers=4]
"""
import importlib.util
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from netcache import CACHE, fetch_json

spec = importlib.util.spec_from_file_location("tiles", os.path.join(HERE, "make-terrain-tiles.py"))
tiles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tiles)
spec = importlib.util.spec_from_file_location("flat", os.path.join(HERE, "make-flat-terrain.py"))
flat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flat)

STEP = 5                          # Myr between PaleoDEMs
TIMES = list(range(0, 541, STEP))
W, H = 1440, 720                  # frame size: 0.25° per pixel
GRID_DEG = 2                      # spacing of the points that carry the plate motion
WORK = os.path.join(CACHE, "motion")
OUT = os.path.join(ROOT, "data", "motion")
KEEP_NC = {0, 15, 50, 70, 120, 125, 130, 135, 140, 145, 150, 230, 290, 310, 380, 430, 450, 510}

LON = np.linspace(-180, 180, W, endpoint=False) + 180 / W
LAT = np.linspace(90, -90, H, endpoint=False) - 90 / H
PTS = np.array([(lng, lat) for lat in np.arange(-89, 90, GRID_DEG) for lng in np.arange(-179, 180, GRID_DEG)], float)


def unit(lonlat):
    lo, la = np.radians(lonlat[..., 0]), np.radians(lonlat[..., 1])
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], -1)


def lonlat(v):
    v = v / np.linalg.norm(v, axis=-1, keepdims=True)
    return np.stack([np.degrees(np.arctan2(v[..., 1], v[..., 0])), np.degrees(np.arcsin(v[..., 2].clip(-1, 1)))], -1)


def positions(t):
    """Where each grid point (present-day position) sat at time t; NaN where the model has no plate."""
    path = os.path.join(WORK, f"pos-{t}.npy")
    if os.path.exists(path):
        return np.load(path)
    if t == 0:
        out = PTS.copy()
    else:
        out = np.full_like(PTS, np.nan)
        for i in range(0, len(PTS), 6000):
            chunk = PTS[i:i + 6000]
            res = fetch_json("https://gws.gplates.org/reconstruct/reconstruct_points/", "gplates", data={
                "points": ",".join(f"{a:.2f},{b:.2f}" for a, b in chunk), "time": t, "model": "PALEOMAP",
                "return_null_points": ""})["coordinates"]
            for j, c in enumerate(res):
                if c:
                    out[i + j] = c
    np.save(path, out)
    return out


def elevation(t):
    """The PaleoDEM at t, at 0.25° (rows from 90°N, columns from 180°W)."""
    path = os.path.join(WORK, f"elev-{t}.npy")
    if os.path.exists(path):
        return np.load(path)
    elev, name = tiles.grid(t)
    elev = elev[:-1, :-1]                                   # 1800 x 3600 at 0.1°
    # 0.1° -> 0.25°: sample at the centre of each output pixel (bilinear).
    r = (90 - LAT) / 180 * elev.shape[0] - 0.5
    c = (LON + 180) / 360 * elev.shape[1] - 0.5
    rr, cc = np.meshgrid(r, c, indexing="ij")
    out = map_coordinates(elev, [rr, cc], order=1, mode="nearest").astype(np.int16)
    np.save(path, out)
    if t not in KEEP_NC:                                    # the 26 MB source isn't needed again
        try:
            os.remove(os.path.join(CACHE, "paleodem", name))
        except OSError:
            pass
    return out


def warp(elev, disp_lon, disp_lat):
    """Sample elev at (pixel + displacement), wrapping east-west."""
    rows, cols = elev.shape
    lon = LON[None, :] + disp_lon
    lat = (LAT[:, None] + disp_lat).clip(-89.9, 89.9)
    c = ((lon + 180) % 360) / 360 * cols - 0.5
    r = (90 - lat) / 180 * rows - 0.5
    padded = np.concatenate([elev[:, -1:], elev, elev[:, :1]], axis=1).astype(np.float32)
    return map_coordinates(padded, [r, c + 1], order=1, mode="nearest")


def wrapped(d):
    return (d + 180) % 360 - 180


def frame(t_old, f):
    """Elevation at t_old - f*STEP (f in [0, 1)), moving the older and younger terrain toward each other."""
    t_new = t_old - STEP
    ea, eb = elevation(t_old), elevation(t_new)
    if f == 0:
        return ea.astype(np.float32)
    a, b = positions(t_old), positions(t_new)
    ok = ~np.isnan(a).any(1) & ~np.isnan(b).any(1)
    a, b = a[ok], b[ok]
    m = lonlat((1 - f) * unit(a) + f * unit(b))             # where each point is at this moment
    tree = cKDTree(unit(m))
    pix = unit(np.stack(np.meshgrid(LON, LAT), -1).reshape(-1, 2))
    dist, idx = tree.query(pix, k=4)
    w = 1 / (dist + 1e-4)
    w /= w.sum(1, keepdims=True)
    # Displacement from "now" back to each source map, smoothly fading to none away from any plate.
    da_lon = (w * wrapped(a[idx, 0] - m[idx, 0])).sum(1)
    da_lat = (w * (a[idx, 1] - m[idx, 1])).sum(1)
    db_lon = (w * wrapped(b[idx, 0] - m[idx, 0])).sum(1)
    db_lat = (w * (b[idx, 1] - m[idx, 1])).sum(1)
    near = np.degrees(dist[:, 0])                           # chord ≈ angle at these distances
    fade = np.clip((4.0 - near) / 2.0, 0, 1)
    shape = (H, W)
    ea2 = warp(ea, (da_lon * fade).reshape(shape), (da_lat * fade).reshape(shape))
    eb2 = warp(eb, (db_lon * fade).reshape(shape), (db_lat * fade).reshape(shape))
    return (1 - f) * ea2 + f * eb2


def colour(elev):
    """Same colours and hill shading as the flat map (make-flat-terrain.py), at 0.25°."""
    stops = np.array([e for e, _ in flat.RELIEF], float)
    rgb = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for _, c in flat.RELIEF], float)
    img = np.dstack([np.interp(elev, stops, rgb[:, k]) for k in range(3)])
    lat = LAT[:, None]
    step_m = 111320 * 0.25
    dx = step_m * np.cos(np.radians(lat)).clip(0.05)
    gy, gx = np.gradient(elev, step_m, axis=0), np.gradient(elev, axis=1) / dx
    exag = np.where(elev > 0, 6.0, 2.0)
    slope = np.arctan(exag * np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az, alt = np.radians(315), np.radians(45)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    img *= (0.62 + 0.5 * shade)[..., None]
    return Image.fromarray(img.clip(0, 255).astype(np.uint8))


def make_pair(t_old):
    """Frames t_old, t_old-1, ..., t_old-4."""
    done = []
    for k in range(STEP):
        t = t_old - k
        path = os.path.join(OUT, f"{t}.jpg")
        if not os.path.exists(path):
            colour(frame(t_old, k / STEP)).save(path, quality=74, optimize=True)
        done.append(t)
    return t_old


if __name__ == "__main__":
    workers = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    os.makedirs(WORK, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    # 1. Downloads first (network-bound): terrain and plate positions for every 5 Myr step.
    with ThreadPoolExecutor(4) as pool:
        for t in pool.map(lambda t: (elevation(t), positions(t), t)[2], TIMES):
            print(f"data for {t} Ma", flush=True)
    # 2. Frames (CPU-bound), newest pairs first so the recent past is ready soonest.
    with ProcessPoolExecutor(workers) as pool:
        for t in pool.map(make_pair, sorted(TIMES[1:])):
            print(f"frames {t}..{t - STEP + 1} Ma", flush=True)
    colour(elevation(0).astype(np.float32)).save(os.path.join(OUT, "0.jpg"), quality=74, optimize=True)
    json.dump({"step": 1, "first": 0, "last": 540, "width": W, "height": H},
              open(os.path.join(OUT, "index.json"), "w"))
    print("all frames done")
