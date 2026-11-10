"""Group each period's Earth into zones of shared life: neighbouring 2° cells whose lists of likely kinds
(from data/habitat-<time>.bin) are mostly the same become one zone, and small zones join their most similar
neighbour. A zone lists every kind whose likely range reaches any part of it.

Writes data/zones-<time>.bin: a Uint16 block of each cell's zone + 1 (0 = no life; 90 rows from the north,
180 columns from -180°), a Uint32 block of zone offsets (Z + 1), a Uint16 block of genus indexes, a Uint8
block of scores (best in the zone, 0-255). And data/zones-<time>.json: the zones' boundary lines and each
zone's environment, from its average height or depth (see CLASSES).

Usage: python3 scripts/make-zones.py <time_ma> [<time_ma> ...]
"""
import base64
import json
import os
import sys

import numpy as np

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
ROWS, COLS = 90, 180
N = ROWS * COLS
SIMILAR = 0.5        # cells join a zone while they share at least this much of its seed's list (Jaccard)
MIN_CELLS = 4        # smaller zones join their most similar neighbour
CLIMATE = 4.0        # degrees of lowland temperature one zone may span
SAME = 0.75          # neighbouring zones sharing at least this much of their life (Jaccard) are one zone
CLASSES = ["Deep sea", "Shallow sea", "Coastal lowland", "Lowland plain", "Uplands", "Mountains"]


def nbrs(k):
    r, c = divmod(k, COLS)
    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        rr = r + dr
        if 0 <= rr < ROWS:
            yield rr * COLS + (c + dc) % COLS


def build(time):
    b = open(os.path.join(DATA, f"habitat-{time}.bin"), "rb").read()
    off = np.frombuffer(b[:(N + 1) * 4], dtype="<u4"); tot = int(off[-1])
    ids = np.frombuffer(b[(N + 1) * 4:(N + 1) * 4 + tot * 2], dtype="<u2")
    sco = np.frombuffer(b[(N + 1) * 4 + tot * 2:(N + 1) * 4 + tot * 3], dtype=np.uint8)
    cell = [dict(zip(ids[off[i]:off[i + 1]].tolist(), sco[off[i]:off[i + 1]].tolist())) for i in range(N)]
    sets = [set(d) for d in cell]
    # How alike two places' life is: weighted by how well each kind suits each place (sum of the smaller
    # score over sum of the larger), so places listing the same kinds still differ when they suit them differently.
    G = int(ids.max()) + 1 if len(ids) else 1
    M = np.zeros((N, G), np.uint8)
    for i in range(N):
        if off[i + 1] > off[i]: M[i, ids[off[i]:off[i + 1]]] = sco[off[i]:off[i + 1]]
    def jac(a, b):
        mx = int(np.maximum(a, b).sum(dtype=np.int64))
        return int(np.minimum(a, b).sum(dtype=np.int64)) / mx if mx else 1.0
    # Land and sea never share a zone (their life overlaps along coasts, but a zone is one kind of ground).
    sl = json.load(open(os.path.join(DATA, f"slice-{time}.json")))
    elev = np.frombuffer(base64.b64decode(sl["dem"]["elev"]), dtype="<i2").reshape(180, 360).astype(np.float32)
    elev = elev.reshape(ROWS, 2, COLS, 2).mean(axis=(1, 3)).ravel()
    land = elev > 0
    # One zone is one kind of ground and climate: the same height class and within CLIMATE degrees (the
    # period's lowland temperature, Scotese et al. 2021), as ecoregion maps split land by environment as well as life.
    t1 = np.frombuffer(base64.b64decode(sl["temp"]["t"]), dtype="<i2").reshape(180, 360).astype(np.float32) / 10
    e1 = np.frombuffer(base64.b64decode(sl["dem"]["elev"]), dtype="<i2").reshape(180, 360).astype(np.float32)
    temp = (t1 + 6.5 * np.maximum(e1, 0) / 1000).reshape(ROWS, 2, COLS, 2).mean(axis=(1, 3)).ravel()
    hcls = np.where(land, np.digitize(elev, [600, 1500]) + 2, (elev > -2000).astype(int))
    def alike(i, j): return hcls[i] == hcls[j] and abs(temp[i] - temp[j]) <= CLIMATE

    # Grow zones from the richest cells outward while neighbours stay similar to the seed.
    lab = np.full(N, -1, int); z = 0
    for s0 in sorted((i for i in range(N) if sets[i]), key=lambda i: -len(sets[i])):
        if lab[s0] >= 0: continue
        seed, st = M[s0], [s0]; lab[s0] = z
        while st:
            k = st.pop()
            for j in nbrs(k):
                if lab[j] < 0 and sets[j] and alike(j, s0) and jac(M[j], seed) >= SIMILAR:
                    lab[j] = z; st.append(j)
        z += 1
    # Small zones join the most similar neighbouring zone (repeat until none is left that can join one).
    for _ in range(6):
        members = [[] for _ in range(z)]
        for i in range(N):
            if lab[i] >= 0: members[lab[i]].append(i)
        union = [M[m].max(axis=0) if m else np.zeros(G, np.uint8) for m in members]
        changed = False
        for zi, m in enumerate(members):
            if not m or len(m) >= MIN_CELLS: continue
            near = {lab[j] for k in m for j in nbrs(k) if lab[j] >= 0 and lab[j] != zi and land[j] == land[k]}
            if not near: continue
            near2 = {zj for zj in near if any(alike(k, j) for k in m for j in nbrs(k) if lab[j] == zj)}
            best = max(near2 or near, key=lambda zj: jac(union[zi], union[zj]))
            for k in m: lab[k] = best
            changed = True
        if not changed: break
    # Neighbouring zones whose life is nearly the same are really one place: join them, most alike first,
    # comparing the joined lists as they grow.
    while True:
        members = {}
        for i in range(N):
            if lab[i] >= 0: members.setdefault(int(lab[i]), []).append(i)
        union = {zi: M[m].max(axis=0) for zi, m in members.items()}
        ztemp = {zi: float(temp[m].mean()) for zi, m in members.items()}
        zcls = {zi: int(np.bincount(hcls[m]).argmax()) for zi, m in members.items()}
        pairs = {}
        for zi, m in members.items():
            for k in m:
                for j in nbrs(k):
                    zj = int(lab[j])
                    if zj >= 0 and zj != zi and land[j] == land[k] and (zj, zi) not in pairs and zcls[zi] == zcls[zj] and abs(ztemp[zi] - ztemp[zj]) <= CLIMATE:
                        pairs[(zi, zj)] = jac(union[zi], union[zj])
        best = max(pairs.items(), key=lambda x: x[1], default=None)
        if not best or best[1] < SAME: break
        (za, zb), _ = best
        for k in members[zb]: lab[k] = za
    # Renumber, and list each zone's kinds (every kind in any of its cells, with its best score there).
    keep = sorted({int(x) for x in lab if x >= 0}); renum = {o: n for n, o in enumerate(keep)}
    cz = np.zeros(N, np.uint16); lists = [dict() for _ in keep]
    for i in range(N):
        if lab[i] >= 0:
            zi = renum[int(lab[i])]; cz[i] = zi + 1
            for g, s in cell[i].items():
                if s > lists[zi].get(g, 0): lists[zi][g] = s
    zoff, zids, zsc = [0], [], []
    for d in lists:
        for g, s in sorted(d.items(), key=lambda x: -x[1]):
            zids.append(g); zsc.append(s)
        zoff.append(len(zids))
    with open(os.path.join(DATA, f"zones-{time}.bin"), "wb") as f:
        f.write(cz.tobytes()); f.write(np.array(zoff, "<u4").tobytes())
        f.write(np.array(zids, "<u2").tobytes()); f.write(np.array(zsc, np.uint8).tobytes())
    # Boundary lines: every edge between two cells of different zones (or a zone and lifeless water),
    # joined into runs along each row and column.
    segs = []
    lng = lambda c: -180 + 2 * c
    lat = lambda r: 90 - 2 * r
    for r in range(ROWS):                      # vertical edges: between (r, c-1) and (r, c)
        for c in range(COLS):
            a, b2 = cz[r * COLS + (c - 1) % COLS], cz[r * COLS + c]
            if a != b2: segs.append([lng(c), lat(r), lng(c), lat(r + 1)])
    for r in range(1, ROWS):                   # horizontal edges: between (r-1, c) and (r, c)
        for c in range(COLS):
            if cz[(r - 1) * COLS + c] != cz[r * COLS + c]: segs.append([lng(c), lat(r), lng(c + 1), lat(r)])
    # Each zone's environment: deep or shallow sea, or on land by height (lowland next to the sea is coastal).
    coastal = np.array([land[i] and any(not land[j] for j in nbrs(i)) for i in range(N)])
    classes = []
    for zi in range(len(keep)):
        m = cz == zi + 1
        e, lf = float(elev[m].mean()), float(land[m].mean())
        if lf < 0.5: classes.append(0 if e < -2000 else 1)
        elif e > 1500: classes.append(5)
        elif e > 600: classes.append(4)
        else: classes.append(2 if coastal[m & land].mean() > 0.4 else 3)
    json.dump({"zones": len(keep), "classes": classes, "names": CLASSES, "segments": segs}, open(os.path.join(DATA, f"zones-{time}.json"), "w"), separators=(",", ":"))
    size = os.path.getsize(os.path.join(DATA, f"zones-{time}.bin")) // 1024
    print(f"{time} Ma: {len(keep)} zones, median {int(np.median([len(d) for d in lists]))} kinds each, {size} KB, {len(segs)} boundary edges", file=sys.stderr)


if __name__ == "__main__":
    for t in sys.argv[1:]:
        build(int(t))
