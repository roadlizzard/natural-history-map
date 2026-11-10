// "This place": the map is divided into zones of shared life (scripts/make-zones.py), each coloured by its
// kind of environment like an ecoregion map, with a key. Click a zone and a tag hangs just below the spot
// clicked: its environment and climate, and one icon per group of life; an icon opens a
// card of that group's kinds there, three with big pictures and the rest as names. A kind is listed
// wherever its likely range reaches the zone; the card says which were found there and which are guesses. The fossils themselves are only the data
// here, so their dots are hidden once a period has this.

let zoneParts = [], zoneFeatures = [], pickedPart = null;
// The spot on screen (map-container pixels), on the globe or on the flat map.
const flatOn = () => typeof flat !== "undefined" && flat && !flat.parked;
// A point on the flat map, placed the way its terrain picture is (one copy of the world from its left
// edge), so shapes near ±180° never wrap to the other side.
function flatXY(ll) {
  const b = flatBox(), proj = flatProjection(b), W = 2 * Math.PI * flatView.k;
  const x0 = proj([-180 + 1e-9, 0])[0], y = proj([0, ll[1]])[1];
  return [x0 + ((+ll[0] + 180) / 360) * W, y];
}
function spotXY(ll) {
  if (!flatOn()) return map.project(ll);
  const [x, y] = flatXY(ll), c = document.getElementById("flatmap").getBoundingClientRect(), m = map.getContainer().getBoundingClientRect();
  return { x: x + c.left - m.left, y: y + c.top - m.top };
}
function inRing(ring, x, y) { let o = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) o = !o; } return o; }
function partAt(z, x, y) { const hit = zoneParts.find((q) => q.z === z && inRing(q.poly[0], x, y) && !q.poly.slice(1).some((h) => inRing(h, x, y))); return hit ? hit.p : null; }
let envGrid = null, placeAt = null, ringBound = false, placePics = {};
const HB = { rows: 90, cols: 180 };
window.HIDE_FINDS = false;

// Soft colours for each kind of environment (as in the zones file's names).
const ZONE_COLORS = ["#2b4f8c", "#6fc3d9", "#d9c36a", "#5f7d41", "#b98b5e", "#e8e1d5"];
// Groups in field-guide order: plants, then life on land, then life in the water.
const GUIDE_ORDER = ["plants", "dinosaurs", "mammals", "reptiles", "amphibians", "arthropods",
  "fish", "conodonts", "molluscs", "brachiopods", "bryozoans", "corals-sponges", "echinoderms", "trilobites",
  "graptolites", "forams", "algae", "other"];

async function loadHabitat() {
  try {
    const [r, meta] = await Promise.all([fetch(`data/zones-${slice.time}.bin?v=${BUILD}`), fetch(`data/zones-${slice.time}.json?v=${BUILD}`).then((x) => (x.ok ? x.json() : null))]);
    if (!r.ok || !meta) return;
    const buf = await r.arrayBuffer(), cells = HB.rows * HB.cols, Z = meta.zones;
    const zone = new Uint16Array(buf, 0, cells), offsets = new Uint32Array(buf, cells * 2, Z + 1), total = offsets[Z];
    envGrid = { zone, offsets, classes: meta.classes, names: meta.names,
      idx: new Uint16Array(buf, cells * 2 + (Z + 1) * 4, total), score: new Uint8Array(buf, cells * 2 + (Z + 1) * 4 + total * 2, total) };
    window.HIDE_FINDS = true;
    if (map.getLayer("places")) map.setPaintProperty("places", "circle-opacity", 0);
    placePics = await fetch(`data/pictures-${slice.time}.json?v=${BUILD}`).then((x) => (x.ok ? x.json() : {})).catch(() => ({}));
    // The zones as smooth shapes that fit together: each zone's cells, on a grid twice as fine, are softened
    // (a blur) and outlined where the softened value is one half. Where two zones meet their softened
    // values add up to one, so both outlines run along the same curve: no gaps, no overlaps.
    zoneParts = [];
    const F = 2, R = 2, w = (HB.cols + 2) * F, features = [];
    const blur = (grid, W, H) => {
      const tmp = new Float64Array(W * H);
      for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < H; y++) {                          // along rows
          let acc = 0;
          for (let x = -R; x <= R; x++) acc += x >= 0 && x < W ? grid[y * W + x] : 0;
          for (let x = 0; x < W; x++) {
            tmp[y * W + x] = acc / (2 * R + 1);
            const add = x + R + 1, sub = x - R;
            if (add < W) acc += grid[y * W + add];
            if (sub >= 0) acc -= grid[y * W + sub];
          }
        }
        for (let x = 0; x < W; x++) {                          // along columns
          let acc = 0;
          for (let y = -R; y <= R; y++) acc += y >= 0 && y < H ? tmp[y * W + x] : 0;
          for (let y = 0; y < H; y++) {
            grid[y * W + x] = acc / (2 * R + 1);
            const add = y + R + 1, sub = y - R;
            if (add < H) acc += tmp[add * W + x];
            if (sub >= 0) acc -= tmp[sub * W + x];
          }
        }
      }
    };
    for (let z = 1; z <= Z; z++) {
      let rmin = HB.rows, rmax = -1;
      for (let i = 0; i < cells; i++) if (zone[i] === z) { const r = Math.floor(i / HB.cols); if (r < rmin) rmin = r; if (r > rmax) rmax = r; }
      if (rmax < 0) continue;
      const r0 = Math.max(0, rmin - 2), h = (Math.min(HB.rows, rmax + 3) - r0) * F, grid = new Float64Array(w * h);
      // (empty columns either side, so an outline never wraps past ±180° and fills the wrong side of the globe)
      for (let y = 0; y < h; y++) {
        const r = r0 + Math.floor(y / F);
        for (let x = F; x < w - F; x++) grid[y * w + x] = zone[r * HB.cols + Math.floor(x / F) - 1] === z ? 1 : 0;
      }
      blur(grid, w, h);
      const [shape] = d3.contours().size([w, h]).thresholds([0.5])(grid);
      const coordinates = shape.coordinates.map((poly) => poly.map((ring) => ring.map(([x, y]) => [Math.max(-180, Math.min(180, -180 + 2 * (x / F - 1))), 90 - 2 * (y / F + r0)])));
      // each separate patch of a zone is its own shape, so a click lights only the patch clicked
      for (const poly of coordinates) { zoneParts.push({ z, p: zoneParts.length, poly }); features.push({ type: "Feature", properties: { z, k: meta.classes[z - 1], p: zoneParts.length - 1 }, geometry: { type: "Polygon", coordinates: poly } }); }
    }
    const before = map.getLayer("range-fill") ? "range-fill" : undefined;
    zoneFeatures = features;
    map.addSource("zone-fill", { type: "geojson", data: { type: "FeatureCollection", features } });
    // The colours go under the terrain's shading, so mountains, valleys and coasts still show through them.
    const under = map.getLayer("shade") ? "shade" : before;
    map.addLayer({ id: "zone-fill", type: "fill", source: "zone-fill", paint: { "fill-opacity": 0.75,
      "fill-color": ["match", ["get", "k"], ...ZONE_COLORS.flatMap((c, k) => [k, c]), "#888"] } }, under);
    map.addLayer({ id: "zone-pick", type: "fill", source: "zone-fill", filter: ["==", ["get", "z"], -1], paint: { "fill-color": "#ffffff", "fill-opacity": 0.22 } }, before);
    map.addLayer({ id: "zone-lines", type: "line", source: "zone-fill", layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#1a1712", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 4, 1.1], "line-opacity": 0.55 } }, before);
    for (const id of ["life-areas-line", "life-outline"]) if (map.getLayer(id)) map.setPaintProperty(id, "line-opacity", 0);
    // The key: each kind of environment present.
    const present = [...new Set(meta.classes)].sort((a, b) => a - b);
    const key = document.createElement("div");
    key.className = "zone-key";
    key.innerHTML = `<b>Zones</b>${present.map((k) => `<span><i style="background:${ZONE_COLORS[k]}"></i>${esc(meta.names[k])}</span>`).join("")}`;
    document.querySelector(".stage").appendChild(key);
  } catch { /* no zones for this period: the map works as before */ }
}
// While a species' spread is on the map, the zone borders (and the picked zone) step aside.
new MutationObserver(() => {
  const on = !document.body.classList.contains("species-open");
  for (const id of ["zone-lines", "zone-pick"]) if (map?.getLayer?.(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}).observe(document.body, { attributes: true, attributeFilter: ["class"] });

const waitMap = setInterval(() => { if (window.mapLoaded) { clearInterval(waitMap); window.mapLoaded.then(loadHabitat); } }, 200);

function landscapeOf(lng, lat) {
  const { elev, cols } = dem(), [c, r] = cellOf(lng, lat), i = r * cols + c, e = elev[i];
  const t = climateGrid().t[i];
  const height = e > 0 ? `${Math.round(e / 10) * 10} m up` : `${Math.round(-e / 10) * 10} m deep`;
  const word = t > 24 ? "Tropical" : t > 18 ? "Warm" : t > 10 ? "Mild" : t > 2 ? "Cool" : "Cold";
  return { height, climate: `${word} ~${Math.round(t)} °C` };
}

// The zone under a point: its number, its kinds of life, and where its top and bottom edges are.
function zoneAt(lng, lat) {
  const r = Math.max(0, Math.min(HB.rows - 1, Math.floor((90 - lat) / 2))), c = ((Math.floor((lng + 180) / 2) % HB.cols) + HB.cols) % HB.cols;
  const z = envGrid.zone[r * HB.cols + c] - 1;
  if (z < 0) return null;
  const life = [];
  for (let k = envGrid.offsets[z]; k < envGrid.offsets[z + 1]; k++) life.push({ g: envGrid.idx[k], s: envGrid.score[k] / 255 });
  const squares = [];
  const topLngs = [], bottomLngs = [];
  for (let i = 0; i < envGrid.zone.length; i++) if (envGrid.zone[i] === z + 1) {
    const rr = Math.floor(i / HB.cols), cc = i % HB.cols, x = -180 + 2 * cc, y = 90 - 2 * rr;
    squares.push([[[x, y], [x + 2, y], [x + 2, y - 2], [x, y - 2], [x, y]]]);
  }
  // the zone's highest and lowest rows, and the middle of each
  let hi = -Infinity, lo = Infinity;
  for (const [[[x, y]]] of squares) { hi = Math.max(hi, y); lo = Math.min(lo, y - 2); }
  for (const [[[x, y]]] of squares) { if (y === hi) topLngs.push(x + 1); if (y - 2 === lo) bottomLngs.push(x + 1); }
  const mid = (xs) => xs[Math.floor(xs.length / 2)] ?? lng;
  return { z, life, squares, top: [mid(topLngs.sort((a, b) => a - b)), hi], bottom: [mid(bottomLngs.sort((a, b) => a - b)), lo] };
}

function showPlace(ll) {
  const zone = zoneAt(ll.lng, ll.lat);
  if (!zone) { closePlace(); return; }
  placeAt = ll;
  const part = partAt(zone.z + 1, ll.lng, ll.lat); pickedPart = part;
  if (flatOn()) drawFlat();
  if (map.getLayer("zone-pick")) map.setFilter("zone-pick", part != null ? ["==", ["get", "p"], part] : ["==", ["get", "z"], zone.z + 1]);
  const land = landscapeOf(ll.lng, ll.lat), k = envGrid.classes[zone.z];
  const byGroup = d3.group(zone.life, (x) => slice.groups[slice.genera[x.g].group]);
  const groups = GUIDE_ORDER.filter((g) => byGroup.has(g));
  const icons = groups.map((group) => `<button type="button" class="zone-group" data-group="${group}" style="--c:${groupColor(group)}"
      aria-label="${esc(GROUPS[group]?.label || group)}: ${byGroup.get(group).length} kinds. Show them.">${iconHTML(group)}
      <span>${esc((GROUPS[group]?.label || group).replace(/ & .*|,.*/, ""))}</span></button>`).join("");
  let el = document.getElementById("place-ring");
  if (!el) {
    el = document.createElement("div");
    el.id = "place-ring"; el.className = "place-ring below";
    map.getContainer().appendChild(el);
  }
  el.innerHTML = `<div class="zone-tag" role="dialog" aria-label="This zone" style="--zc:${ZONE_COLORS[k]}">
      <section class="ring-card" hidden></section>
      <header><i class="zone-dot"></i><b>${esc(envGrid.names[k])}</b><span>Zone ${zone.z + 1}</span>
        <button type="button" class="ring-close" aria-label="Close">×</button></header>
      <p class="zone-facts">${esc(land.height)} · ${esc(land.climate)} · ${esc(slice.label)}</p>
      <div class="zone-groups">${icons || `<em>No life of this period suits this zone</em>`}</div>
    </div>`;
  // The group card sits in the right corner (where the staircase is), joined to the spot by a line.
  document.getElementById("place-card")?.remove();
  const card = el.querySelector(".ring-card"); card.id = "place-card"; card.style.setProperty("--zc", ZONE_COLORS[k]);
  map.getContainer().appendChild(card);
  // On wide screens the whole thing (zone tag and card) goes to the right corner, under the logo.
  const tagEl = el.querySelector(".zone-tag");
  document.getElementById("place-side")?.remove();
  if (wide()) {
    const side = document.createElement("div"); side.id = "place-side"; side.style.setProperty("--zc", ZONE_COLORS[k]);
    side.append(tagEl, card); map.getContainer().appendChild(side);
  }
  if (!document.getElementById("place-link")) map.getContainer().insertAdjacentHTML("beforeend", `<svg id="place-link" class="place-link"><line/><circle r="4"/></svg>`);
  el.hidden = false;
  document.body.classList.add("place-open");
  tagEl.querySelector(".ring-close").onclick = (e) => { e.stopPropagation(); closePlace(); };
  tagEl.querySelectorAll("[data-group]").forEach((btn) => btn.onclick = (e) => {
    e.stopPropagation();
    openGroupCard(tagEl, btn, btn.dataset.group, byGroup.get(btn.dataset.group));
  });
  if (!ringBound) { map.on("move", placeRing); ringBound = true; }
  placeRing(); fitPlace();
}

// A group's card, inside the tag (it grows away from the zone): three kinds with big pictures, each a
// different picture (a real picture first, then its article's, then a close relative's), then every other
// kind as a clickable name.
function openGroupCard(el, btn, group, items) {
  const card = document.getElementById("place-card");
  const same = !card.hidden && card.dataset.group === group;
  el.querySelectorAll(".zone-group").forEach((b) => b.classList.toggle("on", b === btn && !same));
  if (same) { card.hidden = true; card.dataset.group = ""; placeRing(); return; }
  card.dataset.group = group;
  card.style.setProperty("--c", groupColor(group));
  const picOf = (g) => { const n = slice.genera[g].name; return placePics[n] || (lifeImages[n]?.path ? { ...lifeImages[n], kind: "alive" } : null); };
  const rank = { alive: 0, article: 1, relative: 2 };
  const featured = [], used = new Set();
  for (const it of [...items].filter((x) => picOf(x.g)).sort((p, q) => rank[picOf(p.g).kind] - rank[picOf(q.g).kind] || q.s - p.s)) {
    const pic = picOf(it.g);
    if (featured.length < 3 && !used.has(pic.path)) { featured.push(it); used.add(pic.path); }
  }
  const rest = items.filter((x) => !featured.includes(x));
  const big = featured.map(({ g, s }) => {
    const pic = picOf(g), name = shortName(slice.genera[g].name);
    const note = pic.kind === "relative" ? `a relative, ${shortName(pic.of)}` : "";
    const where = s >= 1 ? "found here" : "likely here";
    return `<li><button type="button" data-place-g="${g}" style="--o:${(0.45 + 0.55 * s).toFixed(2)}" title="${esc(name)}, ${where}: ${genusLine(g)}">
      <img src="${pic.path}" alt=""><i>${esc(name)}</i><small class="rel">${esc(where)}${note ? `; ${esc(note)}` : ""}</small></button></li>`;
  }).join("");
  // Score 255 = its fossils were found in this zone; anything less is the niche model's guess (scripts/make-habitats.py).
  const isFound = (x) => x.s >= 1;
  const nameBtn = ({ g }) => `<button type="button" class="ring-name-link" data-place-g="${g}" title="${genusLine(g)}">${esc(shortName(slice.genera[g].name))}</button>`;
  const foundNames = rest.filter(isFound).map(nameBtn).join(""), likelyNames = rest.filter((x) => !isFound(x)).map(nameBtn).join("");
  const nFound = items.filter(isFound).length, nLikely = items.length - nFound;
  const counts = [nFound && `${nFound} found here`, nLikely && `${nLikely} likely`].filter(Boolean).join(" · ");
  card.innerHTML = `<header>${iconHTML(group)}<b>${esc(GROUPS[group]?.label || group)}</b><span>${counts}</span>
      <button type="button" class="ring-card-close" aria-label="Close">×</button></header>
    ${big ? `<ul>${big}</ul>` : ""}
    ${foundNames ? `<p class="ring-more-names">Fossils found here</p><div class="ring-names">${foundNames}</div>` : ""}
    ${likelyNames ? `<p class="ring-more-names" title="Not found here: a niche model of its finds elsewhere on this landmass or sea says this place suited it">Likely here, not found</p><div class="ring-names ring-names-likely">${likelyNames}</div>` : ""}`;
  card.hidden = false;
  card.querySelector(".ring-card-close").onclick = (e) => { e.stopPropagation(); card.hidden = true; btn.classList.remove("on"); placeRing(); };
  card.querySelectorAll("[data-place-g]").forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const g = +b.dataset.placeG;
    openCard({ g, n: genusTotals.get(g) || 1, lng: placeAt.lng, lat: placeAt.lat });
  });
  placeRing(); fitPlace();
}

// Keep the tag just below the spot clicked, inside the map, as the map moves; hidden when the spot turns
// behind the globe. Its card scrolls when there is no more room below.
function placeRing() {
  const el = document.getElementById("place-ring");
  if (!el || !placeAt) return;
  const tag = el.querySelector(".zone-tag") || document.createElement("div");
  const c = map.getCenter(), mapEl = map.getContainer(), spot = [placeAt.lng, placeAt.lat];
  const W = mapEl.clientWidth - (wide() ? PANEL_SPACE : 0), H = mapEl.clientHeight;
  const behind = !flatOn() && map.getZoom() < FLAT_ZOOM && d3.geoDistance(spot, [c.lng, c.lat]) > Math.PI / 2 * 0.97;
  const p = spotXY(spot);
  tag.style.setProperty("--room", `${Math.max(160, H - p.y - 72)}px`);
  el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  const w = tag.offsetWidth;
  tag.style.setProperty("--shift", `${Math.max(8 - (p.x - w / 2), Math.min(0, W - 8 - (p.x + w / 2)))}px`);
  el.style.visibility = behind ? "hidden" : "";
  const card = document.getElementById("place-card"), link = document.getElementById("place-link");
  if (link) {
    const side = document.getElementById("place-side"), box = side || card;
    const on = box && (side || !card.hidden) && !behind;
    link.style.display = on ? "" : "none";
    if (on) {
      const m = mapEl.getBoundingClientRect(), b = box.getBoundingClientRect();
      const x2 = b.left - m.left, y2 = b.top - m.top + 28;
      const ln = link.querySelector("line"), dot = link.querySelector("circle");
      ln.setAttribute("x1", p.x); ln.setAttribute("y1", p.y); ln.setAttribute("x2", x2); ln.setAttribute("y2", y2);
      dot.setAttribute("cx", x2); dot.setAttribute("cy", y2);
          }
  }
}

// Pan the map up when the tag would run past the bottom, so it fits below the spot (which stays in view).
function fitPlace() {
  const tag = document.querySelector("#place-ring .zone-tag");
  if (!tag || !placeAt || document.getElementById("place-side") || flatOn()) return;
  const H = map.getContainer().clientHeight, p = map.project([placeAt.lng, placeAt.lat]);
  tag.style.maxHeight = "none";
  const want = Math.min(tag.offsetHeight, H * 0.6);
  tag.style.maxHeight = "";
  const dy = Math.min(p.y + 16 + want - (H - 56), p.y - 70);
  if (dy > 4) map.panBy([0, dy], { duration: 400 });
}

function closePlace() {
  if (map.getLayer("zone-pick")) map.setFilter("zone-pick", ["==", ["get", "z"], -1]);
  document.getElementById("place-ring")?.setAttribute("hidden", "");
  document.getElementById("place-card")?.remove();
  document.getElementById("place-side")?.remove();
  const link = document.getElementById("place-link"); if (link) link.style.display = "none";
  document.body.classList.remove("place-open");
  placeAt = null; pickedPart = null;
  if (flatOn()) drawFlat();
}

// Called by the map's click: with zones for this period, a click shows that zone.
function placeClick(e) {
  if (!envGrid) return false;
  if (e.originalEvent.target.closest?.(".place-ring")) return true;
  if (nav.level === "species") back();
  // one focus per zone: clicking elsewhere in the zone already open keeps the spot where it is
  const z = zoneAt(e.lngLat.lng, e.lngLat.lat);
  if (placeAt && z && zoneAt(placeAt.lng, placeAt.lat)?.z === z.z) return true;
  showPlace(e.lngLat);
  return true;
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && placeAt && nav.level !== "species") closePlace(); });

// Hovering anywhere shows that spot's height and temperature (the open zone and its focus stay put).
(function hoverFacts() {
  const go = () => {
    if (typeof map === "undefined" || !map?.on) return setTimeout(go, 500);
    const tip = document.createElement("div"); tip.className = "hover-facts"; tip.hidden = true;
    map.getContainer().appendChild(tip);
    map.on("mousemove", (e) => {
      if (!envGrid || document.body.classList.contains("species-open") || e.originalEvent.target.closest?.("#place-side,.place-ring,#place-card")) { tip.hidden = true; return; }
      const l = landscapeOf(e.lngLat.lng, e.lngLat.lat);
      if (!l) { tip.hidden = true; return; }
      tip.textContent = `${l.height} · ${l.climate}`;
      tip.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`;
      tip.hidden = false;
    });
    map.getCanvas().addEventListener("mouseleave", () => { tip.hidden = true; });
    const fc = document.getElementById("flatmap");
    fc?.addEventListener("mousemove", (e) => {
      if (!envGrid || document.body.classList.contains("species-open")) { tip.hidden = true; return; }
      const c = fc.getBoundingClientRect(), m = map.getContainer().getBoundingClientRect();
      const ll = flatProjection(flatBox()).invert([e.clientX - c.left, e.clientY - c.top]), l = ll && landscapeOf(ll[0], ll[1]);
      if (!l) { tip.hidden = true; return; }
      tip.textContent = `${l.height} · ${l.climate}`;
      tip.style.transform = `translate(${e.clientX - m.left + 14}px, ${e.clientY - m.top + 14}px)`; tip.hidden = false;
    });
    fc?.addEventListener("mouseleave", () => { tip.hidden = true; });
  };
  go();
})();

// The zones on the flat map, as on the globe: filled by environment, thin dark borders (hidden while a
// species is open), and the clicked patch lit.
function drawFlatZones(ctx, path, speciesOpen) {
  if (!envGrid || !zoneFeatures.length) return;
  // drawn as flat shapes point by point (the zone outlines are flat contours, not spherical polygons)
  path = (f) => { for (const ring of f.geometry.coordinates) ring.forEach((pt, i) => { const [x, y] = flatXY(pt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };
  ctx.globalAlpha = 0.6;
  for (const f of zoneFeatures) { ctx.beginPath(); path(f); ctx.fillStyle = ZONE_COLORS[f.properties.k]; ctx.fill("evenodd"); }
  ctx.globalAlpha = 1;
  if (pickedPart != null && !speciesOpen) { const f = zoneFeatures.find((q) => q.properties.p === pickedPart); if (f) { ctx.beginPath(); path(f); ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fill(); } }
  if (!speciesOpen) { ctx.beginPath(); for (const f of zoneFeatures) path(f); ctx.strokeStyle = "rgba(26,23,18,0.55)"; ctx.lineWidth = 0.8; ctx.stroke(); }
}
