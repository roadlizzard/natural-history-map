"""Hard checks on the built data, run before anything is deployed. Exits 1 if any check fails.

Each period (data/slices.json) is checked for:
  files      slice, habitat, zones and ranges exist, parse, and agree with each other
  climate    a modelled temperature grid with a believable global mean (5-35 °C)
  land/sea   no land life (land plants, dinosaurs, mammals, amphibians) found or guessed in the sea, and no
             water life (fish, shellfish, corals...) on land, in the habitat lists or the zones
  ages       every genus's PBDB age range reaches the period (within its intervals, plus a margin), and no
             group or class turns up before it existed (insects, land plants, dinosaurs, birds, true mammals)
  groups     "other" stays a small share of genera
With --against <dir> (a copy of the last good data), also:
  drift      genera, dig sites and occurrences have not fallen by more than DROP, and "other" has not grown
             by more than OTHER_GROWTH: a sudden drop is far more likely a broken download than real science

Usage: python3 scripts/check-data.py [--against cache/last-good] [--json report.json]
"""
import argparse
import base64
import collections
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from groups import LAND, WATER  # noqa: E402

DATA = os.path.join(os.path.dirname(HERE), "data")
ROWS, COLS = 90, 180
N = ROWS * COLS
AGE_MARGIN = 12            # Myr either side of the period's time a genus's range may miss by (two-stage slices)
DROP = 0.10                # largest allowed fall in genera / sites / occurrences against the last good build
OTHER_GROWTH = 0.02        # largest allowed rise in "other"'s share
OTHER_MAX = {510: 0.16}    # the Cambrian's oddities (hyoliths, problematica) really have no better group
OTHER_DEFAULT = 0.06
# Nothing of these can be older than this (Ma), with a margin for dating.
FIRST = [("class", "Insecta", 412), ("class", "Aves", 165), ("class", "Mammalia", 225),
         ("group", "plants", 475), ("group", "dinosaurs", 245)]


def load_bin(path, with_zones=False):
    b = open(path, "rb").read()
    pos = 0
    zone = None
    if with_zones:
        zone = np.frombuffer(b, "<u2", N); pos = N * 2
        nz = int(zone.max())
        off = np.frombuffer(b, "<u4", nz + 1, pos); pos += (nz + 1) * 4
    else:
        off = np.frombuffer(b, "<u4", N + 1, pos); pos += (N + 1) * 4
    tot = int(off[-1])
    idx = np.frombuffer(b, "<u2", tot, pos); pos += tot * 2
    sco = np.frombuffer(b, np.uint8, tot, pos); pos += tot
    if pos != len(b):
        raise ValueError(f"{os.path.basename(path)}: {len(b) - pos} stray bytes")
    if np.any(np.diff(off.astype(np.int64)) < 0):
        raise ValueError(f"{os.path.basename(path)}: offsets go backwards")
    return zone, off, idx, sco


def stats(sl):
    G = sl["groups"]
    occ = sum(n for site in sl["sites"] for _, _, n in site[2])
    other = sum(1 for g in sl["genera"] if G[g["group"]] == "other") / max(1, len(sl["genera"]))
    return {"genera": len(sl["genera"]), "sites": len(sl["sites"]), "occurrences": occ, "other": other}


def check_period(t, against):
    fail, note = [], []
    sl = json.load(open(os.path.join(DATA, f"slice-{t}.json")))
    G, genera = sl["groups"], sl["genera"]
    st = stats(sl)

    # climate
    if "temp" not in sl:
        fail.append("no modelled temperature grid")
    else:
        temp = np.frombuffer(base64.b64decode(sl["temp"]["t"]), "<i2").reshape(180, 360) / 10
        w = np.cos(np.radians(90.0 - np.arange(180)))[:, None]
        mean = float((temp * w).sum() / (w.sum() * 360))
        if not 5 <= mean <= 35:
            fail.append(f"global mean temperature {mean:.1f} °C is not believable")

    # land and sea, in the habitat lists and the zones
    e1 = np.frombuffer(base64.b64decode(sl["dem"]["elev"]), "<i2").reshape(180, 360).astype(np.float32)
    land = (e1.reshape(ROWS, 2, COLS, 2).mean(axis=(1, 3)) > 0).ravel()
    gl = np.array([G[g["group"]] in LAND for g in genera])
    gw = np.array([G[g["group"]] in WATER for g in genera])
    try:
        _, off, idx, sco = load_bin(os.path.join(DATA, f"habitat-{t}.bin"))
        if len(idx) and idx.max() >= len(genera):
            fail.append("habitat file points past the end of the genus list (stale against the slice)")
        else:
            cell = np.repeat(np.arange(N), np.diff(off.astype(np.int64)))
            bad_sea = int((gl[idx] & ~land[cell]).sum())
            bad_land = int((gw[idx] & land[cell]).sum())
            if bad_sea:
                fail.append(f"{bad_sea} land-life entries placed in sea cells")
            if bad_land:
                fail.append(f"{bad_land} water-life entries placed on land cells")
    except (OSError, ValueError) as e:
        fail.append(f"habitat file: {e}")
    try:
        zone, zoff, zidx, _ = load_bin(os.path.join(DATA, f"zones-{t}.bin"), with_zones=True)
        meta = json.load(open(os.path.join(DATA, f"zones-{t}.json")))
        if meta["zones"] != len(zoff) - 1:
            fail.append("zones .bin and .json disagree on the number of zones")
        sea_cls = {0, 1}                                          # Deep sea, Shallow sea (make-zones CLASSES)
        for z in range(len(zoff) - 1):
            members = zidx[zoff[z]:zoff[z + 1]]
            if meta["classes"][z] in sea_cls and gl[members].any():
                fail.append(f"sea zone {z + 1} lists land life"); break
            if meta["classes"][z] not in sea_cls and gw[members].any():
                fail.append(f"land zone {z + 1} lists water life"); break
    except (OSError, ValueError, KeyError) as e:
        fail.append(f"zones file: {e}")
    if not os.path.exists(os.path.join(DATA, f"ranges-{t}.json")):
        fail.append("no ranges file")

    # ages
    out = [g["name"] for g in genera if g.get("range") and not (g["range"][1] - AGE_MARGIN <= t <= g["range"][0] + AGE_MARGIN)]
    if out:
        fail.append(f"{len(out)} genera whose PBDB age range misses {t} Ma: {', '.join(out[:5])}")
    for kind, name, first in FIRST:
        if t <= first:
            continue
        hits = [g["name"] for g in genera if (g["taxonomy"][1] == name if kind == "class" else G[g["group"]] == name)]
        if hits:
            fail.append(f"{name} at {t} Ma, before they existed (~{first} Ma): {', '.join(hits[:5])}")

    # groups
    cap = OTHER_MAX.get(t, OTHER_DEFAULT)
    if st["other"] > cap:
        fail.append(f'"other" is {st["other"]:.0%} of genera (limit {cap:.0%})')

    # drift against the last good build
    prev = os.path.join(against, f"slice-{t}.json") if against else None
    if prev and os.path.exists(prev):
        ps = stats(json.load(open(prev)))
        for k in ("genera", "sites", "occurrences"):
            if st[k] < ps[k] * (1 - DROP):
                fail.append(f"{k} fell {ps[k]} -> {st[k]} (more than {DROP:.0%})")
            elif st[k] != ps[k]:
                note.append(f"{k} {ps[k]} -> {st[k]}")
        if st["other"] > ps["other"] + OTHER_GROWTH:
            fail.append(f'"other" grew {ps["other"]:.1%} -> {st["other"]:.1%}')
        old = {g["name"] for g in json.load(open(prev))["genera"]}
        new = [g["name"] for g in genera if g["name"] not in old]
        gone = old - {g["name"] for g in genera}
        if new or gone:
            note.append(f"{len(new)} new genera ({', '.join(new[:6])}{'…' if len(new) > 6 else ''}), {len(gone)} gone")
    return st, fail, note


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--against")
    ap.add_argument("--json")
    a = ap.parse_args()
    report, failed = {}, False
    for s in json.load(open(os.path.join(DATA, "slices.json"))):
        t = s["time"]
        try:
            st, fail, note = check_period(t, a.against)
        except Exception as e:                                     # a missing or broken file is a failure too
            st, fail, note = {}, [f"could not check: {e!r}"], []
        failed |= bool(fail)
        report[t] = {"label": s["label"], "stats": st, "fail": fail, "note": note}
        print(f"{t:>4} Ma {'FAIL' if fail else 'ok  '} " + "; ".join(fail or note or ["no change"]))
    if a.json:
        json.dump(report, open(a.json, "w"), indent=1)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
