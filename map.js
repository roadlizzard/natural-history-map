// Natural history map on MapLibre. A globe at world zoom that turns into a flat map as you zoom in.
// Four levels, each with its own panel: the world -> a region -> a group of life -> one fossil.

const FAMILIES = {
  invert: { label: "Invertebrates", color: "--fam-invert" },
  vert: { label: "Vertebrates", color: "--fam-vert" },
  plant: { label: "Plants", color: "--fam-plant" },
  other: { label: "Other life", color: "--fam-other" },
};

const GROUPS = {
  "trilobites": { label: "Trilobites", family: "invert",
    blurb: "Extinct sea animals with jointed legs and a three-lobed shell. They were common for nearly 300 million years and died out 252 million years ago." },
  "arthropods": { label: "Arthropods", family: "invert",
    blurb: "Animals with jointed legs and a hard outer skeleton. The first were all sea animals; sea scorpions, shrimps and crabs followed, and insects and spiders only appear on land about 400 million years ago." },
  "molluscs": { label: "Molluscs", family: "invert",
    blurb: "Soft-bodied animals, most with a shell: clams and oysters, snails, and squid relatives such as the coiled ammonites." },
  "brachiopods": { label: "Brachiopods", family: "invert",
    blurb: "Shelled sea animals that look like clams but are not related to them. They filter food from the water with a frilly arm inside the shell." },
  "bryozoans": { label: "Bryozoans", family: "invert",
    blurb: "Tiny animals living in colonies on the seabed, building lacy or branching skeletons. Some ancient reefs were made mostly of them." },
  "corals-sponges": { label: "Corals & sponges", family: "invert",
    blurb: "Simple animals fixed to the seabed. Corals build reefs from their skeletons; sponges pump water through their bodies to catch food." },
  "echinoderms": { label: "Sea stars, urchins & sea lilies", family: "invert",
    blurb: "Sea animals built in five parts, with spiny skin: sea stars, sea urchins, brittle stars and stalked sea lilies." },
  "graptolites": { label: "Graptolites", family: "invert",
    blurb: "Colonies of tiny animals that drifted in the open sea or grew on the seabed, leaving saw-blade fossils. They are distant relatives of animals with a backbone." },
  "conodonts": { label: "Conodonts", family: "vert",
    blurb: "Small eel-like sea animals known almost only from their tiny teeth. Among the first animals with a backbone, but not fish." },
  "forams": { label: "Forams & plankton", family: "other",
    blurb: "Single-celled life with tiny shells of chalk or glass, on the seabed or drifting as plankton: forams, radiolarians, coccoliths, diatoms and dinoflagellates. Their shells built whole limestones and chalk cliffs." },
  "fish": { label: "Fish", family: "vert",
    blurb: "Animals with a backbone, gills and fins. Fish were the first vertebrates and are still the most varied." },
  "amphibians": { label: "Amphibians", family: "vert",
    blurb: "Backboned animals that usually start life in water and can live on land as adults, such as frogs and salamanders." },
  "reptiles": { label: "Reptiles", family: "vert",
    blurb: "Scaly animals that lay eggs on land: crocodiles, turtles, lizards and snakes, and in the age of dinosaurs also flying pterosaurs and sea-going reptiles." },
  "dinosaurs": { label: "Dinosaurs & birds", family: "vert",
    blurb: "Land reptiles that ruled the age of dinosaurs. Birds are the dinosaurs that survived to today." },
  "mammals": { label: "Mammals & relatives", family: "vert",
    blurb: "Furry animals that feed their young on milk, and their earlier relatives. Most were small until the dinosaurs died out 66 million years ago." },
  "plants": { label: "Land plants", family: "plant",
    blurb: "Plants of the land: mosses, ferns, conifers and, from about 130 million years ago, flowering plants. The first land plants appear about 470 million years ago." },
  "algae": { label: "Algae", family: "plant",
    blurb: "Seaweeds and other algae of the sea, many with chalky skeletons that helped build reefs. They lived long before plants reached the land." },
  "other": { label: "Other life", family: "other", noIcon: true,
    blurb: "Microscopic plankton, worms, hyoliths and other life that does not fit the groups above." },
};

// One-line context per slice, keyed by slice time.
const BLURBS = {
  150: "Pangaea is splitting apart. Giant long-necked dinosaurs walk the land while ammonites and sea reptiles fill warm, shallow seas.",
};

// The Earth in natural colours, as a satellite would see it, the same in light and dark mode.
// [elevation in metres, colour]: navy deep ocean, turquoise shallows, green lowlands, then olive,
// brown and pale rock as the land rises. The colours blend smoothly between these stops.
const RELIEF = [
  [-7000, "#081a33"], [-4000, "#0d2a4f"], [-2000, "#143d69"], [-500, "#1f5a86"], [-150, "#2c7aa3"],
  [-30, "#3e95b5"], [0, "#5aaabf"],
  [0.5, "#4f7038"], [250, "#5f7d41"], [600, "#7a8550"], [1000, "#8e815a"], [1600, "#9c8565"],
  [2500, "#a99880"], [4000, "#c3b9aa"], [6000, "#ddd8cf"],
];
// The map-colours key: [label, colour].
const TERRAIN = [
  ["Deep ocean", "#0d2a4f"], ["Shallow sea", "#3e95b5"], ["Lowland", "#5f7d41"],
  ["Upland", "#8e815a"], ["Mountains", "#a99880"],
];

// Bump when data or code changes so browsers fetch fresh files instead of cached ones.
const BUILD = "2026-11-10-accuracy";
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const FLAT_ZOOM = 4.8;          // the globe has finished flattening by this zoom
const PANEL_SPACE = 432;        // panel width plus margin, on wide screens
const MAX_ZOOM = 4.0;            // closest view: the scale bar never reads less than about 500 km
const CLUSTER_RADIUS = 52;      // px: dig sites closer than this on screen merge into one dot

// Event mode (index.html): the globe is the stage for a narrated story; nothing on it is clicked, and its
// guide lines are hidden. The explorable map lives at map.html.
const EVENT_MODE = document.body.dataset.mode === "events";
const familyColor = (fam) => `var(${FAMILIES[fam].color})`;
// One colour per group, so molluscs are always violet, fish always cyan, wherever they appear.
const GROUP_HUES = {
  "trilobites": "#d4a72c", "arthropods": "#e07b39", "molluscs": "#9b7fe8", "brachiopods": "#4fa3e0",
  "corals-sponges": "#e46f9f", "echinoderms": "#c2e05a", "fish": "#38c0c0", "amphibians": "#94a3b8",
  "bryozoans": "#7fb8a4", "graptolites": "#b07cc6", "conodonts": "#5f8fd0", "algae": "#3fa37a", "forams": "#e8d9a8",
  "reptiles": "#2f9e6b", "dinosaurs": "#d6454f", "mammals": "#c8875c", "plants": "#6cc24a", "other": "#8a8880",
};
const groupColor = (group) => GROUP_HUES[group] || familyColor(GROUPS[group].family);

let slice, map, palette;
const binCache = new Map();
// Where you are: the world, or one place (region: {sites, center, total, genera, groups, examples}).
const nav = { level: "world", region: null };
let worldFilter = null;          // a group highlighted on the world map from the panel
let genusTotals = new Map();
let focus = null;

// ---------- Setup ----------

function iconHTML(group, cls = "") {
  const g = GROUPS[group];
  if (g.noIcon) return `<span class="dot ${cls}" style="--icon-color:${groupColor(group)}"></span>`;
  return `<span class="icon ${cls}" style="--icon:url(data/icons/${group}.svg);--icon-color:${groupColor(group)}"></span>`;
}

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  palette = {
    family: Object.fromEntries(Object.keys(FAMILIES).map((k) => [k, v(FAMILIES[k].color)])),
    ring: v("--ring"), line: v("--line-ink"), halo: v("--line-halo"), coast: v("--coast-ink"),
  };
}

const empty = () => ({ type: "FeatureCollection", features: [] });
// "Nanogyra (Nanogyra)" -> "Nanogyra": the subgenus in brackets only adds noise for a general reader.
const shortName = (name) => name.replace(/ \(.*\)$/, "");

function reliefColor() {
  return ["interpolate", ["linear"], ["elevation"], ...RELIEF.flat()];
}

// Terrain and today's coastlines, shared by the main map and the close-up.
function baseSources(time) {
  return {
    dem: { type: "raster-dem", tiles: [`data/terrain/${time}/{z}/{x}/{y}.png?v=${BUILD}`], tileSize: 512, maxzoom: 3, encoding: "terrarium",
      attribution: "Ancient land and sea: PALEOMAP PaleoDEMs, Scotese & Wright 2018" },
    coast: { type: "geojson", data: slice.coastlines },
  };
}
function baseLayers() {
  return [
    { id: "bg", type: "background", paint: { "background-color": RELIEF[1][1] } },
    { id: "relief", type: "color-relief", source: "dem", paint: { "color-relief-color": reliefColor() } },
    { id: "shade", type: "hillshade", source: "dem",
      paint: { "hillshade-exaggeration": 0.95, "hillshade-shadow-color": "rgba(0,0,0,0.75)", "hillshade-highlight-color": "rgba(255,255,255,0.12)", "hillshade-accent-color": "rgba(0,0,0,0.5)" } },
    { id: "coast", type: "line", source: "coast", paint: { "line-color": palette.coast, "line-width": 0.8, "line-dasharray": [1, 2.5] } },
  ];
}

// Colour a dot by its main family: the largest of invertebrates, vertebrates and plants, or grey if none.
function familyColorExpr() {
  const inv = ["get", "inv"], vert = ["get", "vert"], plant = ["get", "plant"];
  return ["case", [">", ["+", inv, vert, plant], 0],
    ["case", [">=", inv, ["max", vert, plant]], palette.family.invert, [">=", vert, plant], palette.family.vert, palette.family.plant],
    palette.family.other];
}

function buildStyle(time) {
  return {
    version: 8,
    sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.9, 3, 0.7, 4.5, 0] },
    // A globe while zoomed out, easing into a flat map as you zoom in.
    projection: { type: ["interpolate", ["linear"], ["zoom"], 3.6, "vertical-perspective", FLAT_ZOOM, "mercator"] },
    sources: {
      ...baseSources(time),
      // Every dig site; sites that would overlap on screen merge into one dot, redone at each zoom.
      places: { type: "geojson", data: placesData(), cluster: true, clusterRadius: CLUSTER_RADIUS, clusterMaxZoom: 14,
        clusterProperties: Object.fromEntries(["total", "inv", "vert", "plant", "other"].map((k) => [k, ["+", ["get", k]]])) },
      leaders: { type: "geojson", data: empty() },
      range: { type: "geojson", data: empty() },
      "range-links": { type: "geojson", data: empty() },
    },
    layers: [
      ...baseLayers(),
      // An opened animal's estimated range (and its relatives', fainter), with the lines that join them.
      { id: "range-fill", type: "fill", source: "range", filter: ["all", ["!=", ["geometry-type"], "Point"], ["!", ["has", "hatch"]]],
        paint: { "fill-color": ["get", "color"], "fill-opacity": ["case", ["get", "own"], 0.38, 0.14] } },
      // An animal's range: cross-hatched in dark red, the terrain showing between the lines, with a thin
      // dark-red outline.
      { id: "range-spray", type: "fill", source: "range", filter: ["has", "hatch"], paint: { "fill-pattern": "hatch" } },
      { id: "range-edge", type: "line", source: "range", filter: ["!=", ["geometry-type"], "Point"],
        paint: { "line-color": ["case", ["has", "hatch"], "#7a0010", "#ffffff"], "line-width": ["case", ["has", "hatch"], 1.5, ["get", "own"], 1.6, 0.9],
          "line-opacity": ["case", ["has", "hatch"], 0.9, ["get", "own"], 0.95, 0.6] } },
      { id: "range-links-halo", type: "line", source: "range-links", layout: { "line-cap": "round" },
        paint: { "line-color": palette.halo, "line-width": 3.6, "line-opacity": 0.7 } },
      { id: "range-links", type: "line", source: "range-links", filter: ["get", "own"], layout: { "line-cap": "round" },
        paint: { "line-color": palette.line, "line-width": 1.8 } },
      { id: "range-links-rel", type: "line", source: "range-links", filter: ["!", ["get", "own"]], layout: { "line-cap": "butt" },
        paint: { "line-color": palette.line, "line-width": 1.2, "line-dasharray": [4, 3] } },
      // An opened animal's own fossil finds (the only dots shown while it is open).
      { id: "range-sites", type: "circle", source: "range", filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 4, "circle-color": "#ffffff", "circle-stroke-color": "#111111", "circle-stroke-width": 1.5 } },
      // Area shows how many fossils; colour, the main family; a hairline keeps neighbours apart.
      { id: "places", type: "circle", source: "places", layout: { "circle-sort-key": ["-", 0, ["get", "total"]] },
        paint: { "circle-radius": ["min", 26, ["max", 3, ["*", 0.42, ["sqrt", ["get", "total"]]]]],
          "circle-color": familyColorExpr(), "circle-opacity": 0.8,
          "circle-stroke-width": 0.75, "circle-stroke-color": palette.ring } },
      { id: "leaders", type: "line", source: "leaders", paint: { "line-color": palette.line, "line-width": 0.6, "line-opacity": 0.45 } },
    ],
  };
}

// One point per dig site, with its fossil count split by family (only one group's, when a group is highlighted).
function placesData() {
  const features = [];
  for (const site of slice.siteList) {
    const fam = { invert: 0, vert: 0, plant: 0, other: 0 };
    for (const [g, , n] of site.occ) {
      const group = slice.groups[slice.genera[g].group];
      if (worldFilter && group !== worldFilter) continue;
      fam[GROUPS[group].family] += n;
    }
    const total = fam.invert + fam.vert + fam.plant + fam.other;
    if (!total) continue;
    features.push({ type: "Feature", properties: { idx: site.idx, total, inv: fam.invert, vert: fam.vert, plant: fam.plant, other: fam.other },
      geometry: { type: "Point", coordinates: [site.lng, site.lat] } });
  }
  return { type: "FeatureCollection", features };
}

// Which period to show: ?t=<million years ago>, else the Late Jurassic. A tour can ride along in ?tour=&step=.
const params = new URLSearchParams(location.search);
let slices = [], agent = { images: {}, habitats: {}, descriptions: {}, tours: {} };

async function load(time) {
  const get = (url) => d3.json(`${url}?v=${BUILD}`).catch(() => ({}));
  [slices, agent.images, agent.habitats, agent.descriptions, agent.tours] = await Promise.all(
    ["data/slices.json", "data/agent/images.json", "data/agent/habitats.json", "data/agent/descriptions.json", "data/agent/tours.json"].map(get));
  slices = Array.isArray(slices) ? slices.filter((s) => s.ready || s.map) : [];

  // With no period asked for, start at the oldest, the beginning of the story.
  if (time == null || !slices.some((s) => s.time === time)) time = Math.max(...slices.map((s) => s.time), 150);
  const [data, credits] = await Promise.all([
    d3.json(`data/slice-${time}.json?v=${BUILD}`),
    d3.json(`data/group-icons.json?v=${BUILD}`),
  ]);
  slice = data;
  life = await loadLife(time);
  slice.blurb = BLURBS[time] || slices.find((s) => s.time === time)?.blurb || "";
  slice.siteList = slice.sites.map(([lng, lat, occ, cc], idx) => ({ lng, lat, occ, cc, idx }));
  for (const s of slice.siteList) for (const [g, , n] of s.occ) genusTotals.set(g, (genusTotals.get(g) || 0) + n);
  readPalette();
  renderKey();
  renderSources(credits);
  d3.select("#period").text(slice.time ? `${slice.label}, about ${slice.time} million years ago` : `${slice.label}, the last 2.6 million years`);
  renderTimeline();
  document.title = `${slice.label} · Anthropocene`;

  map = new maplibregl.Map({
    container: "map", style: buildStyle(time),
    // Arriving from a time change, keep looking at the same spot.
    center: params.has("c") ? params.get("c").split(",").slice(0, 2).map(Number) : startingCenter(),
    zoom: params.has("c") ? Number(params.get("c").split(",")[2]) : worldZoom(),
    minZoom: 0.6, maxZoom: MAX_ZOOM, dragRotate: false, pitchWithRotate: false, touchPitch: false,
    scrollZoom: false,                    // two-finger scroll pans instead; pinch zooms (see trackpad())
    attributionControl: { compact: true }, fadeDuration: REDUCED ? 0 : 300,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
  setPadding();
  window.mapLoaded = new Promise((r) => map.once("load", r));
  if (EVENT_MODE && typeof startStory === "function") startStory();

  map.on("load", () => { bindInput(); bindViewSwitch();
    renderAll(); addPlaceNames(time); addIce(); addLife(); renderLadder(); showKeptMilestones(); startTourStep();
    if (params.has("ms")) setTimeout(() => { const go = () => openMilestone(+params.get("ms")); milestoneImages["541"] ? go() : setTimeout(go, 1500); }, 800); });
  window.addEventListener("resize", () => { setPadding(); if (markers.length) layoutMarkers(); layoutCards(); if (flat) drawFlat(); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
}

const wide = () => window.innerWidth > 760;
function setPadding() { map.setPadding(wide() ? { left: 0, right: PANEL_SPACE, top: 20, bottom: 20 } : { left: 0, right: 0, top: 20, bottom: 20 }); }

// Face the globe toward where most fossils are.
function startingCenter() {
  return weightedCentre(slice.siteList.map((s) => [s, d3.sum(s.occ, (o) => o[2])]), 40);
}

// A zoom at which the whole globe fits beside the panel (world circumference is 512 * 2^zoom px).
function worldZoom() {
  const el = document.getElementById("map");
  const availW = el.clientWidth - (wide() ? PANEL_SPACE : 0);
  const R = Math.min(availW, el.clientHeight) * 0.42;
  return Math.log2(2 * Math.PI * R / 512);
}

function applyTheme() {
  readPalette();
  map.setPaintProperty("coast", "line-color", palette.coast);
  map.setPaintProperty("places", "circle-color", life ? "#14120e" : familyColorExpr());
  map.setPaintProperty("places", "circle-stroke-color", palette.ring);
  map.setPaintProperty("leaders", "line-color", palette.line);
  for (const id of ["range-links", "range-links-rel"]) map.setPaintProperty(id, "line-color", palette.line);
  map.setPaintProperty("range-links-halo", "line-color", palette.halo);
  showRange();
}

function renderKey() {
  d3.select("#key").html(Object.entries(FAMILIES).map(([, f]) =>
    `<li><span class="sw" style="--c:var(${f.color})"></span>${f.label}</li>`).join(""));
  d3.select("#terrain-key").html(TERRAIN.map(([label, color]) =>
    `<li><span class="sw" style="--c:${color}"></span>${label}</li>`).join("") +
    `<li><span class="coast"></span>Today's coastlines</li>`);
  d3.select("#map-colours").on("click", function () {
    const open = this.getAttribute("aria-expanded") !== "true";
    this.setAttribute("aria-expanded", open);
    d3.select("#terrain-key").attr("hidden", open ? null : true);
  });
}

function renderSources(credits) {
  const icons = Object.entries(credits).map(([g, c]) => `<a href="${c.source}">${GROUPS[g].label}</a> (${c.contributor})`).join(", ");
  d3.select("#sources").html(
    `Fossil records: <a href="https://paleobiodb.org">Paleobiology Database</a>. ` +
    `Ancient land and sea: <a href="https://doi.org/10.5281/zenodo.5460860">PALEOMAP PaleoDEMs, Scotese &amp; Wright 2018</a> (CC BY 4.0). ` +
    `Fossil positions and today's coastlines: PALEOMAP plate model via the <a href="https://gws.gplates.org">GPlates Web Service</a>. ` +
    `Map: <a href="https://maplibre.org">MapLibre</a>; hexagons: <a href="https://h3geo.org">H3</a>. ` +
    `Descriptions and photos: <a href="https://en.wikipedia.org">Wikipedia</a> and Wikimedia Commons (text CC BY-SA 4.0), credited on each card. ` +
    `Group silhouettes from <a href="https://www.phylopic.org">PhyloPic</a> (public domain / CC0): ${icons}.`);
}

// ---------- Regions ----------

// H3 grouping, used for the panel's "richest regions" list and for search.
function binsAt(r) {
  if (binCache.has(r)) return binCache.get(r);
  const out = new Map();
  for (const s of slice.siteList) {
    const id = h3.latLngToCell(s.lat, s.lng, r);
    if (!out.has(id)) out.set(id, { id, sites: [] });
    out.get(id).sites.push(s);
  }
  for (const b of out.values()) {
    b.total = d3.sum(b.sites, (s) => d3.sum(s.occ, (o) => o[2]));
    const counts = d3.rollups(b.sites.flatMap((s) => s.occ), (v) => d3.sum(v, (o) => o[2]), ([g]) => slice.groups[slice.genera[g].group]);
    const named = counts.filter(([g]) => g !== "other").sort((a, c) => c[1] - a[1]);
    b.top = named.length ? named[0][0] : "other";
  }
  binCache.set(r, out);
  return out;
}

// Centre of [site, weight] pairs on the sphere (latitude optionally clamped).
function weightedCentre(pairs, maxLat = 90) {
  let x = 0, y = 0, z = 0;
  for (const [site, w] of pairs) {
    const l = site.lng * Math.PI / 180, p = site.lat * Math.PI / 180;
    x += w * Math.cos(p) * Math.cos(l); y += w * Math.cos(p) * Math.sin(l); z += w * Math.sin(p);
  }
  const lat = Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI;
  return [Math.atan2(y, x) * 180 / Math.PI, Math.max(-maxLat, Math.min(maxLat, lat))];
}

// A region from a set of dig sites: what was found there, by group, and its present-day country.
function makeRegion(sites) {
  const genera = new Map();
  const byGroup = new Map();
  for (const s of sites) {
    for (const [g, , n] of s.occ) {
      genera.set(g, (genera.get(g) || 0) + n);
      const group = slice.groups[slice.genera[g].group];
      if (!byGroup.has(group)) byGroup.set(group, { group, n: 0, kinds: new Set() });
      const e = byGroup.get(group);
      e.n += n; e.kinds.add(g);
    }
  }
  const groups = [...byGroup.values()].map((e) => ({ group: e.group, n: e.n, kinds: e.kinds.size })).sort((a, c) => c.n - a.n);
  const total = d3.sum(groups, (d) => d.n);
  return { sites, siteSet: new Set(sites), center: weightedCentre(sites.map((s) => [s, d3.sum(s.occ, (o) => o[2])])), total, genera, groups };
}

// ---------- Moving between levels ----------

const EXAMPLES_MAX = 8;          // how many example fossils a place shows
const PLACE_MAX_ZOOM = 4.0;      // clicking a place zooms no closer than that either

function goWorld() {
  nav.level = "world"; nav.region = null; nav.species = null;
  setTimeout(showGroupRange, 0);
  clearNet();
  showRange();
  focus = null;
  clearMarkers();
  map.flyTo({ center: map.getCenter(), zoom: worldZoom(), duration: REDUCED ? 0 : 1200, essential: false });
  renderAll();
}

// Zoom to a place (any object with .sites), then pin a few example fossils on it.
function goRegion(b, then = null) {
  clearMarkers();
  worldFilter = null; map.getSource("group-range")?.setData(empty());
  clearNet();
  nav.level = "region";
  nav.species = null;
  nav.region = makeRegion(b.sites);
  nav.region.area = b.area || null;
  nav.region.examples = pickExamples(nav.region);
  frameRegion();
  map.once("moveend", () => { if (then) addExampleMarkers(); drawNet(); if (then) then(); });
  renderAll();
}

// Bring the open place into view, zoomed no closer than the 500 km limit.
function frameRegion() {
  const bounds = new maplibregl.LngLatBounds();
  for (const s of nav.region.sites) bounds.extend([s.lng, s.lat]);
  if (nav.region.area) for (const poly of nav.region.area.geometry.coordinates) for (const [x, y] of poly[0]) if (x >= -180 && x <= 180) bounds.extend([x, y]);
  const cam = map.cameraForBounds(bounds, { padding: 120 });
  map.flyTo({ center: cam?.center ?? nav.region.center, zoom: Math.max(Math.min(4.2, map.getZoom() + 1), Math.min(PLACE_MAX_ZOOM, cam?.zoom ?? PLACE_MAX_ZOOM)),
    duration: REDUCED ? 0 : 1000, essential: false });
}

// A few representative fossils, all with a photo and a proper description: the best-known one from
// each of the place's main groups, then the next best overall, up to EXAMPLES_MAX.
function pickExamples(region) {
  const info = (g) => (typeof genusInfo !== "undefined" ? genusInfo[slice.genera[g].name] : null);
  const good = (g) => info(g)?.image && agent.images?.[info(g).image.path]?.matches !== false && (info(g).text || "").length >= 200;
  const life = (g) => (typeof lifeInfo !== "undefined" ? lifeInfo[slice.genera[g].name] : null);
  const ranked = [...region.genera].filter(([g]) => good(g))
    .map(([g, n]) => ({ g, n, group: slice.groups[slice.genera[g].group],
      s: n + (life(g)?.sections ? 50 : 0) + (life(g)?.eco ? 20 : 0) + (typeof lifeImages !== "undefined" && lifeImages[slice.genera[g].name] ? 2000 : 0) }))
    .sort((a, c) => c.s - a.s);
  const picked = [];
  for (const { group } of region.groups) {
    const best = ranked.find((r) => r.group === group && !picked.includes(r));
    if (best && picked.length < EXAMPLES_MAX) picked.push(best);
  }
  for (const r of ranked) { if (picked.length >= EXAMPLES_MAX) break; if (!picked.includes(r)) picked.push(r); }
  // Each sits at the dig site where it turns up most.
  return picked.map(({ g, n }) => {
    let best = null, bestN = -1;
    for (const s of region.sites) {
      const here = d3.sum(s.occ.filter(([gi]) => gi === g), (o) => o[2]);
      if (here > bestN) { best = s; bestN = here; }
    }
    return { g, n, lng: best.lng, lat: best.lat };
  });
}

// Open any kind found in the open place, at the dig site where it turns up most.
function openGenusHere(g) {
  let it = nav.region.examples.find((e) => e.g === g);
  if (!it) {
    const site = nav.region.sites.map((s) => [s, d3.sum(s.occ.filter(([gi]) => gi === g), (o) => o[2])]).sort((a, c) => c[1] - a[1])[0][0];
    it = { g, n: nav.region.genera.get(g), lng: site.lng, lat: site.lat };
  }
  openCard(it);
}

function back() {
  if (nav.level === "species") backToPlace();
  else if (nav.level === "region") goWorld();
}
// From an animal back to the place it was opened from, with the same fossil dots.
function backToPlace() {
  nav.level = nav.region ? "region" : "world";
  nav.species = null;
  showRange();
  renderAll();
  if (nav.region) {
    frameRegion();
    map.once("moveend", () => { if (markers.length) layoutMarkers(); });
  }
}

// From search: go to the place where a genus is best known and open its card there.
function goToGenus(g) {
  const site = slice.siteList.map((s) => [s, d3.sum(s.occ.filter(([gi]) => gi === g), (o) => o[2])]).sort((a, c) => c[1] - a[1])[0][0];
  const b = binsAt(2).get(h3.latLngToCell(site.lat, site.lng, 2));
  goRegion(b, () => {
    let it = nav.region.examples.find((e) => e.g === g);
    if (!it) {   // make sure the one searched for is among the examples shown
      it = { g, n: nav.region.genera.get(g), lng: site.lng, lat: site.lat };
      nav.region.examples.push(it);
      clearMarkers(); addExampleMarkers();
    }
    openCard(it);
  });
}

function renderAll() {
  if (!map.getSource("places")) return;
  map.getSource("places").setData(placesData());
  map.setPaintProperty("places", "circle-opacity", window.HIDE_FINDS ? 0 : nav.region ? 0.35 : (life ? 0.55 : 0.8));
  if (typeof renderPanel === "function") renderPanel();
  if (net) net.svg.style("display", nav.level === "region" ? null : "none");
  showAreaMarkers();
  showPlaceLayers();

}

// ---------- Example fossils and their cards ----------

let markers = [];
const cards = new Map();   // genus -> {it, el}: open cards, each until its × is clicked

function clearMarkers() {
  for (const m of markers) m.marker.remove();
  markers = [];
  map.getSource("leaders")?.setData(empty());
}

// One plain dot per example, in its group's colour, named beside it. Spread so none overlap,
// with a hairline back to the dig site when a dot has had to move.
function addExampleMarkers() {
  if (!nav.region) return;
  for (const it of nav.region.examples) {
    const genus = slice.genera[it.g];
    const group = slice.groups[genus.group];
    const el = document.createElement("button");
    el.className = "example";
    const name = shortName(genus.name);
    el.setAttribute("aria-label", `${name}, ${GROUPS[group].label}. Open its card.`);
    el.innerHTML = `<span class="disc" style="--icon-color:${groupColor(group)}"></span><span class="label"><i>${name}</i></span>`;
    el.addEventListener("click", (e) => { e.stopPropagation(); openCard(it); });
    it.labelW = name.length * 7.2 + 14;
    const marker = new maplibregl.Marker({ element: el, anchor: "left", offset: [-8, 0] }).setLngLat([it.lng, it.lat]).addTo(map);
    markers.push({ it, el, marker });
  }
  layoutMarkers();
}

function layoutMarkers() {
  if (!markers.length) return;
  const nodes = markers.map((m, i) => {
    const { x: ax, y: ay } = map.project([m.it.lng, m.it.lat]);
    const half = (16 + m.it.labelW) / 2;
    const a = i * 2.39996, r = 4 + i * 3;
    return { m, ax, ay, half, x: ax + half - 8 + r * Math.cos(a), y: ay + r * Math.sin(a) };
  });
  d3.forceSimulation(nodes)
    .force("x", d3.forceX((d) => d.ax + d.half - 8).strength(0.08))
    .force("y", d3.forceY((d) => d.ay).strength(0.08))
    .force("collide", d3.forceCollide((d) => d.half * 0.75 + 6).iterations(4))
    .stop().tick(240);
  const leaders = [];
  for (const d of nodes) {
    const cx = d.x - d.half + 8;
    const ll = map.unproject([cx, d.y]);
    d.m.marker.setLngLat(ll);
    d.m.pos = ll;
    if (Math.hypot(cx - d.ax, d.y - d.ay) > 10) {
      leaders.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[d.m.it.lng, d.m.it.lat], [ll.lng, ll.lat]] } });
    }
  }
  map.getSource("leaders")?.setData({ type: "FeatureCollection", features: leaders });
}

// Open an animal in the big panel on the right (and shade where it lived on the map).
function openCard(it) {
  nav.level = "species";
  nav.species = it;
  if (net) net.svg.style("display", "none");   // the animal's range takes the map; back brings the network again
  showPlaceLayers();
  showRange();
  if (typeof renderPanel === "function") renderPanel();
}

function layoutCards() {
  const svg = d3.select("#card-lines");
  if (!cards.size) { svg.selectAll("line").remove(); return; }
  const mapEl = map.getContainer();
  const W = mapEl.clientWidth - (wide() ? PANEL_SPACE : 0), H = mapEl.clientHeight, TOP = 48, GAP = 8;
  svg.attr("width", mapEl.clientWidth).attr("height", H);
  const list = [...cards.values()].map(({ it, el }) => {
    const m = markers.find((x) => x.it.g === it.g);
    return { it, el, p: map.project(m?.pos ?? [it.lng, it.lat]), w: el.offsetWidth, h: el.offsetHeight };
  });

  // First choice: each card right beside its fossil, in the first spot that is clear of the others.
  const placed = [];
  const overlaps = (r) => placed.some((q) => r.x < q.x + q.w + GAP && q.x < r.x + r.w + GAP && r.y < q.y + q.h + GAP && q.y < r.y + r.h + GAP);
  let fits = true;
  for (const c of list) {
    const { p, w, h } = c;
    const clamp = (r) => ({ ...r, x: Math.max(GAP, Math.min(W - w - GAP, r.x)), y: Math.max(TOP, Math.min(H - h - GAP, r.y)) });
    let best = null;
    for (const gap of [22, 70, 140]) {
      for (const [dx, dy] of [[gap, -h / 2], [-w - gap, -h / 2], [-w / 2, -h - gap], [-w / 2, gap], [gap, gap], [-w - gap, gap], [gap, -h - gap], [-w - gap, -h - gap]]) {
        const r = clamp({ x: p.x + dx, y: p.y + dy, w, h });
        if (!overlaps(r)) { best = r; break; }
      }
      if (best) break;
    }
    if (!best) { fits = false; break; }
    placed.push(best); c.r = best;
  }

  // Too crowded for that: line all the cards up in tidy rows instead. If even the rows are full,
  // close the oldest card to make room.
  if (!fits) {
    let x = GAP, y = TOP, rowH = 0;
    for (const c of list) {
      if (x + c.w > W - GAP) { x = GAP; y += rowH + GAP; rowH = 0; }
      c.r = { x, y, w: c.w, h: c.h };
      x += c.w + GAP; rowH = Math.max(rowH, c.h);
    }
    if (y + rowH > H - GAP && list.length > 1) {
      const [oldest] = cards.keys();
      cards.get(oldest).el.remove(); cards.delete(oldest); showRange();
      layoutCards();
      return;
    }
  }

  const lines = [];
  for (const { el, p, r } of list) {
    el.style.transform = `translate(${Math.round(r.x)}px, ${Math.round(r.y)}px)`;
    // Hairline from the fossil to the nearest point on its card.
    lines.push([p.x, p.y, Math.max(r.x, Math.min(r.x + r.w, p.x)), Math.max(r.y, Math.min(r.y + r.h, p.y))]);
  }
  svg.selectAll("line").data(lines).join("line")
    .attr("x1", (d) => d[0]).attr("y1", (d) => d[1]).attr("x2", (d) => d[2]).attr("y2", (d) => d[3]);
}

// ---------- Where an animal lived: its estimated range ----------
// Fossils only survive where rock formed and was found, so the range is an estimate: the ancient sea
// (or land, for land animals) within RANGE_KM of any place the animal was found at this time.

const RANGE_KM = 450;
const REACH_KM = 4000;         // furthest a shaded range reaches from one of its finds (as scripts/make-habitats.py)
const RELATIVES_MAX = 6;
let demGrid = null;

function dem() {
  if (demGrid) return demGrid;
  const bytes = Uint8Array.from(atob(slice.dem.elev), (c) => c.charCodeAt(0));
  demGrid = { elev: new Int16Array(bytes.buffer), cols: slice.dem.cols, rows: slice.dem.rows };
  return demGrid;
}
const cellOf = (lng, lat) => {
  const { cols, rows } = dem();
  return [((Math.round(lng + 180) % cols) + cols) % cols, Math.max(0, Math.min(rows - 1, Math.round(90 - lat)))];
};

// Where did it live: the sea, fresh water (rivers and lakes), or land? PBDB's ecology says when it can.
// Fish, shellfish, corals and the like always lived in water, whatever rock their fossils ended up in.
// Same as scripts/groups.py's WATER.
const WATER_GROUPS = new Set(["fish", "molluscs", "brachiopods", "bryozoans", "corals-sponges", "echinoderms",
  "trilobites", "graptolites", "conodonts", "forams", "algae", "other"]);
const LAND_GROUPS = new Set(["dinosaurs", "mammals", "plants"]);
function habitat(g) {
  const name = slice.genera[g].name, group = slice.groups[slice.genera[g].group];
  const water = WATER_GROUPS.has(group);
  const said = agent.habitats?.[name]?.habitats;
  if (said && !said.includes("unknown")) {
    const h = { sea: said.includes("sea") || said.includes("coast"), fresh: said.includes("freshwater"),
                land: said.includes("land") && !water, quote: agent.habitats[name].quote };
    if (LAND_GROUPS.has(group) && h.land) h.fresh = false;       // a dinosaur by a river still lived on land
    if (h.sea || h.fresh || h.land) return h;
  }
  const env = lifeInfo[name]?.eco?.environment || "";
  const h = {
    sea: /marine|brackish|lagoon|coastal|shelf|oceanic|reef|hypersaline/.test(env),
    fresh: /freshwater|lacustrine|fluvial/.test(env),
    land: /terrestrial/.test(env) && !water,
  };
  if (water && /terrestrial/.test(env) && !h.sea) h.fresh = true;   // a fish "on land" lived in its rivers or lakes
  if (!h.sea && !h.fresh && !h.land) {
    if (water) h.sea = true;
    else {
      const sites = slice.siteList.filter((s) => s.occ.some(([gi]) => gi === g));
      const wet = sites.filter((s) => { const [c, r] = cellOf(s.lng, s.lat); return dem().elev[r * dem().cols + c] <= 0; }).length;
      if (wet * 2 >= sites.length) h.sea = true; else h.land = true;
    }
  }
  return h;
}
const habitatWords = (h) => [h.sea && "seas", h.fresh && "rivers and lakes", h.land && "land"].filter(Boolean).join(" and ");

// Grid cells (1°) where it probably lived: within RANGE_KM of its finds, on sea or land as it lived.
// Rivers and lakes are too small for a 1° grid, so fresh-water life only gets the cells round its finds.
function rangeMask(g) {
  const { elev, cols, rows } = dem();
  const mask = new Uint8Array(cols * rows);
  const h = habitat(g);
  const sites = slice.siteList.filter((s) => s.occ.some(([gi]) => gi === g));
  const rDeg = RANGE_KM / 111.2;
  for (const s of sites) {
    const [c0, r0] = cellOf(s.lng, s.lat);
    mask[r0 * cols + c0] = 1;
    if (h.fresh) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const r = r0 + dr; if (r < 0 || r >= rows) continue;
        mask[r * cols + ((c0 + dc + cols) % cols)] = 1;
      }
    }
    if (!h.sea && !h.land) continue;
    for (let r = Math.max(0, Math.floor(r0 - rDeg)); r <= Math.min(rows - 1, Math.ceil(r0 + rDeg)); r++) {
      const lat = 90 - r;
      const span = Math.min(180, Math.ceil(rDeg / Math.max(0.05, Math.cos(lat * Math.PI / 180))));
      for (let dc = -span; dc <= span; dc++) {
        const c = ((c0 + dc) % cols + cols) % cols;
        if (d3.geoDistance([s.lng, s.lat], [c - 180, lat]) * 6371 > RANGE_KM) continue;
        const e = elev[r * cols + c];
        if ((h.sea && e <= 0) || (h.land && e > 0)) mask[r * cols + c] = 1;
      }
    }
  }
  return { mask, sites };
}

// ---------- Where it probably lived: matching conditions (a simple niche model) ----------
// Fossils survive only where rock happened to preserve them, so the finds are a tiny sample of where an
// animal lived. Take the conditions at every place it and its close relatives were found in this period
// (latitude as a stand-in for climate, land or sea, height or depth, distance from the coast), then shade
// every cell with the same conditions on the same connected landmass or sea as its own finds.

let coastGrid = null;
function coastDistance() {         // cells (1°) from each cell to the nearest coast, by breadth-first search
  if (coastGrid) return coastGrid;
  const { elev, cols, rows } = dem();
  const d = new Int16Array(cols * rows).fill(-1), queue = [];
  const land = (i) => elev[i] > 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr; if (rr < 0 || rr >= rows) continue;
      if (land(rr * cols + ((c + dc + cols) % cols)) !== land(i)) { d[i] = 0; queue.push(i); break; }
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], r = Math.floor(i / cols), c = i % cols;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr; if (rr < 0 || rr >= rows) continue;
      const j = rr * cols + ((c + dc + cols) % cols);
      if (d[j] < 0) { d[j] = d[i] + 1; queue.push(j); }
    }
  }
  return (coastGrid = d);
}

// Connected stretches of land (or of sea), 8 neighbours, wrapping round the antimeridian.
function regionsOf(isIn) {
  const { cols, rows } = dem();
  const id = new Int32Array(cols * rows).fill(-1);
  let n = 0;
  for (let s = 0; s < cols * rows; s++) {
    if (id[s] >= 0 || !isIn(s)) continue;
    const stack = [s]; id[s] = n;
    while (stack.length) {
      const i = stack.pop(), r = Math.floor(i / cols), c = i % cols;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr; if (rr < 0 || rr >= rows) continue;
        const j = rr * cols + ((c + dc + cols) % cols);
        if (id[j] < 0 && isIn(j)) { id[j] = n; stack.push(j); }
      }
    }
    n++;
  }
  return id;
}
let landRegions = null, seaRegions = null;

const quantile = (v, q) => { const a = [...v].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))]; };

// Where it could have lived on the Earth of its own time. Its finds tell us its habitat (land, rivers
// and lakes, shallow or open sea) and its climate (the band of latitudes it was found in, in either
// hemisphere); every part of that period's land or sea with that habitat and climate is shaded, on any
// landmass. A few lone finds far from the rest (often old or doubtful identifications) are kept as dots
// but do not set its climate.
// The yearly surface temperature (°C) for every 1° cell of the slice's Earth, from the period's climate model
// (Scotese et al. 2021: HadCM3L runs on the same PALEOMAP Earth, adjusted to agree with oxygen-isotope
// temperatures and climate-sensitive rocks; see scripts/fetch-paleotemp.py). "low" is the same read at
// lowland level (6.5 °C per km), where fossils form. Without that grid, a rough stand-in: warm at the
// equator, cool towards the poles, cooler with height and deep inside a continent.
let climate = null;
function climateGrid() {
  if (climate) return climate;
  const { elev, cols, rows } = dem();
  if (slice.temp) {
    const b = Uint8Array.from(atob(slice.temp.t), (c) => c.charCodeAt(0)), raw = new Int16Array(b.buffer);
    const t = new Float32Array(cols * rows), low = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) { t[i] = raw[i] / 10; low[i] = elev[i] > 0 ? t[i] + 6.5 * elev[i] / 1000 : t[i]; }
    return (climate = { t, low, modelled: true });
  }
  const coast = coastDistance();
  const t = new Float32Array(cols * rows), low = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const lat = (90 - r) * Math.PI / 180, s2 = Math.sin(lat) ** 2;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c, e = elev[i];
      let v = 29 - 30 * s2;
      if (e > 0) v -= 0.25 * Math.min(coast[i], 30) * (0.3 + s2);
      low[i] = v;                                  // as if at the lowland floor (where fossils form)
      t[i] = e > 0 ? v - 6.5 * e / 1000 : v;
    }
  }
  return (climate = { t, low });
}

const RANGE_LEVELS = [0.12, 0.25, 0.4, 0.55, 0.7, 0.85];   // bands of the gradient, faint to dense

// Nested outlines of a 0-1 grid at each level, for drawing a gradient as stacked translucent bands.
function densityShapes(values) {
  const { cols, rows } = dem();
  const n = cols + 2, grid = new Float64Array(n * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) grid[j * n + i] = values[j * cols + ((i - 1 + cols) % cols)];
  return d3.contours().size([n, rows]).thresholds(RANGE_LEVELS)(grid).map((shape) => ({ type: "MultiPolygon",
    coordinates: shape.coordinates.map((poly) => poly.map((ring) => ring.map(([x, y]) => [x - 1.5 - 180, Math.max(-90, Math.min(90, 90 - (y - 0.5)))]))) }));
}

// A small MaxEnt (maximum entropy) species model, fitted in the browser. Environment per 1° cell:
// estimated temperature, height (land) or depth (sea), distance from the coast and latitude, each with its
// square, so it can learn a preferred middle. Presences are the cells of its finds; background is a
// sample of every cell of its habitat. The fitted model gives each cell a relative suitability, 0 to 1.
function maxentSuitability(presence, habitatCells, landLife) {
  const { elev } = dem(), coast = coastDistance(), { t, low } = climateGrid(), cols = dem().cols;
  const alat = (i) => Math.abs(90 - Math.floor(i / cols)) / 30;
  // Land life: climate only (temperature and latitude). A 1° cell's height and distance from the sea say
  // little about a dig site, which is usually a lowland basin, so a find's temperature is read as at
  // lowland level. Sea life: temperature, depth, distance from the coast and latitude (reliable at sea).
  const raw = landLife ? (i, found) => [found ? low[i] : t[i], alat(i)]
    : (i) => [t[i], elev[i] / 1000, Math.min(coast[i], 40) / 10, alat(i)];
  const step = Math.max(1, Math.floor(habitatCells.length / 4000));
  const bg = habitatCells.filter((_, k) => k % step === 0);
  const base = bg.map((i) => raw(i, false)), n0 = base[0].length;
  const mean = d3.range(n0).map((j) => d3.mean(base, (v) => v[j])), sd = d3.range(n0).map((j) => d3.deviation(base, (v) => v[j]) || 1);
  const feat = (i, found = false) => { const v = raw(i, found).map((x, j) => (x - mean[j]) / sd[j]); return v.concat(v.map((x) => x * x)); };
  const B = bg.map((i) => feat(i)), P = presence.map((i) => feat(i, true)), m = B[0].length;
  const target = d3.range(m).map((j) => d3.mean(P, (v) => v[j]));
  // Fewer finds, more regularisation: a handful of spots must not pin it to a handful of exact environments.
  const w = new Float64Array(m), lambda = 0.05 * Math.max(1, 30 / presence.length), rate = 0.3;
  for (let it = 0; it < 250; it++) {                 // gradient ascent on the regularised log-likelihood
    const sc = B.map((v) => v.reduce((a, x, j) => a + x * w[j], 0)), mx = d3.max(sc);
    const ex = sc.map((x) => Math.exp(x - mx)), Z = d3.sum(ex);
    for (let j = 0; j < m; j++) {
      let e = 0; for (let k = 0; k < B.length; k++) e += ex[k] * B[k][j];
      w[j] += rate * (target[j] - e / Z - lambda * w[j]);
    }
  }
  const score = (i, found) => feat(i, found).reduce((a, x, j) => a + x * w[j], 0);
  const ref = d3.quantile(presence.map((i) => score(i, true)).sort(d3.ascending), 0.1);   // 90% of its finds count as fully suitable
  return (i) => Math.min(1, Math.exp(score(i, false) - ref));
}

function nicheMask(g) {
  const { elev, cols, rows } = dem();
  const h = habitat(g), genus = slice.genera[g];
  const own = slice.siteList.filter((s) => s.occ.some(([gi]) => gi === g));
  const count = (st) => d3.sum(st.occ.filter(([gi]) => gi === g), (o) => o[2]) || 1;
  const cellsOf = (sites) => sites.map((st) => { const [c, r] = cellOf(st.lng, st.lat); return r * cols + c; });

  // Clusters of finds (joined when within 1500 km); clusters far smaller than the main one are set aside.
  const club = own.map((_, i) => i);
  const root = (i) => (club[i] === i ? i : (club[i] = root(club[i])));
  for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) {
    if (d3.geoDistance([own[i].lng, own[i].lat], [own[j].lng, own[j].lat]) * 6371 < 1500) club[root(i)] = root(j);
  }
  const clusters = d3.groups(own, (_, i) => root(i)).map(([, sites]) => ({ sites, n: d3.sum(sites, count) }));
  const top = d3.max(clusters, (c) => c.n) || 1;
  const kept = clusters.filter((c) => c.n >= top * 0.15);
  const core = kept.flatMap((c) => c.sites);

  // Climate band: the core finds' latitudes (with relatives' when it has few finds), plus a margin.
  let sample = core;
  for (const rank of [3, 2]) {
    if (sample.length >= 5 || !genus.taxonomy[rank]) continue;
    const kin = new Set(slice.genera.map((x, i) => x.taxonomy[rank] === genus.taxonomy[rank] ? i : -1).filter((i) => i >= 0));
    const near = slice.siteList.filter((st) => st.occ.some(([gi]) => kin.has(gi)) && core.some((c) => d3.geoDistance([c.lng, c.lat], [st.lng, st.lat]) * 6371 < 2500));
    if (near.length > sample.length) sample = near;
  }
  // Its climate: the estimated temperatures where it was found, with a margin either side.
  const { t: temp, low } = climateGrid();
  // Fossils form in basins and lowlands, so a find's climate is its lowland temperature, not the
  // average height of its 1° cell.
  const tFinds = cellsOf(sample).map((i) => low[i]);
  // The fewer places it was found, the wider the margin: a few finds only hint at the climate it could take.
  const nFound = new Set(cellsOf(sample)).size, widen = 1 + 3 / Math.sqrt(Math.max(1, nFound));
  const tLo = d3.min(tFinds) - 3 * widen, tHi = d3.max(tFinds) + 3 * widen;
  const latFinds = cellsOf(sample).map((i) => Math.abs(90 - Math.floor(i / cols)));
  const latLo = d3.min(latFinds) - 8 * widen, latHi = d3.max(latFinds) + 8 * widen;

  const eco = lifeInfo[genus.name]?.eco || {};
  const pelagic = /nekton|pelagic|plankton/.test(eco.life_habit || "");
  const onLand = h.land || h.fresh, inSea = h.sea;
  const fitsHabitat = (i) => {
    const e = elev[i];
    return e > 0 ? onLand && e <= (h.land ? 3000 : 1000) : inSea && (pelagic || e >= -2500);
  };
  // Only its own landmass or sea: the connected patches of its habitat that hold (or touch) its main finds,
  // and within REACH_KM of one. A kind found on one continent is not shaded on another it could not reach.
  const patchOf = new Int32Array(cols * rows).fill(-1);
  let np = 0;
  for (let i0 = 0; i0 < cols * rows; i0++) {
    if (patchOf[i0] >= 0 || !fitsHabitat(i0)) continue;
    const st = [i0]; patchOf[i0] = np;
    while (st.length) {
      const k = st.pop(), r = Math.floor(k / cols), c = k % cols;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr; if (rr < 0 || rr >= rows) continue;
        const n = rr * cols + ((c + dc + cols) % cols);
        if (patchOf[n] < 0 && fitsHabitat(n)) { patchOf[n] = np; st.push(n); }
      }
    }
    np++;
  }
  const ownPatches = new Set();
  for (const i of cellsOf(core)) {
    const r = Math.floor(i / cols), c = i % cols;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr; if (rr < 0 || rr >= rows) continue;
      const p = patchOf[rr * cols + ((c + dc + cols) % cols)]; if (p >= 0) ownPatches.add(p);
    }
  }
  const rad = Math.PI / 180, unit = (lng, lat) => [Math.cos(lat * rad) * Math.cos(lng * rad), Math.cos(lat * rad) * Math.sin(lng * rad), Math.sin(lat * rad)];
  const findVecs = core.map((st) => unit(st.lng, st.lat)), reach = Math.cos(REACH_KM / 6371);
  const near = (i) => { const v = unit((i % cols) - 180, 90 - Math.floor(i / cols)); return findVecs.some((f) => f[0] * v[0] + f[1] * v[1] + f[2] * v[2] >= reach); };
  const fits = (i) => fitsHabitat(i) && ownPatches.has(patchOf[i]) && near(i);

  // How likely it lived in each cell of the ancient Earth with its habitat: full where the climate matches
  // its finds and fading as the climate moves away from theirs, and densest near the finds themselves,
  // thinning (but never vanishing) with distance: a gradient of how concentrated its populations were.
  const tMid = (tLo + tHi) / 2, tHalf = (tHi - tLo) / 2;
  const density = new Float32Array(cols * rows), mask = new Uint8Array(cols * rows);
  // Suitability from the MaxEnt model when it has enough distinct find spots; else the simple climate match.
  const presence = [...new Set(cellsOf(sample))];
  let suit = null;
  if (presence.length >= 8) {                         // too few find spots for a model: the climate band
    const habitatCells = [];
    for (let i = 0; i < cols * rows; i++) if (fits(i)) habitatCells.push(i);
    if (habitatCells.length > 20) suit = maxentSuitability(presence, habitatCells, !inSea);
  }
  for (let i = 0; i < cols * rows; i++) {
    if (!fits(i)) continue;
    const off = Math.max(0, Math.abs(temp[i] - tMid) - tHalf);         // °C outside its finds' climate
    const alat = Math.abs(90 - Math.floor(i / cols)), offLat = Math.max(0, latLo - alat, alat - latHi);
    const climateFit = suit ? suit(i) : Math.exp(-0.5 * (off / 2.5) ** 2) * Math.exp(-0.5 * (offLat / 6) ** 2);
    if (climateFit < 0.1) continue;
    // how common it was: how well the environment suits it, anywhere on the Earth of its time (not how near
    // a dig site is: fossils only show where rock happened to survive)
    density[i] = climateFit;
    if (density[i] >= RANGE_LEVELS[0]) mask[i] = 1;
  }
  for (const i of cellsOf(core)) { mask[i] = 1; density[i] = 1; }   // its main finds (lone outliers stay dots only)
  return { mask, density, sites: own };
}

// Separate patches of a range (cells joined side by side, wrapping round the antimeridian), each with its centre.
function patches(mask) {
  const { cols, rows } = dem();
  const seen = new Uint8Array(mask.length), out = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    const stack = [i], cells = [];
    seen[i] = 1;
    while (stack.length) {
      const k = stack.pop(); cells.push(k);
      const r = Math.floor(k / cols), c = k % cols;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr; if (rr < 0 || rr >= rows) continue;
        const n = rr * cols + ((c + dc + cols) % cols);
        if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    out.push({ size: cells.length, center: weightedCentre(cells.map((k) => [{ lng: (k % cols) - 180, lat: 90 - Math.floor(k / cols) }, 1])) });
  }
  return out;
}

// Outline of a mask as polygons (contoured with a wrap-around column on each side).
function maskShape(mask) {
  const { cols, rows } = dem();
  const n = cols + 2, grid = new Float64Array(n * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) grid[j * n + i] = mask[j * cols + ((i - 1 + cols) % cols)];
  const [shape] = d3.contours().size([n, rows]).thresholds([0.5])(grid);
  shape.coordinates = shape.coordinates.map((poly) => poly.map((ring) => ring.map(([x, y]) => [x - 1.5 - 180, Math.max(-90, Math.min(90, 90 - (y - 0.5)))])));
  return shape;
}

// Great-circle arc, kept continuous across the antimeridian.
function arc(a, b) {
  const pts = d3.range(0, 1.0001, 1 / 48).map(d3.geoInterpolate(a, b));
  for (let i = 1; i < pts.length; i++) {
    while (pts[i][0] - pts[i - 1][0] > 180) pts[i][0] -= 360;
    while (pts[i - 1][0] - pts[i][0] > 180) pts[i][0] += 360;
  }
  return pts;
}

// Join a set of points by the shortest network that connects them all (a minimum spanning tree).
function spanningTree(points) {
  const inTree = [0], edges = [];
  while (inTree.length < points.length) {
    let best = null;
    for (const i of inTree) for (let j = 0; j < points.length; j++) {
      if (inTree.includes(j)) continue;
      const d = d3.geoDistance(points[i], points[j]);
      if (!best || d < best[2]) best = [i, j, d];
    }
    inTree.push(best[1]); edges.push(best);
  }
  return edges;
}

// Show the range of the most recently opened animal: its patches joined by solid lines, and up to
// RELATIVES_MAX relatives from the same family shaded fainter, each joined to it by a dashed line.
// The spread's palette (yellow, orange, red, deep red: none of the zone or group colours) and patchwork:
// half-degree cells whose corners are nudged a little at random (shared by neighbours, so they still fit
// together), each coloured by how common the animal was there, with some left out, more where it was rarer.
const PATCH_COLORS = ["#ffeda0", "#fed976", "#feb24c", "#fd8d3c", "#f03b20", "#bd0026"];
const PATCH = 0.5;
function hash01(a, b, k = 0) {
  let h = (a * 374761393 + b * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function patchwork(density) {
  const { cols, rows } = dem(), n = Math.round(1 / PATCH), feats = [];
  const corner = (i, j) => [-180 + i * PATCH + (hash01(i, j, 1) - 0.5) * PATCH * 0.7, 90 - j * PATCH + (hash01(i, j, 2) - 0.5) * PATCH * 0.7];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const d0 = density[r * cols + c];
    if (d0 < RANGE_LEVELS[0]) continue;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const i = c * n + a, j = r * n + b;
      const d = Math.min(1, Math.max(0, d0 + (hash01(i, j, 3) - 0.5) * 0.25));
      if (hash01(i, j, 4) < 0.12 + 0.4 * (1 - d)) continue;                  // a gap: the terrain shows
      const k = Math.min(PATCH_COLORS.length - 1, Math.floor(d * PATCH_COLORS.length));
      const ring = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
      ring.push(ring[0]);
      feats.push({ type: "Feature", properties: { patch: 1, color: PATCH_COLORS[k] }, geometry: { type: "Polygon", coordinates: [ring] } });
    }
  }
  return feats;
}

// The cross-hatch: thin dark-red lines both ways, transparent between, so the terrain shows through.
let hatchTile = null;
function hatchCanvas() {
  if (hatchTile) return hatchTile;
  const c = document.createElement("canvas"); c.width = c.height = 24;          // drawn at 2x for sharp lines
  const x = c.getContext("2d");
  x.strokeStyle = "rgba(122,0,16,0.85)"; x.lineWidth = 2;
  for (const [a, b, d, e] of [[0, 24, 24, 0], [-12, 12, 12, -12], [12, 36, 36, 12], [0, 0, 24, 24], [-12, 12, 12, 36], [12, -12, 36, 12]]) {
    x.beginPath(); x.moveTo(a, b); x.lineTo(d, e); x.stroke();
  }
  return (hatchTile = c);
}
function addHatch() {
  if (!map.hasImage("hatch")) { const c = hatchCanvas(); map.addImage("hatch", c.getContext("2d").getImageData(0, 0, c.width, c.height), { pixelRatio: 2 }); }
}

// The spotlight: while an animal is open, the map stays as it is, and where it could live the terrain's own
// colour (the same colouring by height and depth as the map) is deepened and made more vivid: fully where it
// was most common, less where it was rarer. It sits under the hillshading, so mountains and valleys still show.
let veil = null;
const reliefScale = d3.scaleLinear().domain(RELIEF.map((s) => s[0])).range(RELIEF.map((s) => s[1])).clamp(true);
function vividTerrain(e) {
  const c = d3.hsl(reliefScale(e));
  c.s = Math.min(1, c.s * 1.7 + 0.08); c.l = Math.min(0.85, c.l * 1.12);
  const r = d3.rgb(c);
  return [r.r, r.g, r.b];
}
function showVeil(density) {
  const { cols, rows, elev } = dem();
  if (!veil || !map.getSource("veil")) {
    const small = document.createElement("canvas"); small.width = cols; small.height = rows;
    const flatV = document.createElement("canvas"); flatV.width = cols * 4; flatV.height = rows * 4;
    const merc = document.createElement("canvas"); merc.width = 1440; merc.height = 1440;
    const MAX_LAT = 85.05112878;
    const rowLat = Array.from({ length: merc.height }, (_, y) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / merc.height))) * 180) / Math.PI);
    map.addSource("veil", { type: "canvas", canvas: merc, animate: true, coordinates: [[-180, MAX_LAT], [180, MAX_LAT], [180, -MAX_LAT], [-180, -MAX_LAT]] });
    map.addLayer({ id: "veil", type: "raster", source: "veil", paint: { "raster-fade-duration": 0, "raster-resampling": "linear" } },
      map.getLayer("shade") ? "shade" : undefined);
    veil = { small, flatV, merc, rowLat };
  }
  const sx = veil.small.getContext("2d"), img = sx.createImageData(cols, rows);
  // How common, relative to its own best places (so differences show even where most of a continent suits it).
  const vals = Array.from(density).filter((d) => d > 0).sort((x, y) => x - y);
  const lo = d3.quantile(vals, 0.2) ?? 0, hi = d3.quantile(vals, 0.98) ?? 1;
  for (let i = 0; i < cols * rows; i++) {
    const d = density[i];
    if (d <= 0) continue;
    const t = hi - lo < 0.05 ? d : Math.max(0, Math.min(1, (d - lo) / (hi - lo)));
    const [r, g, b] = vividTerrain(elev[i]);
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.round(255 * (0.15 + 0.85 * t));
  }
  sx.putImageData(img, 0, 0);
  // Smooth it: four times finer, blended, so its edges fade instead of stepping by whole degrees.
  const fx = veil.flatV.getContext("2d");
  fx.clearRect(0, 0, veil.flatV.width, veil.flatV.height);
  fx.imageSmoothingEnabled = true; fx.imageSmoothingQuality = "high";
  fx.drawImage(veil.small, 0, 0, veil.flatV.width, veil.flatV.height);
  const mx = veil.merc.getContext("2d"), H = veil.flatV.height;
  mx.clearRect(0, 0, veil.merc.width, veil.merc.height);
  mx.imageSmoothingEnabled = true;
  for (let y = 0; y < veil.merc.height; y++) mx.drawImage(veil.flatV, 0, Math.min(H - 1, ((90 - veil.rowLat[y]) / 180) * H), veil.flatV.width, 1, 0, y, veil.merc.width, 1);
  map.setLayoutProperty("veil", "visibility", "visible");
}
function hideVeil() { if (map.getLayer("veil")) map.setLayoutProperty("veil", "visibility", "none"); }

function showRange() {
  const src = map.getSource("range"), links = map.getSource("range-links");
  if (!src) return;
  const last = nav.species ? { it: nav.species } : null;
  if (!last) {
    src.setData(empty()); links.setData(empty());
    map.setPaintProperty("places", "circle-opacity", window.HIDE_FINDS ? 0 : nav.region ? 0.35 : (life ? 0.55 : 0.8));
    map.setLayoutProperty("places", "visibility", "visible");
    document.body.classList.remove("species-open");
    if (map.getLayer("leaders")) map.setLayoutProperty("leaders", "visibility", "visible");
    nav.range = null;
    hideVeil();
    hideFlat();
    return;
  }
  const g = last.it.g, genus = slice.genera[g];
  const color = groupColor(slice.groups[genus.group]);
  // Its spread as a patchwork coloured by how common it was (see patchwork), the terrain between.
  const own = nicheMask(g), allPatches = patches(own.mask);
  const bigPatches = allPatches.filter((p) => p.size >= 3);                // specks don't get joining lines
  const ownPatches = bigPatches.length ? bigPatches : allPatches;
  // Just where it could live, cross-hatched (no frequency, no colouring of the terrain).
  addHatch(); hideVeil();
  const outline = densityShapes(own.density)[0];
  const features = outline?.coordinates?.length ? [{ type: "Feature", properties: { own: true, hatch: 1 }, geometry: outline }] : [];
  // Its potential range now spans whole landmasses or seas, so no joining lines or relatives' ranges.
  const lines = [], relatives = [], rank = -1;
  const main = ownPatches.slice().sort((a, c) => c.size - a.size)[0];
  // Shown on the globe and on a flat map of the whole world (drawn separately).
  const finds = own.sites.map((x) => ({ type: "Feature", properties: { own: true }, geometry: { type: "Point", coordinates: [x.lng, x.lat] } }));
  src.setData({ type: "FeatureCollection", features: features.concat(finds) });
  map.setLayoutProperty("places", "visibility", "none");
  document.body.classList.add("species-open");                 // hides the other animals' name tags
  if (map.getLayer("leaders")) map.setLayoutProperty("leaders", "visibility", "none");
  links.setData({ type: "FeatureCollection", features: lines });
  // Stay in whichever view it was opened from: the flat map only if that was showing.
  const wasFlat = !!flat && !flat.parked;
  flat = { features, lines, sites: own.sites, name: shortName(genus.name), color, parked: !wasFlat };
  if (wasFlat) openFlat(main.center[0]);
  else { syncViewSwitch(); document.body.classList.remove("flat-open"); }
  nav.range = { g, sites: own.sites.length, patches: ownPatches.length, habitat: habitat(g), relatives: relatives.map(([x]) => shortName(x.name)), rank };
  const note = document.querySelector("#panel .range-note");
  if (note) note.innerHTML = rangeNote();
}

function rangeNote() {
  const r = nav.range;
  if (!r) return "";
  const h = r.habitat;
  const where = h.fresh && !h.sea && !h.land ? "lowland rivers and lakes" : habitatWords(h);
  return `<b>Shaded on the map:</b> everywhere on the Earth of its time with its habitat (${where}) and the climate it was found in. ` +
    `White dots: the ${plural(r.sites, "place")} its fossils have been found. ` +
    (h.quote ? `Its article says: “${esc(h.quote)}”.` : "");
}

// ---------- Names of the ancient lands and seas ----------

// Three kinds of name: the ancient lands and seas (from the plate model and the agent), today's places
// moved to where they sat then, and the terrain itself (mountain belts, shallow seas).
const NAME_RANK = { super: 0, sea: 1, land: 2, modern: 3, terrain: 4 };   // who wins when two overlap
let nameEls = [];

async function addPlaceNames(time) {
  const [ancient, extra] = await Promise.all([
    d3.json(`data/labels-${time}.json?v=${BUILD}`).catch(() => []),
    d3.json(`data/names-${time}.json?v=${BUILD}`).catch(() => []),
  ]);
  const ancientNames = new Set(ancient.map((l) => l.name.toLowerCase()));
  // Don't say "India" twice when the ancient name is already the modern one.
  placeNames = [...ancient, ...extra.filter((n) => n.kind !== "modern" || !ancientNames.has(n.name.toLowerCase()))]
    .sort((a, c) => NAME_RANK[a.kind] - NAME_RANK[c.kind]);
  for (const l of placeNames) {
    const el = document.createElement("div");
    el.className = `place-name ${l.kind}`;
    el.textContent = l.name;
    el.setAttribute("aria-hidden", "true");
    new maplibregl.Marker({ element: el, anchor: "center", opacityWhenCovered: "0" }).setLngLat([l.lng, l.lat]).addTo(map);
    nameEls.push(el);
  }
  // Ancient names belong to the whole-planet view; zoomed in to a region they would only get in the way.
  const toggle = () => { document.body.classList.toggle("names-hidden", map.getZoom() > 3.2); declutter(); };
  map.on("zoom", toggle);
  map.on("moveend", () => setTimeout(declutter, 50));
  toggle();
}

// Hide a name that would overlap one ranked above it (or sits on the far side of the globe).
function declutter() {
  // The legend, the card and the map buttons count as taken space too.
  const kept = [...document.querySelectorAll(".legend, .panel, .maplibregl-ctrl-group, .maplibregl-ctrl-scale")]
    .map((el) => el.getBoundingClientRect()).filter((r) => r.width);
  for (const el of nameEls) {
    el.style.visibility = "";
    if (getComputedStyle(el).display === "none" || getComputedStyle(el).opacity === "0") continue;   // hidden, or behind the globe
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const hit = kept.some((k) => r.left < k.right + 4 && r.right > k.left - 4 && r.top < k.bottom + 2 && r.bottom > k.top - 2);
    if (hit) el.style.visibility = "hidden"; else kept.push(r);
  }
}

// ---------- A flat map of the whole ancient world, shown while an animal is open ----------
// The same map as the globe (terrain, dots, names), only flat. MapLibre's only flat view is Web Mercator,
// which swells the poles, so this one is drawn by hand on a canvas in a plain rectangular projection.
// It pans like the globe spins (sideways wraps round the world) and zooms no closer than a 500 km scale.

let flat = null, placeNames = [];
const flatView = { k: 0, lon: 0, lat: 0 };       // px per radian, and the centre of the view
const FLAT_MAX_K = 6371 / (500 / 120);            // 500 km across about 120 px, like the globe's limit
let flatImg = null, flatClusters = [], flatBound = false;

function flatImage() {
  if (!flatImg) {
    flatImg = new Image();
    flatImg.onload = () => drawFlat();
    flatImg.src = `data/terrain/${slice.time}-flat.jpg?v=${BUILD}`;
  }
  return flatImg.complete && flatImg.naturalWidth ? flatImg : null;
}

function hideFlat() {
  flat = null;
  document.getElementById("flatmap").hidden = true;
  document.getElementById("flat-back").hidden = true;
  document.body.classList.remove("flat-open");
  syncViewSwitch();
}

// ---------- Globe or flat map, whenever you like ----------
// "Flat map" shows the same world (terrain, dots, names) as the flat map an animal opens, zoomed out to the
// whole planet; an open animal's range stays on it. "Globe" goes back.
function setView(view) {
  if (view === "flat") {
    if (!flat) flat = { features: [], lines: [], sites: [], name: null, color: "#ffffff", world: true };
    openFlat(map.getCenter().lng);
  } else {
    document.getElementById("flatmap").hidden = true;
    document.getElementById("flat-back").hidden = true;
    document.body.classList.remove("flat-open");
    if (flat?.world) flat = null;
    else if (flat) flat.parked = true;                    // an animal's range: kept, ready to come back
  }
  syncViewSwitch();
}
function syncViewSwitch() {
  const isFlat = !!flat && !flat.parked;
  document.querySelectorAll(".view-switch [data-view]").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.view === "flat") === isFlat)));
}
function bindViewSwitch() {
  document.querySelectorAll(".view-switch [data-view]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.view === "flat" && flat?.parked) { flat.parked = false; openFlat(map.getCenter().lng); syncViewSwitch(); return; }
    setView(b.dataset.view);
  }));
}

// Size of the drawing area and the zoom limits: at its widest the map fills the height (as big as
// possible); sideways it repeats, so there is never empty space.
function flatBox() {
  const canvas = document.getElementById("flatmap");
  const box = canvas.getBoundingClientRect();
  const aw = box.width - (wide() ? PANEL_SPACE : 0);
  const kMin = flat?.world ? Math.min(aw / (2 * Math.PI), box.height / Math.PI)   // the whole planet, a bit wider view
    : Math.max(aw / (2 * Math.PI), box.height / Math.PI);
  return { canvas, w: box.width, h: box.height, aw, kMin, kMax: Math.max(kMin, FLAT_MAX_K) };
}

function clampFlat(b) {
  flatView.k = Math.max(b.kMin, Math.min(b.kMax, flatView.k || b.kMin));
  const room = Math.max(0, Math.PI / 2 - b.h / 2 / flatView.k);   // keep the poles at the edges, never beyond
  flatView.lat = Math.max(-room, Math.min(room, flatView.lat));
  flatView.lon = ((flatView.lon + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

function flatProjection(b) {
  return d3.geoEquirectangular().scale(flatView.k).rotate([-flatView.lon * 180 / Math.PI, 0])
    .translate([b.aw / 2, b.h / 2 + flatView.lat * flatView.k]);
}

function openFlat(centerLng) {
  flatView.k = 0; flatView.lat = 0; flatView.lon = centerLng * Math.PI / 180;
  if (!flatBound) {
    bindFlatInput();
    document.getElementById("flat-back").addEventListener("click", backToPlace);
    flatBound = true;
  }
  drawFlat();
}

// Group sites that would overlap on screen into one dot, like the globe does.
function clusterFlat(proj, b) {
  const W = 2 * Math.PI * flatView.k, R = CLUSTER_RADIUS, cells = new Map(), out = [];
  const pts = slice.siteList.map((s) => {
    const fam = { invert: 0, vert: 0, plant: 0, other: 0 };
    for (const [g, , n] of s.occ) fam[GROUPS[slice.groups[slice.genera[g].group]].family] += n;
    let [x, y] = proj([s.lng, s.lat]);
    x = ((x % W) + W) % W; if (x > b.aw + R) x -= W;          // bring every site into the visible copy
    return { s, x, y, total: fam.invert + fam.vert + fam.plant + fam.other, fam };
  }).sort((a, c) => c.total - a.total);
  for (const p of pts) {
    const key = `${Math.floor(p.x / R)},${Math.floor(p.y / R)}`;
    let hit = null;
    for (let dx = -1; dx <= 1 && !hit; dx++) for (let dy = -1; dy <= 1 && !hit; dy++) {
      for (const c of cells.get(`${Math.floor(p.x / R) + dx},${Math.floor(p.y / R) + dy}`) || []) {
        if (Math.hypot(c.x - p.x, c.y - p.y) < R) { hit = c; break; }
      }
    }
    if (hit) { hit.sites.push(p.s); hit.total += p.total; for (const k in p.fam) hit.fam[k] += p.fam[k]; continue; }
    const c = { x: p.x, y: p.y, sites: [p.s], total: p.total, fam: { ...p.fam } };
    out.push(c);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(c);
  }
  return out;
}

const dotRadius = (total) => Math.min(26, Math.max(3, 0.42 * Math.sqrt(total)));
function dotColor(fam) {
  const named = [["invert", fam.invert], ["vert", fam.vert], ["plant", fam.plant]].sort((a, c) => c[1] - a[1])[0];
  return palette.family[named[1] ? named[0] : "other"];
}

function drawFlat() {
  const canvas = document.getElementById("flatmap");
  if (!flat || flat.parked) { canvas.hidden = true; return; }
  canvas.hidden = false;
  syncViewSwitch();
  document.body.classList.toggle("flat-open", !flat.world);     // the range key only when an animal is open
  const backBtn = document.getElementById("flat-back");
  backBtn.hidden = !nav.region;
  if (nav.region) backBtn.textContent = `← Back to the fossils of ${regionName(nav.region.sites)}`;
  const b = flatBox();
  { const half = Math.PI - (b.aw / 2) / flatView.k; flatView.lon = Math.max(-Math.max(0, half), Math.min(Math.max(0, half), flatView.lon)); }
  clampFlat(b);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(b.w * dpr); canvas.height = Math.round(b.h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, b.w, b.h);
  const proj = flatProjection(b), path = d3.geoPath(proj, ctx);
  const k = flatView.k, W = 2 * Math.PI * k, H = Math.PI * k;

  // Terrain, repeated sideways so the world wraps round.
  const img = flatImage();
  const x0 = proj([-180 + 1e-9, 0])[0], top = b.h / 2 + flatView.lat * k - H / 2;
  let start = ((x0 % W) + W) % W - W;
  start = x0;   // one copy of the world, not repeated sideways
  if (img) ctx.drawImage(img, start, top, W, H);
  if (flatIce) ctx.drawImage(flatIce, start, top, W, H);
  if (flat.veil && !flat.world) { ctx.imageSmoothingEnabled = true; for (let x = start; x < b.w; x += W) ctx.drawImage(flat.veil, x, top, W, H); }
  ctx.beginPath(); path(slice.coastlines); ctx.setLineDash([1.5, 3]); ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 0.7; ctx.stroke(); ctx.setLineDash([]);

  // As on the globe: where life lived (white edges, dashed between areas), an open place's groups in
  // their colours, and the finds as small dark points.
  const speciesOpen = nav.level === "species" && !flat.world;
  if (typeof drawFlatZones === "function") drawFlatZones(ctx, path, speciesOpen);
  // Outline a shape without the stretches that only run along the edge of the 1° grid (the antimeridian
  // seam and the poles): real borders only.
  const edge = (p) => p[0] <= -179.9 || p[0] >= 179.9 || Math.abs(p[1]) >= 89.4;
  const strokeShape = (geometry) => {
    for (const poly of geometry.coordinates) for (const ring of poly) {
      for (let k = 1; k < ring.length; k++) {
        const a = ring[k - 1], c = ring[k];
        if (edge(a) && edge(c)) continue;
        path({ type: "LineString", coordinates: [a, c] });
      }
    }
  };
  if (life && !speciesOpen) {
    if (nav.level === "region" && net?.patches) {
      for (const p of net.patches) {
        if (net.open && p.group !== net.open.group) continue;
        ctx.beginPath(); path(p.feature.geometry);
        ctx.globalAlpha = 0.62; ctx.fillStyle = groupColor(p.group); ctx.fill();
        ctx.globalAlpha = 0.8; ctx.lineWidth = 0.9; ctx.strokeStyle = "#fbf6e6"; ctx.beginPath(); strokeShape(p.feature.geometry); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (nav.region?.area) { ctx.beginPath(); strokeShape(nav.region.area.geometry); ctx.lineWidth = 2.4; ctx.strokeStyle = "#fff"; ctx.stroke(); }
    }
    {
      ctx.beginPath(); for (const a of life.areas) strokeShape(a.geometry);
      ctx.setLineDash([3, 2]); ctx.lineWidth = 0.9; ctx.strokeStyle = "rgba(251,246,230,0.75)"; ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.beginPath(); strokeShape(life.outline); ctx.lineWidth = 1.3; ctx.strokeStyle = "rgba(251,246,230,0.9)"; ctx.stroke();
  }
  flatClusters = [];
  ctx.fillStyle = "#14120e"; ctx.globalAlpha = 0.55;
  for (const st of slice.siteList) {
    const [x, y] = proj([st.lng, st.lat]);
    const n = d3.sum(st.occ, (o) => o[2]);
    ctx.beginPath(); ctx.arc(x, y, Math.min(5, Math.max(1.6, 0.14 * Math.sqrt(n))), 0, 2 * Math.PI); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // An open place's group names, at the middle of each patch.
  if (nav.level === "region" && net?.patches) {
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "600 11px system-ui, sans-serif";
    for (const p of net.patches) {
      if (net.open && p.group !== net.open.group) continue;
      const [x, y] = proj(p.anchor);
      const t = `${GROUPS[p.group].label.replace(/ & .*|,.*/, "")} · ${p.kinds}`;
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.strokeText(t, x, y);
      ctx.fillStyle = "#fbf6e6"; ctx.fillText(t, x, y);
    }
  }

  // The animal's range (relatives faint), the lines that join them, and where its fossils were found.
  const inside = (g) => d3.geoArea(g) > 2 * Math.PI
    ? { ...g, coordinates: g.coordinates.map((poly) => poly.map((ring) => ring.slice().reverse())) } : g;
  for (const own of [false, true]) {
    for (const f of flat.features.filter((x) => x.properties.own === own)) {
      ctx.beginPath(); path(inside(f.geometry));
      if (f.properties.hatch) {                  // its range, cross-hatched, with a thin outline
        ctx.globalAlpha = 1; ctx.fillStyle = ctx.createPattern(hatchCanvas(), "repeat"); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(122,0,16,0.9)"; ctx.stroke();
        continue;
      }
      ctx.globalAlpha = own ? 0.55 : 0.22; ctx.fillStyle = flat.color; ctx.fill();
      ctx.globalAlpha = own ? 1 : 0.7; ctx.lineWidth = own ? 1.6 : 0.9; ctx.strokeStyle = own ? "#fff" : flat.color; ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  for (const l of flat.lines) {
    ctx.beginPath(); path(l.geometry);
    ctx.setLineDash(l.properties.own ? [] : [6, 4]);
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.stroke();
    ctx.lineWidth = 1.8; ctx.strokeStyle = "#fff"; ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const s of flat.sites) {
    let [x, y] = proj([s.lng, s.lat]);
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 2 * Math.PI);
    ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = "#111"; ctx.stroke();
  }

  // Names, as on the globe, skipping any that would overlap one drawn already.
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const FONTS = { super: "19px 'EB Garamond', Georgia, serif", sea: "italic 16px 'EB Garamond', Georgia, serif",
    land: "14px 'EB Garamond', Georgia, serif", modern: "600 10px system-ui, sans-serif", terrain: "italic 12px 'EB Garamond', Georgia, serif" };
  const COLOURS = { sea: "rgba(190,225,255,0.95)", modern: "rgba(246,214,150,0.95)", terrain: "rgba(235,235,225,0.75)" };
  const drawn = [];
  for (const l of placeNames) {
    const [x, y] = proj([l.lng, l.lat]);
    ctx.font = FONTS[l.kind];
    const text = l.kind === "super" ? l.name.toUpperCase().split("").join(" ") : l.kind === "modern" ? l.name.toUpperCase() : l.name;
    const w = ctx.measureText(text).width, h = l.kind === "super" ? 20 : 14;
    const box = [x - w / 2 - 3, y - h / 2, x + w / 2 + 3, y + h / 2];
    if (drawn.some((d) => box[0] < d[2] && box[2] > d[0] && box[1] < d[3] && box[3] > d[1])) continue;
    drawn.push(box);
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.strokeText(text, x, y);
    ctx.fillStyle = COLOURS[l.kind] || "rgba(255,255,255,0.9)"; ctx.fillText(text, x, y);
  }

  // A scale bar, like the globe's.
  const kmPerPx = 6371 / k;
  const nice = [100, 200, 500, 1000, 2000, 5000].find((d) => d / kmPerPx >= 60) || 5000;
  const len = nice / kmPerPx;
  ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(12, b.h - 22, len, 2);
  ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.strokeText(`${nice} km at the equator`, 12, b.h - 32); ctx.fillText(`${nice} km at the equator`, 12, b.h - 32);
  if (typeof placeRing === "function") placeRing();      // keep the open zone's spot and line in place
}

// Pan and zoom the flat map the same way as the globe: drag or two-finger scroll moves it, pinch zooms.
function bindFlatInput() {
  const canvas = document.getElementById("flatmap");
  // The flat map is one world (not repeated sideways): it zooms, and pans only within its edges.
  const panBy = (dx, dy) => { flatView.lon -= dx / flatView.k; flatView.lat += dy / flatView.k; drawFlat(); };
  const zoomAt = (factor, x, y) => {
    const b = flatBox(), before = flatProjection(b).invert([x, y]);
    flatView.k *= factor; clampFlat(b);
    const after = flatProjection(b)([before[0], before[1]]);
    if (after) panBy(after[0] - x, after[1] - y); else drawFlat();
  };
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : 1, r = canvas.getBoundingClientRect();
    if (e.ctrlKey) zoomAt(Math.exp(-e.deltaY * unit * 0.012), e.clientX - r.left, e.clientY - r.top);
    else panBy(-e.deltaX * unit, -e.deltaY * unit);
  }, { passive: false });
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.moved) panBy(dx, dy);
      return;
    }
    const ll = flatProjection(flatBox()).invert([e.clientX - r.left, e.clientY - r.top]);
    canvas.style.cursor = ll && areaAt(ll[0], ll[1]) ? "pointer" : "grab";
  });
  canvas.addEventListener("pointerup", (e) => {
    const r = canvas.getBoundingClientRect(), wasClick = drag && !drag.moved;
    drag = null;
    if (!wasClick) return;
    const ll = flatProjection(flatBox()).invert([e.clientX - r.left, e.clientY - r.top]);
    const a = ll && areaAt(ll[0], ll[1]);
    if (typeof placeClick === "function" && ll && placeClick({ lngLat: { lng: ll[0], lat: ll[1] }, originalEvent: e })) return;
    if (a) { if (flat?.world) setView("globe"); openArea(a); }
  });
  canvas.addEventListener("pointerleave", hideTip);
  canvas.addEventListener("dblclick", (e) => { const r = canvas.getBoundingClientRect(); zoomAt(1.6, e.clientX - r.left, e.clientY - r.top); });
}

// ---------- Input ----------

// Two-finger scroll pushes the map (the trackpad supplies momentum); pinch (ctrl + wheel) zooms.
function trackpad(m) {
  const el = m.getCanvasContainer();
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey) {
      const rect = el.getBoundingClientRect();
      m.zoomTo(m.getZoom() - e.deltaY * unit * 0.012, { around: m.unproject([e.clientX - rect.left, e.clientY - rect.top]), duration: 0 });
    } else {
      m.panBy([e.deltaX * unit, e.deltaY * unit], { duration: 0 });
    }
  }, { passive: false });
}

const tooltip = d3.select("#tooltip");
function showTip(html, clientX, clientY) {
  const rect = document.querySelector(".stage").getBoundingClientRect();
  tooltip.style("display", "block").html(html)
    .style("left", `${Math.min(clientX - rect.left + 14, rect.width - 280)}px`).style("top", `${clientY - rect.top + 14}px`);
}
const hideTip = () => tooltip.style("display", "none");
const famLabel = (p) => {
  const best = [["invert", p.inv], ["vert", p.vert], ["plant", p.plant]].sort((a, c) => c[1] - a[1])[0];
  return best[1] ? FAMILIES[best[0]].label.toLowerCase() : "other life";
};

function bindInput() {
  trackpad(map);
  map.on("mousemove", "places", (e) => {
    if (EVENT_MODE || window.HIDE_FINDS) return;
    const p = e.features[0].properties;
    map.getCanvas().style.cursor = "pointer";
    showTip(`<b>${num(p.total)} fossil records</b><br>${plural(p.point_count || 1, "dig site")} · mostly ${famLabel(p)}<br><span style="opacity:.7">Click to see what lived here</span>`,
      e.originalEvent.clientX, e.originalEvent.clientY);
  });
  map.on("mouseleave", "places", () => { map.getCanvas().style.cursor = ""; hideTip(); });
  map.on("movestart", hideTip);
  map.on("zoomend", () => { if (markers.length) layoutMarkers(); layoutCards(); });
  map.on("move", layoutCards);
  map.on("click", "places", async (e) => {
    if (EVENT_MODE || window.HIDE_FINDS) return;
    if (e.originalEvent.target.closest?.(".example, .maplibregl-popup")) return;
    const f = e.features[0];
    let idx = [f.properties.idx];
    if (f.properties.cluster) {
      const leaves = await map.getSource("places").getClusterLeaves(f.properties.cluster_id, Infinity, 0);
      idx = leaves.map((l) => l.properties.idx);
    }
    goRegion({ sites: idx.map((i) => slice.siteList[i]) });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.level !== "world" && !e.target.closest?.("input")) back();
  });
}

// "Portugal", "Portugal and Spain", or "Open ocean", from the dig sites' present-day countries.
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryName(cc) {
  try { return countryNames.of(cc === "UK" ? "GB" : cc) || cc; } catch { return cc; }
}
function regionName(sites) {
  const cc = d3.rollups(sites.filter((s) => s.cc), (v) => d3.sum(v, (s) => d3.sum(s.occ, (o) => o[2])), (s) => s.cc)
    .sort((a, c) => c[1] - a[1]).map(([c]) => countryName(c));
  if (!cc.length) return "Open ocean";
  return cc.length === 1 ? cc[0] : `${cc[0]} and ${cc.length === 2 ? cc[1] : "nearby"}`;
}

// ---------- Where life lived: richness wash and group ranges ----------
// data/ranges-<time>.json (scripts/make-life-ranges.py) holds, per group, a 1° grid of how strongly the
// finds say it lived there (0-255). The wash shades how many kinds of life lived in each place; each
// group's name sits inside its range; hovering a place lists who lived there.

const LIFE_LEVEL = 0.5;                       // a group "lived here" above this strength
const WASH_STEPS = [0.6, 1.8, 3.2, 4.8, 6.5]; // expected number of groups living in a place
let life = null;

async function loadLife(time) {
  const data = await d3.json(`data/ranges-${time}.json?v=${BUILD}`).catch(() => null);
  if (!data?.groups) return null;
  const n = data.cols * data.rows, richness = new Float32Array(n);
  for (const g of data.groups) {
    g.values = Uint8Array.from(atob(g.grid), (c) => c.charCodeAt(0));
    for (let i = 0; i < n; i++) richness[i] += g.values[i] / 255;
  }
  return { ...data, richness };
}

// Contours of a 1° grid as polygons, one per threshold (each containing the next), wrapping at the antimeridian.
function lifeContours(values, thresholds) {
  const { cols, rows } = life, w = cols + 2, grid = new Float64Array(w * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < w; i++) grid[j * w + i] = values[j * cols + ((i - 1 + cols) % cols)];
  return d3.contours().size([w, rows]).thresholds(thresholds)(grid).map((shape) => ({ ...shape,
    coordinates: shape.coordinates.map((poly) => poly.map((ring) => ring.map(([x, y]) => [x - 1.5 - 180, Math.max(-90, Math.min(90, 90.5 - y))]))) }));
}

const lifeAt = (lng, lat) => {
  const c = ((Math.round(lng + 180) % life.cols) + life.cols) % life.cols, r = Math.max(0, Math.min(life.rows - 1, Math.round(90 - lat)));
  return life.groups.map((g) => ({ group: g.group, v: g.values[r * life.cols + c] / 255 }))
    .filter((d) => d.v >= 0.25 && GROUPS[d.group]).sort((a, b) => b.v - a.v);
};

// A group picked from "What lived": where it lived across the Earth, in its colour, with its finds.
function showGroupRange() {
  const src = map.getSource("group-range");
  if (!src) return;
  const g = worldFilter && life?.groups.find((x) => x.group === worldFilter);
  if (!g || nav.level !== "world") { src.setData(empty()); map.setPaintProperty("places", "circle-color", "#14120e"); return; }
  const shape = lifeContours(Float32Array.from(g.values, (v) => v / 255), [0.3])[0];
  src.setData({ type: "Feature", properties: { color: groupColor(g.group) }, geometry: { type: "MultiPolygon", coordinates: shape.coordinates } });
  map.setPaintProperty("places", "circle-color", groupColor(g.group));
}

// ---------- Numbered areas: each living region split into a few areas, one per cluster of finds ----------
const AREA_CELLS = 110;     // roughly one area per this many (equal-area) 1° cells of a region
const AREA_MAX = 24;        // at most this many areas in one region

function computeAreas() {
  const { cols, rows, richness } = life;
  const n = cols * rows, inside = new Uint8Array(n), seen = new Uint8Array(n);
  for (let i = 0; i < n; i++) inside[i] = richness[i] >= WASH_STEPS[0] ? 1 : 0;
  const owner = new Int32Array(n).fill(-1), areas = [];
  const siteCells = new Map();
  for (const site of slice.siteList) {
    const [c, r] = cellOf(site.lng, site.lat), i = r * cols + c;
    if (!siteCells.has(i)) siteCells.set(i, []);
    siteCells.get(i).push(site);
  }
  for (let s0 = 0; s0 < n; s0++) {
    if (!inside[s0] || seen[s0]) continue;
    const cells = [], stack = [s0];
    seen[s0] = 1;
    while (stack.length) {
      const i = stack.pop(); cells.push(i);
      const r = Math.floor(i / cols), c = i % cols;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr; if (rr < 0 || rr >= rows) continue;
        const j = rr * cols + ((c + dc + cols) % cols);
        if (inside[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    // Flat local coordinates for the region (longitudes unwrapped round its first cell).
    const c0 = cells[0] % cols;
    const lat0 = d3.mean(cells, (i) => 90 - Math.floor(i / cols)) * Math.PI / 180;
    const xy = cells.map((i) => {
      let dc = (i % cols) - c0; if (dc > cols / 2) dc -= cols; if (dc < -cols / 2) dc += cols;
      return [dc * Math.cos(lat0), -Math.floor(i / cols)];
    });
    // How many areas: by true size (cells shrink towards the poles), never more than the places with finds.
    const findCells = cells.map((i, j) => (siteCells.has(i) ? j : -1)).filter((j) => j >= 0);
    const size = d3.sum(cells, (i) => Math.cos((90 - Math.floor(i / cols)) * Math.PI / 180));
    const k = Math.max(1, Math.min(AREA_MAX, Math.round(size / AREA_CELLS), findCells.length || 1));
    // Seeds on cells with finds, far apart; each cell joins its nearest seed, and seeds settle on the
    // find-cell nearest the middle of their area, so every area holds finds.
    const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    const pool = findCells.length ? findCells : [0];
    let best = pool[0];
    for (const j of pool) if (richness[cells[j]] > richness[cells[best]]) best = j;
    const seeds = [best];
    while (seeds.length < k) {
      let far = pool[0], farD = -1;
      for (const j of pool) { const d = d3.min(seeds, (q) => d2(xy[j], xy[q])); if (d > farD) { farD = d; far = j; } }
      seeds.push(far);
    }
    const label = new Int32Array(cells.length);
    for (let it = 0; it < 6; it++) {
      xy.forEach((p, j) => { let bk = 0, bd = Infinity; seeds.forEach((q, kk) => { const d = d2(p, xy[q]); if (d < bd) { bd = d; bk = kk; } }); label[j] = bk; });
      for (let kk = 0; kk < k; kk++) {
        const mine = xy.filter((_, j) => label[j] === kk);
        if (!mine.length) continue;
        const mid = [d3.mean(mine, (p) => p[0]), d3.mean(mine, (p) => p[1])];
        let snap = seeds[kk], sd = Infinity;
        for (const j of pool) if (label[j] === kk && d2(xy[j], mid) < sd) { sd = d2(xy[j], mid); snap = j; }
        seeds[kk] = snap;
      }
    }
    for (let kk = 0; kk < k; kk++) {
      const own = cells.filter((_, j) => label[j] === kk);
      if (!own.length) continue;
      const id = areas.length;
      for (const i of own) owner[i] = id;
      areas.push({ id, cells: own, richness: d3.sum(own, (i) => richness[i]) });
    }
  }
  for (const a of areas) {
    const mask = new Float32Array(n);
    for (const i of a.cells) mask[i] = 1;
    a.geometry = { type: "MultiPolygon", coordinates: lifeContours(mask, [0.5])[0].coordinates };
    // Label at the cell deepest inside the area (furthest from its edge).
    const depth = new Map(), queue = [];
    for (const i of a.cells) {
      const r = Math.floor(i / cols), c = i % cols;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => { const rr = r + dr; return rr < 0 || rr >= rows || owner[rr * cols + ((c + dc + cols) % cols)] !== a.id; });
      if (edge) { depth.set(i, 0); queue.push(i); }
    }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], r = Math.floor(i / cols), c = i % cols;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr; if (rr < 0 || rr >= rows) continue;
        const j = rr * cols + ((c + dc + cols) % cols);
        if (owner[j] === a.id && !depth.has(j)) { depth.set(j, depth.get(i) + 1); queue.push(j); }
      }
    }
    const deep = a.cells.reduce((b, i) => ((depth.get(i) ?? 0) > (depth.get(b) ?? 0) ? i : b), a.cells[0]);
    a.label = [(deep % cols) - 180, 90 - Math.floor(deep / cols)];
    a.sites = a.cells.flatMap((i) => siteCells.get(i) || []);
    if (!a.sites.length) a.sites = slice.siteList.map((st) => [st, d3.geoDistance(a.label, [st.lng, st.lat])]).sort((x, y) => x[1] - y[1]).slice(0, 5).map(([st]) => st);
  }
  // Number them by how much was found there, most first.
  areas.sort((x, y) => d3.sum(y.sites, (st) => st.occ.length) - d3.sum(x.sites, (st) => st.occ.length) || y.richness - x.richness).forEach((a, k) => { a.n = k + 1; });
  return { areas, owner };
}

const areaAt = (lng, lat) => {
  if (!life?.areaOwner) return null;
  const [c, r] = cellOf(lng, lat), k = life.areaOwner[r * life.cols + c];
  return k >= 0 ? life.areaById[k] : null;
};
let areaMarkers = [];

function openArea(a) {
  if (!a) return;
  hideTip();
  goRegion({ sites: a.sites, area: a });
}

async function addLife() {
  if (!life) return;
  const { areas, owner } = computeAreas();
  life.areas = areas; life.areaOwner = owner;
  life.areaById = Object.fromEntries(areas.map((a) => [a.id, a]));
  const before = map.getLayer("range-fill") ? "range-fill" : undefined;
  // Where life lived: one plain shade with a clear edge. A place's own groups get colours when it is opened.
  const outline = lifeContours(life.richness, [WASH_STEPS[0]])[0];
  life.outline = { type: "MultiPolygon", coordinates: outline.coordinates };
  map.addSource("life-outline", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: outline.coordinates } } });
  map.addLayer({ id: "life-outline", type: "line", source: "life-outline",
    paint: { "line-color": "#fbf6e6", "line-width": 1.3, "line-opacity": 0.9 } }, before);
  // The lines between a region's areas, and each area's number.
  map.addSource("life-areas", { type: "geojson", data: { type: "FeatureCollection",
    features: areas.map((a) => ({ type: "Feature", properties: { id: a.id, n: a.n }, geometry: a.geometry })) } });
  map.addLayer({ id: "life-areas-line", type: "line", source: "life-areas",
    paint: { "line-color": "#fbf6e6", "line-width": 0.9, "line-opacity": 0.75, "line-dasharray": [3, 2] } }, before);
  map.addSource("group-range", { type: "geojson", data: empty() });
  map.addLayer({ id: "group-range", type: "fill", source: "group-range", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.5 } }, before);
  // The open place: its groups' patches, cut exactly to its area, and the area's own edge.
  map.addSource("place-patches", { type: "geojson", data: empty() });
  map.addLayer({ id: "place-patches", type: "fill", source: "place-patches", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.62 } }, before);
  map.addLayer({ id: "place-patches-edge", type: "line", source: "place-patches", paint: { "line-color": "#fbf6e6", "line-width": 0.9, "line-opacity": 0.8 } }, before);
  map.addSource("place-area", { type: "geojson", data: empty() });
  map.addLayer({ id: "place-area", type: "line", source: "place-area", paint: { "line-color": "#ffffff", "line-width": 2.4 } }, before);
  // Each area keeps its number (area.n, richest in finds first) for reference; none is drawn on the map.
  showAreaMarkers();
  map.on("move", () => { placeNet(); showAreaMarkers(); });
  if (EVENT_MODE) for (const id of ["life-outline", "life-areas-line", "coast"]) if (map.getLayer(id)) map.setPaintProperty(id, "line-opacity", 0);

  // The finds themselves: small dark points, the evidence under the colours.
  map.setPaintProperty("places", "circle-radius", ["min", 5, ["max", 1.6, ["*", 0.14, ["sqrt", ["get", "total"]]]]]);
  map.setPaintProperty("places", "circle-color", "#14120e");
  map.setPaintProperty("places", "circle-opacity", 0.55);
  map.setPaintProperty("places", "circle-stroke-width", 0);

  // Click: a group's patch in the open place opens its kinds; anywhere else alive opens that area.
  map.on("click", (e) => {
    if (EVENT_MODE) return;
    if (typeof placeClick === "function" && placeClick(e)) return;      // remade environments: "This place"
    if (e.originalEvent.target.closest?.(".example, .maplibregl-popup, .area-num")) return;
    if (nav.level !== "world" && net) {
      const hit = map.queryRenderedFeatures(e.point, { layers: ["place-patches"] })[0];
      if (hit) { net.toggleGroup(hit.properties.group); return; }
    }
    const a = areaAt(e.lngLat.lng, e.lngLat.lat);
    if (a && a !== nav.region?.area) openArea(a);
  });
  // Anywhere alive: a pointer, to say a click shows what lived there.
  map.on("mousemove", (e) => {
    if (EVENT_MODE) return;
    if (map.queryRenderedFeatures(e.point, { layers: ["places"] }).length) return;
    map.getCanvas().style.cursor = areaAt(e.lngLat.lng, e.lngLat.lat) ? "pointer" : "";
  });
}

// ---------- A place's life as patches, each opening into a network of its kinds ----------
// One patch per group found at the open place, sized by how many kinds, in the group's colour.
// Clicking a patch spreads its kinds round it as named nodes; clicking a node opens that animal.

const NET_MAX = 32;    // kinds shown round one group; the rest are in the panel's list
let net = null;        // { svg, root, open }

// A place's patches show only while the place itself is open, not under an animal's range.
function showPlaceLayers() {
  for (const id of ["place-patches", "place-patches-edge", "place-area"]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", nav.level === "region" ? "visible" : "none");
  }
  // While an animal's range is shown, the world's white region outlines and shading step aside.
  for (const id of ["life-outline", "life-areas-line"]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", nav.level === "species" ? "none" : "visible");
  }
}

function showAreaMarkers() {
  const centre = map.getCenter(), globe = map.getZoom() < FLAT_ZOOM;
  for (const m of areaMarkers) {
    const ll = m.getLngLat(), el = m.getElement();
    el.style.display = nav.level === "world" ? "" : "none";
    el.style.visibility = globe && d3.geoDistance([ll.lng, ll.lat], [centre.lng, centre.lat]) > Math.PI / 2 * 0.97 ? "hidden" : "";
  }
  if (map.getLayer("life-areas-line")) map.setLayoutProperty("life-areas-line", "visibility", nav.level === "species" ? "none" : "visible");
}

function clearNet() {
  net?.svg.remove();
  net = null;
  map.getSource("place-patches")?.setData(empty());
  map.getSource("place-area")?.setData(empty());
  if (map.getLayer("place-patches")) { map.setFilter("place-patches", null); map.setFilter("place-patches-edge", null); }
}

// Split an area among its groups: a fine grid over the area (cells whose centres fall inside its drawn
// outline), each grid cell going to the nearest group seed, nearer for groups with more kinds.
function placePatches(area, groups) {
  const lab = area.label[0];
  const unwrap = (x) => { while (x - lab > 180) x -= 360; while (x - lab < -180) x += 360; return x; };
  const polys = area.geometry.coordinates.map((poly) => poly.map((ring) => ring.map(([x, y]) => [unwrap(x), y])));
  let w0 = Infinity, e0 = -Infinity, s0 = Infinity, n0 = -Infinity;
  for (const poly of polys) for (const [x, y] of poly[0]) { w0 = Math.min(w0, x); e0 = Math.max(e0, x); s0 = Math.min(s0, y); n0 = Math.max(n0, y); }
  const step = Math.max(0.2, Math.min(0.5, Math.max(e0 - w0, n0 - s0) / 120));
  const W = Math.ceil((e0 - w0) / step) + 2, H = Math.ceil((n0 - s0) / step) + 2;
  const lng0 = w0 - step, lat0 = n0 + step;          // top-left corner of the grid
  const inside = new Uint8Array(W * H), cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const pt = [lng0 + (x + 0.5) * step, lat0 - (y + 0.5) * step];
    if (polys.some((poly) => d3.polygonContains(poly[0], pt) && !poly.slice(1).some((h) => d3.polygonContains(h, pt)))) { inside[y * W + x] = 1; cells.push(y * W + x); }
  }
  if (!cells.length) return [];
  const total = d3.sum(groups, (g) => g.kinds);
  const valueOf = (group, i) => {
    const g = life.groups.find((x) => x.group === group);
    if (!g) return 0;
    const x = i % W, y = Math.floor(i / W);
    const [c, r] = cellOf(lng0 + (x + 0.5) * step, lat0 - (y + 0.5) * step);
    return g.values[r * life.cols + c] / 255;
  };
  const coslat = Math.cos(((n0 + s0) / 2) * Math.PI / 180);
  // Where each group could be: land life on land, sea life at sea (from its range values here).
  const val = groups.map((g) => Float32Array.from({ length: W * H }, (_, i) => (inside[i] ? valueOf(g.group, i) : 0)));
  const fits = groups.map((g, k) => { const top = d3.max(cells, (i) => val[k][i]) || 0; return (i) => val[k][i] >= Math.max(0.12, top * 0.35); });
  // Seeds: biggest group first, each at a spot that suits it and lies far from the seeds already placed.
  const at = (i) => [(i % W) * coslat, Math.floor(i / W)];
  const chosen = [];
  const seeds = new Array(groups.length);
  [...groups.keys()].sort((x, y) => groups[y].kinds - groups[x].kinds).forEach((k) => {
    const ok = cells.filter((i) => fits[k](i));
    const pool = ok.length ? ok : cells;
    let best = pool[0], bestS = -Infinity;
    for (const i of pool) {
      const p = at(i);
      const far = chosen.length ? Math.sqrt(d3.min(chosen, (j) => { const q = at(j); return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; })) : 0;
      const sc = far + 4 * val[k][i];
      if (sc > bestS) { bestS = sc; best = i; }
    }
    chosen.push(best);
    seeds[k] = { ...groups[k], sx: best % W, sy: Math.floor(best / W), w: Math.pow(groups[k].kinds / total, 0.22) };
  });
  const owner = new Int16Array(W * H).fill(-1);
  const assign = () => {
    for (const i of cells) {
      const x = i % W, y = Math.floor(i / W);
      let bk = -1, bd = Infinity, fk = 0, fd = Infinity;
      seeds.forEach((sd, k) => {
        const d = Math.hypot((x - sd.sx) * coslat, y - sd.sy) * (1 + 0.12 * Math.sin(y * 0.35 + k * 2.1) * Math.cos(x * 0.3 + k * 1.3)) / sd.w;
        if (d < fd) { fd = d; fk = k; }
        if (fits[k](i) && d < bd) { bd = d; bk = k; }
      });
      owner[i] = bk >= 0 ? bk : fk;    // a spot no group suits goes to the nearest
    }
  };
  // A few rounds of settling: each seed moves to the middle of its patch, so patches come out rounded.
  for (let round = 0; round < 4; round++) {
    assign();
    seeds.forEach((sd, k) => {
      const mine = cells.filter((i) => owner[i] === k);
      if (!mine.length) return;
      const mx = d3.mean(mine, (i) => i % W), my = d3.mean(mine, (i) => Math.floor(i / W));
      let snap = mine[0], dd = Infinity;
      for (const i of mine) { const d = (i % W - mx) ** 2 + (Math.floor(i / W) - my) ** 2; if (d < dd) { dd = d; snap = i; } }
      sd.sx = snap % W; sd.sy = Math.floor(snap / W);
    });
  }
  assign();
  return seeds.map((sd, k) => {
    const mask = new Float64Array(W * H);
    let count = 0;
    for (const i of cells) if (owner[i] === k) { mask[i] = 1; count++; }
    if (!count) return null;
    const [shape] = d3.contours().size([W, H]).thresholds([0.5])(mask);
    const coordinates = shape.coordinates.map((poly) => poly.map((ring) => ring.map(([x, y]) => [lng0 + x * step, lat0 - y * step])));
    // The symbol goes at the cell deepest inside the patch.
    const depth = new Int32Array(W * H).fill(-1), queue = [];
    for (const i of cells) {
      if (owner[i] !== k) continue;
      const x = i % W, y = Math.floor(i / W);
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const xx = x + dx, yy = y + dy; return xx < 0 || yy < 0 || xx >= W || yy >= H || owner[yy * W + xx] !== k; })) { depth[i] = 0; queue.push(i); }
    }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], x = i % W, y = Math.floor(i / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (owner[j] === k && depth[j] < 0) { depth[j] = depth[i] + 1; queue.push(j); }
      }
    }
    let deep = queue[0];
    for (const i of queue) if (depth[i] > depth[deep]) deep = i;
    const anchor = [lng0 + ((deep % W) + 0.5) * step, lat0 - (Math.floor(deep / W) + 0.5) * step];
    return { ...sd, anchor, feature: { type: "Feature", properties: { group: sd.group, color: groupColor(sd.group) }, geometry: { type: "MultiPolygon", coordinates } } };
  }).filter(Boolean);
}

function drawNet() {
  clearNet();
  const r = nav.region;
  if (!r) return;
  // The place's area: from the numbered areas, or (from search or a dig site) the area its finds sit in.
  const area = r.area || areaAt(r.center[0], r.center[1]) || areaAt(r.sites[0].lng, r.sites[0].lat);
  if (!area) return;
  r.area = area;
  const patches = placePatches(area, r.groups);
  map.getSource("place-patches").setData({ type: "FeatureCollection", features: patches.map((p) => p.feature) });
  map.getSource("place-area").setData({ type: "Feature", properties: {}, geometry: area.geometry });

  const svg = d3.select(map.getContainer()).append("svg").attr("class", "life-net");
  const root = svg.append("g");
  net = { svg, root, open: null, patches };
  const blobs = patches.map((p) => ({ ...p, x: 0, y: 0, r: 26 }));
  const defs = svg.append("defs");
  const links = root.append("g").attr("class", "net-links");
  const nodes = root.append("g").attr("class", "net-nodes");
  const blob = root.append("g").selectAll("g").data(blobs).join("g")
    .attr("class", "blob").attr("tabindex", 0).attr("role", "button")
    .attr("aria-label", (d) => `${GROUPS[d.group].label}: ${plural(d.kinds, "kind")}. Show them.`)
    .on("click", (e, d) => { e.stopPropagation(); toggle(d); })
    .on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(d); } });
  blob.append("circle").attr("class", "hit").attr("r", 22);
  const S = 34;
  blob.each(function (d, i) {
    if (GROUPS[d.group].noIcon) return;
    defs.append("mask").attr("id", `life-mask-${i}`).attr("maskContentUnits", "userSpaceOnUse").style("mask-type", "alpha")
      .append("image").attr("href", `data/icons/${d.group}.svg`).attr("x", -S / 2).attr("y", -S / 2 - 6).attr("width", S).attr("height", S);
    d3.select(this).append("rect").attr("class", "glyph").attr("x", -S / 2).attr("y", -S / 2 - 6).attr("width", S).attr("height", S)
      .attr("fill", "#fbf6e6").attr("mask", `url(#life-mask-${i})`);
  });
  blob.append("text").attr("class", "blob-n").attr("y", (d) => (GROUPS[d.group].noIcon ? 4 : S / 2 + 8))
    .text((d) => `${GROUPS[d.group].label.replace(/ & .*|,.*/, "")} · ${d.kinds}`);
  blob.append("title").text((d) => `${GROUPS[d.group].label}: ${plural(d.kinds, "kind")}`);
  net.blob = blob; net.links = links; net.nodes = nodes;
  net.toggleGroup = (group) => { const d = blobs.find((b) => b.group === group); if (d) toggle(d); };

  // page: which set of NET_MAX names to show round an open group (0 = the most-found).
  function toggle(d, page = 0) {
    net.open = net.open === d && page === 0 ? null : d;
    net.page = page;
    blob.classed("dim", (b) => net.open && b !== net.open).classed("open", (b) => b === net.open);
    net.svg.classed("has-open", !!net.open);              // the map dims behind an open network
    const only = net.open ? ["==", ["get", "group"], net.open.group] : null;
    map.setFilter("place-patches", only); map.setFilter("place-patches-edge", only);
    links.selectAll("*").remove();
    nodes.selectAll("*").remove();
    if (!net.open) {
      // Back to the place as it was before the group opened.
      if (net.prevZoom != null) map.easeTo({ zoom: net.prevZoom, duration: REDUCED ? 0 : 700, essential: false });
      net.prevZoom = null;
      placeNet();
      return;
    }
    // Pull back (to roughly a 1000 km scale) with the open group at the middle of the free space,
    // so its network can spread across the screen and the place it came from stays in view.
    net.prevZoom ??= map.getZoom();
    map.easeTo({ center: d.anchor, zoom: Math.min(net.prevZoom, Math.max(3.0, net.prevZoom - 1)), duration: REDUCED ? 0 : 800, essential: false });
    links.raise(); blob.filter((b) => b === net.open).raise(); nodes.raise();
    const kinds = [...r.genera].filter(([g]) => slice.groups[slice.genera[g].group] === d.group).sort((a, c) => c[1] - a[1]);
    // Rings from just outside the group out to nearly the edge of the free space, most-found kinds innermost.
    const el = map.getContainer();
    const W = el.clientWidth - (wide() ? PANEL_SPACE : 0), H = el.clientHeight;
    // An oval filling the free space, leaving room at the sides for names.
    const rx = Math.max(d.r + 140, W / 2 - 130), ry = Math.max(d.r + 100, H / 2 - 75);
    const rMax = 1, rMin = Math.min(0.85, (d.r + 60) / Math.min(rx, ry));
    const list = kinds.slice(page * NET_MAX, (page + 1) * NET_MAX);
    const rest = kinds.length - (page + 1) * NET_MAX;
    const rings = Math.max(1, Math.min(4, Math.ceil(list.length / 10)));
    const radii = d3.range(rings).map((k) => (rings === 1 ? (rMin + rMax) / 2 : rMin + (rMax - rMin) * k / (rings - 1)));
    const share = radii.map((rr) => rr / d3.sum(radii));
    const counts = share.map((s) => Math.round(s * list.length));
    counts[counts.length - 1] += list.length - d3.sum(counts);
    const shown = [];
    let i = 0;
    radii.forEach((rr, k) => {
      for (let j = 0; j < counts[k]; j++, i++) {
        const [g, n] = list[i];
        const name = shortName(slice.genera[g].name);
        const a = (2 * Math.PI * j) / counts[k] + k * 0.45 - Math.PI / 2;
        shown.push({ g, n, name, w: name.length * 7 + 16, ox: rr * rx * Math.cos(a), oy: rr * ry * Math.sin(a) });
      }
    });
    // Each name reads away from the group; spacing is worked out on the names' centres, not the dots.
    for (const t of shown) {
      t.left = t.ox < -4;
      const side = t.left ? -1 : 1;
      t.x = t.tx = d.x + t.ox + side * t.w / 2; t.y = t.ty = d.y + t.oy;
    }
    if (rest > 0 || page > 0) shown.push({ more: true, name: rest > 0 ? `+ ${rest} more →` : "↺ Back to the first", w: 110,
      x: d.x + 45, y: d.y + d.r + 34, fx: d.x + 45, fy: d.y + d.r + 34 });
    const hub = { x: d.x, y: d.y, fx: d.x, fy: d.y, hub: true };
    d3.forceSimulation([hub, ...shown])
      .force("x", d3.forceX((t) => t.tx ?? t.x).strength(0.1))
      .force("y", d3.forceY((t) => t.ty ?? t.y).strength(0.1))
      .force("collide", d3.forceCollide((t) => (t.hub ? d.r + 30 : Math.max(12, t.w * 0.4))).iterations(4))
      .stop().tick(240);
    // Any names still touching: push them apart up and down, a little at a time.
    const box = (t) => ({ l: t.x - t.w / 2, r: t.x + t.w / 2, t: t.y - 9, b: t.y + 9 });
    for (let pass = 0; pass < 60; pass++) {
      let moved = false;
      for (let a = 0; a < shown.length; a++) for (let b = a + 1; b < shown.length; b++) {
        const A = box(shown[a]), B = box(shown[b]);
        if (A.l >= B.r || B.l >= A.r || A.t >= B.b || B.t >= A.b) continue;
        const push = (Math.min(A.b, B.b) - Math.max(A.t, B.t)) / 2 + 0.5, up = shown[a].y <= shown[b].y ? -1 : 1;
        if (shown[a].fx == null) shown[a].y += up * push;
        if (shown[b].fx == null) shown[b].y -= up * push;
        moved = true;
      }
      if (!moved) break;
    }
    for (const t of shown) t.x -= (t.left ? -1 : 1) * t.w / 2;   // back from the name's centre to its dot
    links.selectAll("line").data(shown).join("line")
      .attr("x1", d.x).attr("y1", d.y).attr("x2", (t) => t.x).attr("y2", (t) => t.y)
      .attr("stroke", groupColor(d.group));
    const node = nodes.selectAll("g").data(shown).join("g").attr("class", "net-node")
      .attr("transform", (t) => `translate(${t.x},${t.y})`).attr("tabindex", 0).attr("role", "button")
      .attr("aria-label", (t) => (t.more ? t.name : `${t.name}. Open it.`))
      .on("click", (e, t) => { e.stopPropagation(); pick(t); })
      .on("keydown", (e, t) => { if (e.key === "Enter") pick(t); });
    node.append("circle").attr("r", (t) => (t.more ? 4 : 3.5 + Math.min(4, Math.log1p(t.n)))).attr("fill", groupColor(d.group));
    // Names point away from the group: right of the dot on the right side, left of it on the left.
    node.append("text").attr("x", (t) => (t.left ? -9 : 9)).attr("text-anchor", (t) => (t.left ? "end" : "start"))
      .attr("dy", "0.32em").text((t) => t.name).classed("more", (t) => !!t.more);
    node.append("title").text((t) => (t.more ? "Show the next names" : `${t.name}: ${plural(t.n, "fossil record")}`));
  }
  function pick(t) {
    if (t.more) {
      const d = net.open, rest = d && [...r.genera].filter(([g]) => slice.groups[slice.genera[g].group] === d.group).length - (net.page + 1) * NET_MAX;
      if (rest > 0) toggle(d, net.page + 1); else { net.open = null; toggle(d, 0); }
      return;
    }
    openGenusHere(t.g);
  }
  placeNet();
}

// Pin each group's symbol to its patch, and an open group's network to it, as the map moves;
// anything on the far side of the globe is hidden.
function placeNet() {
  if (!net || !nav.region) return;
  const centre = map.getCenter();
  const hidden = (ll) => map.getZoom() < FLAT_ZOOM && d3.geoDistance(ll, [centre.lng, centre.lat]) > Math.PI / 2 * 0.98;
  net.blob.attr("transform", (d) => { const p = map.project(d.anchor); return `translate(${p.x},${p.y})`; })
    .style("visibility", (d) => (hidden(d.anchor) ? "hidden" : null));
  if (net.open) {
    const p = map.project(net.open.anchor);
    net.links.attr("transform", `translate(${p.x},${p.y})`);
    net.nodes.attr("transform", `translate(${p.x},${p.y})`);
  }
}

// ---------- Space behind the globe ----------
// A fixed random starfield, drawn once to a canvas and used as the map's backdrop.
(function starfield() {
  const c = document.createElement("canvas"), size = 1024;
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#03040b"; ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) {
    const r = rand() < 0.93 ? 0.5 + rand() * 0.6 : 1.1 + rand() * 0.9;
    ctx.globalAlpha = 0.25 + rand() * 0.75;
    ctx.fillStyle = rand() < 0.15 ? "#cfe0ff" : rand() < 0.1 ? "#ffe6c4" : "#ffffff";
    ctx.beginPath(); ctx.arc(rand() * size, rand() * size, r, 0, 2 * Math.PI); ctx.fill();
  }
  document.documentElement.style.setProperty("--stars", `url(${c.toDataURL("image/png")})`);
})();

// ---------- The time slider: one stop per period that has been built ----------
function renderTimeline() {
  const el = document.getElementById("timeline");
  if (!el || slices.length < 2) return;
  const i = slices.findIndex((s) => s.time === slice.time);
  const order = [...slices].sort((a, c) => c.time - a.time);       // oldest on the left
  const at = order.findIndex((s) => s.time === slice.time);
  el.hidden = false;
  el.innerHTML = `<label for="time-range" class="sr-only">Time</label>
    <input type="range" id="time-range" min="0" max="${order.length - 1}" step="1" value="${at}"
      aria-valuetext="${esc(order[at].label)}, ${order[at].time} million years ago">
    <div class="ticks">${order.map((s, j) => `<button type="button" class="${j === at ? "on" : ""}" data-time="${s.time}" title="Go to the ${esc(s.label)}" aria-label="Go to the ${esc(s.label)}, ${s.time} million years ago">${s.time}</button>`).join("")}</div>
    <p class="small">Millions of years ago · ${esc(order[at].period)}</p>
    ${order[at + 1] ? `<button type="button" class="next-period" data-next="${order[at + 1].time}">Next: ${esc(order[at + 1].label)} →</button>` : ""}`;
  const range = el.querySelector("input");
  const show = () => { const s = order[+range.value]; range.setAttribute("aria-valuetext", `${s.label}, ${s.time} million years ago`); };
  range.addEventListener("input", show);
  // Picking a period on the scale goes straight there; only "Next" plays the continents moving.
  const jump = (t) => { if (t === slice.time) return; const c = map.getCenter(); goTime(t, { c: `${c.lng.toFixed(2)},${c.lat.toFixed(2)},${map.getZoom().toFixed(2)}` }); };
  range.addEventListener("change", () => jump(order[+range.value].time));
  el.querySelector("[data-next]")?.addEventListener("click", (e) => {
    range.value = at + 1;
    playTransition(+e.currentTarget.dataset.next);
  });
  el.querySelectorAll("[data-time]").forEach((b) => b.addEventListener("click", () => {
    range.value = order.findIndex((s) => s.time === +b.dataset.time);
    jump(+b.dataset.time);
  }));
  void i;
}

// ---------- Ice: when the ice sheets came and went ----------
// For each million years, the ancient latitude poleward of which land lay under ice (null: none at that pole).
// Rough edges from the glaciation record: the end-Ordovician (Hirnantian) ice, the Late Devonian pulses,
// the Late Paleozoic Ice Age over southern Gondwana, Antarctica's ice sheet since 34 Ma, and the
// Pleistocene ice ages. Only land is whitened; frames 1 Myr apart can't show each ice-age cycle.
const ICE = [  // [from Ma, to Ma, southern edge, northern edge]
  [0, 0.9, -62, 72], [1, 2.6, -58, 50], [2.7, 34, -64, null],
  [260, 289, -55, null], [290, 320, -42, null], [321, 335, -55, null], [336, 362, -62, null], [363, 375, -66, null],
  [443, 446, -45, null], [447, 460, -62, null],
];
const iceAt = (t) => { const r = ICE.find(([a, b]) => t >= a && t <= b); return r ? { s: r[2], n: r[3] } : null; };
const iceRead = document.createElement("canvas"); iceRead.width = 360; iceRead.height = 180;
// Paint the ice for time t onto `out` (360 x 180, equal steps of latitude) from an equirectangular map.
function paintIce(src, t, out) {
  const o = out.getContext("2d");
  o.clearRect(0, 0, 360, 180);
  const ice = iceAt(t);
  if (!ice) return false;
  const r = iceRead.getContext("2d", { willReadFrequently: true });
  r.clearRect(0, 0, 360, 180); r.drawImage(src, 0, 0, 360, 180);
  const px = r.getImageData(0, 0, 360, 180).data, res = o.createImageData(360, 180), q = res.data;
  for (let y = 0; y < 180; y++) {
    const lat = 89.5 - y;
    const a = Math.min(1, Math.max(ice.s != null ? (ice.s - lat) / 4 : 0, ice.n != null ? (lat - ice.n) / 4 : 0));
    if (a <= 0) continue;
    for (let x = 0; x < 360; x++) {
      const i = (y * 360 + x) * 4;
      if (px[i] > px[i + 2] + 4) { q[i] = 242; q[i + 1] = 247; q[i + 2] = 252; q[i + 3] = Math.round(230 * a); }   // land: red above blue
    }
  }
  o.putImageData(res, 0, 0);
  return true;
}
// The same, re-laid in Web Mercator rows for MapLibre.
const MERC_LAT = 85.05112878;
function mercOf(eq, w = 1440, h = 1440, out = null) {
  out = out || Object.assign(document.createElement("canvas"), { width: w, height: h });
  const m = out.getContext("2d");
  m.clearRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / h))) * 180) / Math.PI;
    m.drawImage(eq, 0, Math.min(eq.height - 1, ((90 - lat) / 180) * eq.height), eq.width, 1, 0, y, w, 1);
  }
  return out;
}
// Ice for the period on show: over the globe, and kept for the flat map.
let flatIce = null;
function addIce() {
  if (!iceAt(slice.time)) return;
  const img = new Image();
  img.onload = () => {
    const eq = document.createElement("canvas"); eq.width = 360; eq.height = 180;
    paintIce(img, slice.time, eq);
    flatIce = eq;
    map.addSource("ice", { type: "canvas", canvas: mercOf(eq), animate: false,
      coordinates: [[-180, MERC_LAT], [180, MERC_LAT], [180, -MERC_LAT], [-180, -MERC_LAT]] });
    map.addLayer({ id: "ice", type: "raster", source: "ice", paint: { "raster-fade-duration": 0, "raster-resampling": "linear" } },
      map.getLayer("coast") ? "coast" : undefined);
    if (flat) drawFlat();
  };
  img.src = `data/terrain/${slice.time}-flat.jpg?v=${BUILD}`;
}

// ---------- Travelling through time: the continents moving, on the flat map ----------
// Frames of the ancient Earth every million years (data/motion/<t>.jpg, built by make-motion-frames.py)
// in which the plates physically move. Picking any period plays them from here to there, through every
// period in between, naming each one as it passes.
let playing = false;
const frameCache = new Map();
function motionFrame(t) {
  if (!frameCache.has(t)) {
    const img = new Image();
    img.decoding = "async";
    // Until every million-year frame is built, a missing one shows the nearest period's map instead.
    img.onerror = () => {
      if (img.dataset.fallback) return;
      img.dataset.fallback = "1";
      const near = slices.reduce((b, s) => (Math.abs(s.time - t) < Math.abs(b.time - t) ? s : b), slices[0]);
      img.src = `data/terrain/${near.time}-flat.jpg?v=${BUILD}`;
    };
    img.src = `data/motion/${t}.jpg?v=${BUILD}`;
    frameCache.set(t, img);
  }
  return frameCache.get(t);
}
const ready = (img) => img.complete && img.naturalWidth > 0;

// The story of life alongside the moving continents: each period as a band in its colour, a marker at
// the moment shown, and the milestones (after the "Evolution of Life Through Geologic Time" chart).
const PERIODS = [[541, "Cambrian", "#9fd3a0"], [485, "Ordovician", "#3fb3a8"], [444, "Silurian", "#b9e3d6"], [419, "Devonian", "#e9c38c"],
  [359, "Carboniferous", "#9cc7a6"], [299, "Permian", "#f2a07f"], [252, "Triassic", "#b99ad6"], [201, "Jurassic", "#7fcbe8"],
  [145, "Cretaceous", "#a9d77e"], [66, "Paleogene", "#f8c8a8"], [23, "Neogene", "#f7e27a"], [2.6, "Quaternary", "#e9e6c9"]];
const MILESTONES = [[541, "Cambrian explosion: animals with shells and eyes"], [485, "Invertebrates dominate the sea"], [480, "First jawless fish"],
  [430, "First vascular plants invade the land"], [410, "First insects"], [400, "Fishes flourish"], [370, "First amphibians"],
  [340, "Dominance of amphibians"], [320, "First reptiles"], [310, "Extensive coal swamps"], [290, "Gymnosperms flourish"],
  [252, "Great Permian extinction"], [230, "First dinosaurs"], [225, "First mammals"], [200, "Dinosaurs dominate"], [180, "Conifers abundant"],
  [150, "First birds"], [130, "First flowering plants"], [66, "Extinction of the dinosaurs and many other species"], [56, "First primates"],
  [55, "First horses"], [50, "First whales"], [25, "First apes"], [20, "Grasslands widespread; mammals, birds, insects and flowering plants flourish"],
  [2.6, "Ice Age; evolution of the genus Homo"], [0.01, "Extinction of many giant mammals"]];

// A picture for each milestone: the silhouette of the group it is about.
const MILESTONE_ICON = {541: "trilobites", 485: "molluscs", 480: "fish", 430: "plants", 410: "arthropods", 400: "fish", 370: "amphibians", 340: "amphibians", 320: "reptiles", 310: "plants", 290: "plants", 252: "reptiles", 230: "dinosaurs", 225: "mammals", 200: "dinosaurs", 180: "plants", 150: "dinosaurs", 130: "plants", 66: "dinosaurs", 56: "mammals", 55: "mammals", 50: "mammals", 25: "mammals", 20: "plants", 2.6: "mammals", 0.01: "mammals"};
let milestoneImages = {};
d3.json(`data/milestone-images.json?v=${BUILD}`).then((m) => { milestoneImages = m || {}; if (slice && map) renderLadder(); }).catch(() => {});
const milestoneIcon = (age) => { const im = milestoneImages[String(age)]; if (im) return `<img class="ms-photo" src="${im.file}" alt="${esc(im.title)}" loading="lazy">`; const g = MILESTONE_ICON[age]; return g ? `<span class="icon ms-icon" style="--icon:url(data/icons/${g}.svg);--icon-color:${groupColor(g)}"></span>` : ""; };

// The story of life as a winding ribbon (after the "Evolution of Life Through Geologic Time" drawing):
// each period a band of colour swinging across and turning back, its milestones beside it with their
// pictures. It holds only the periods reached so far, so it grows as you move forward through time.
// The story of life as a winding 3-D ribbon, after the "Evolution of Life Through Geologic Time" drawing:
// each period a band swinging across and turning back, its milestones and their pictures beside it.
// It holds only the periods reached so far, so it grows as you move forward through time.
function renderLadder() {
  const stack = rightStack();
  let el = document.getElementById("life-ladder");
  if (!el) {
    el = document.createElement("section");
    el.id = "life-ladder"; el.className = "life-ladder";
    el.setAttribute("aria-label", "The story of life so far");
    stack.appendChild(el);
  }
  const now = slice.time, steps = PERIODS.filter(([start]) => start >= now);
  const W = 400, L = 120, R = 280, T = 30, SIDE = 9;
  let y = 12, side = "", top = "", text = "", notes = "";
  steps.forEach(([start, name, col], i) => {
    const end = PERIODS[PERIODS.findIndex((q) => q[0] === start) + 1]?.[0] ?? 0;
    const ms = MILESTONES.filter(([age]) => age <= start && age > end && age >= now);
    const h = Math.max(58, 22 * ms.length + 16), drop = 18, ltr = i % 2 === 0, x0 = ltr ? L : R, x1 = ltr ? R : L;
    const r = (h - drop) / 2, last = i === steps.length - 1;
    const d = `M ${x0} ${y} L ${x1} ${y + drop}${last ? "" : ` A ${r} ${r} 0 0 ${ltr ? 1 : 0} ${x1} ${y + h}`}`;
    const dark = d3.color(col).darker(1.1).formatHex();
    side += `<path d="${d}" stroke="${dark}" transform="translate(0 ${SIDE})"/>`;   // the ribbon's edge, below
    top += `<path d="${d}" stroke="${col}"/>`;
    text += `<text x="${(L + R) / 2}" y="${y + drop / 2 + 5}" transform="rotate(${(ltr ? 1 : -1) * 6.4} ${(L + R) / 2} ${y + drop / 2})">${name.toUpperCase()}</text>`;
    text += `<text class="ma" x="${x0 + (ltr ? -6 : 6)}" y="${y + 4}" text-anchor="${ltr ? "end" : "start"}">${start >= 1 ? Math.round(start) : start} Ma</text>`;
    ms.forEach(([age, t], k) => {
      notes += `<div role="button" tabindex="0" data-ms="${age}" title="See it on the map" class="note ${k % 2 ? (ltr ? "left" : "right") : (ltr ? "right" : "left")}" style="top:${y + 4 + Math.floor(k / 2) * 30 + (k % 2) * 12}px">${milestoneIcon(age)}<span>${esc(t)}</span></div>`;
    });
    y += h;
  });
  const H = y + SIDE + 16;
  el.innerHTML = `<button type="button" class="ladder-strip" aria-expanded="${!!window.ladderOpen}">The story of life <i>${window.ladderOpen ? "▾" : "▸"}</i></button><div class="spiral"${window.ladderOpen ? "" : " hidden"} style="height:${H}px"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><g class="side">${side}</g><g class="top">${top}</g>${text}</svg>${notes}</div>`;
  el.scrollTop = 1e6;
  el.querySelector(".ladder-strip").onclick = () => { window.ladderOpen = !window.ladderOpen; const o = window.ladderOpen; el.querySelector(".spiral").hidden = !o; el.querySelector(".ladder-strip").setAttribute("aria-expanded", o); el.querySelector(".ladder-strip i").textContent = o ? "▾" : "▸"; el.classList.toggle("open", o); if (o) el.scrollTop = 1e6; };
  el.classList.toggle("open", !!window.ladderOpen);
  el.querySelectorAll("[data-ms]").forEach((n) => {
    const go = () => goMilestone(+n.dataset.ms);
    n.onclick = go; n.onkeydown = (e) => { if (e.key === "Enter") go(); };
  });
}

// A milestone, on the map: the built period nearest it, opening its example animal when that period has
// one on record, or else showing where its whole group lived.
function goMilestone(age) {
  const t = slices.map((x) => x.time).reduce((a, b) => (Math.abs(b - age) < Math.abs(a - age) ? b : a));
  if (t === slice.time) { openMilestone(age); return; }
  goTime(t, { ms: age });
}
function openMilestone(age) {
  const name = (milestoneImages[String(age)]?.title || "").split(" ")[0];
  const g = slice.genera.findIndex((x) => shortName(x.name) === name);
  if (g >= 0) { goToGenus(g); return; }
  const group = MILESTONE_ICON[age];
  if (group && slice.groups.includes(group)) {
    if (nav.level !== "world") goWorld();
    worldFilter = group; renderAll(); showGroupRange();
  }
}

// The right-hand column under the time slider: "What lived" (folded to a strip) and the story of life.
function rightStack() {
  let st = document.getElementById("right-stack");
  if (!st) {
    st = document.createElement("div");
    st.id = "right-stack"; st.className = "right-stack";
    document.querySelector(".stage").appendChild(st);
    const g = document.getElementById("groups-card");
    if (g) st.prepend(g);
  }
  const head = document.getElementById("panel-card").getBoundingClientRect(), stage = st.parentElement.getBoundingClientRect();
  st.style.top = `${Math.round(head.bottom - stage.top + 10)}px`;
  return st;
}

function lifeRibbon(from, to) {
  const el = document.createElement("aside");
  el.className = "life-ribbon";
  el.setAttribute("aria-live", "polite");
  const top = 541, y = (ma) => (1 - Math.min(top, Math.max(0, ma)) / top) * 100;
  el.innerHTML = `<div class="rb-bar">${PERIODS.map(([start, name, col], i) => {
    const end = i + 1 < PERIODS.length ? PERIODS[i + 1][0] : 0;
    return `<div class="rb-band" style="top:${y(start)}%;height:${y(end) - y(start)}%;background:${col}"><span>${name}</span></div>`;
  }).join("")}<div class="rb-mark"></div></div><ol class="rb-events"></ol>`;
  const mark = el.querySelector(".rb-mark"), list = el.querySelector(".rb-events");
  const lo = Math.min(from, to), hi = Math.max(from, to);
  const events = MILESTONES.filter(([ma]) => ma <= hi + 0.01 && ma >= lo - 0.01).sort((a, c) => (from > to ? c[0] - a[0] : a[0] - c[0]));
  let shown = 0;
  return { el, update(ma) {
    mark.style.top = `${y(ma)}%`;
    while (shown < events.length && (from > to ? events[shown][0] >= ma : events[shown][0] <= ma)) {
      const [age, text] = events[shown++];
      const li = document.createElement("li");
      li.innerHTML = `${milestoneIcon(age)}<b>${age >= 1 ? Math.round(age) : age} Ma</b> ${esc(text)}`;
      list.prepend(li);
      while (list.children.length > 4) list.lastChild.remove();
    }
  } };
}

async function playTransition(to) {
  if (playing || to === slice.time) return;
  if (to > slice.time) { goTime(to); return; }             // never animate backwards in time
  playing = true;
  const from = slice.time, span = Math.abs(to - from), dir = Math.sign(to - from);
  // About 12 million years a second, kept between 3 and 16 seconds; long trips skip frames to keep up.
  const seconds = REDUCED ? 0.01 : Math.max(3, Math.min(16, span / 12));
  const stride = Math.max(1, Math.ceil(span / (seconds * 30)));
  const times = [];
  for (let t = from; dir > 0 ? t < to : t > to; t += dir * stride) times.push(t);
  times.push(to);
  times.forEach((t) => motionFrame(t));                       // start loading them all, in order

  if (nav.level !== "world") goWorld();
  hideFlat?.();
  document.body.classList.add("time-travel");
  if (!map.isStyleLoaded()) await new Promise((r) => { map.once("idle", r); setTimeout(r, 3000); });
  for (const l of map.getStyle().layers) {        // every line and dot steps aside: just the Earth and its names
    if (l.type === "line" || l.type === "circle" || l.source === "place-patches") map.setLayoutProperty(l.id, "visibility", "none");
  }
  clearNet();
  const clock = document.createElement("div");
  clock.className = "time-clock";
  document.querySelector(".stage").appendChild(clock);
  const passing = [...slices].sort((a, c) => dir * (c.time - a.time));
  const ribbon = lifeRibbon(from, to);
  document.querySelector(".stage").appendChild(ribbon.el);
  document.getElementById("life-ladder")?.remove();

  // The frames are flat (equal steps of latitude); the globe takes pictures in Web Mercator. Each frame is
  // blended on a flat canvas, then copied row by row onto a Mercator canvas that is draped over the globe.
  const flatC = document.createElement("canvas"); flatC.width = 1440; flatC.height = 720;
  const fctx = flatC.getContext("2d");
  const iceC = document.createElement("canvas"); iceC.width = 360; iceC.height = 180;
  if (map.getLayer("ice")) map.setLayoutProperty("ice", "visibility", "none");
  const merc = document.createElement("canvas"); merc.width = 1440; merc.height = 1440;
  const mctx = merc.getContext("2d");
  const MAX_LAT = 85.05112878;
  const rowLat = Array.from({ length: merc.height }, (_, y) =>
    (Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / merc.height))) * 180) / Math.PI);
  map.addSource("motion", { type: "canvas", canvas: merc, animate: true,
    coordinates: [[-180, MAX_LAT], [180, MAX_LAT], [180, -MAX_LAT], [-180, -MAX_LAT]] });
  map.addLayer({ id: "motion", type: "raster", source: "motion", paint: { "raster-fade-duration": 0, "raster-resampling": "linear" } },
    map.getLayer("coast") ? "coast" : undefined);
  // The same moment as a flat world map, popped out in the card, so the whole planet is visible at once.
  const inset = document.createElement("figure");
  inset.className = "time-inset";
  inset.innerHTML = `<canvas width="1440" height="720" aria-hidden="true"></canvas><figcaption>The whole world, flat</figcaption>`;
  // Big enough to read: wider than the card, its right edge lined up with the card, over the stars.
  document.querySelector(".stage").appendChild(inset);
  inset.prepend(clock);                                   // the counter rides in the pop-out's header
  // Make room: the globe shrinks and rises into the space above the pop-out, so nothing covers it.
  const stage = document.querySelector(".stage").getBoundingClientRect(), ib = inset.getBoundingClientRect();
  const pad = map.getPadding();
  // Either the space above the pop-out or the space beside it, whichever holds a bigger globe.
  const above = Math.min(ib.top - stage.top - 24, stage.width - pad.left - pad.right - 24);
  const beside = Math.min(ib.left - stage.left - pad.left - 24, stage.height - 24);
  const room = Math.max(120, above, beside);
  const fitZoom = Math.log2((room * 0.92 * Math.PI) / 512);
  const padding = beside >= above
    ? { ...pad, top: 12, bottom: 12, right: stage.right - ib.left + 12 }
    : { ...pad, top: 12, bottom: stage.bottom - ib.top + 12 };
  // (A jump, not an ease: the spin below moves the camera every frame and would cut an ease short.)
  // Face the middle latitudes: the moving frames can't reach the last few degrees round each pole.
  map.jumpTo({ padding, zoom: fitZoom, center: [map.getCenter().lng, Math.max(-25, Math.min(25, map.getCenter().lat))] });
  const ictx = inset.querySelector("canvas").getContext("2d");
  // Names for the flat map: today's places ride along with the plates; the ancient names of the period
  // you leave fade out and those of the period you reach fade in.
  const getJSON = (u) => d3.json(`${u}?v=${BUILD}`).catch(() => null);
  const [tracks, fromNames, toNames] = await Promise.all([getJSON("data/name-tracks.json"),
    getJSON(`data/labels-${from}.json`), getJSON(`data/labels-${to}.json`)]);
  const trackAt = (track, ma) => {                       // between two 5-Myr points, along the great circle
    const f = ma / tracks.step, i = Math.floor(f), k = f - i;
    const p = track[i], q = track[Math.min(track.length - 1, i + 1)];
    if (!p || !q) return p || q || null;
    return d3.geoInterpolate(p, q)(k);
  };
  // The same guides and names on the globe: equator and tropics as lines, today's places riding their
  // plates, the old period's ancient names fading out and the new one's fading in.
  const lat = (y) => ({ type: "Feature", properties: { eq: y === 0 }, geometry: { type: "LineString",
    coordinates: d3.range(-180, 181, 2).map((x) => [x, y]) } });
  map.addSource("travel-grid", { type: "geojson", data: { type: "FeatureCollection", features: [0, 23.5, -23.5, 66.5, -66.5].map(lat) } });
  map.addLayer({ id: "travel-grid", type: "line", source: "travel-grid", layout: { visibility: "none" },
    paint: { "line-color": "#ffffff", "line-opacity": ["case", ["get", "eq"], 0.6, 0.3], "line-width": ["case", ["get", "eq"], 1.4, 0.8],
      "line-dasharray": [3, 3] } });
  const travelMarker = (text, cls) => {
    const el = document.createElement("div");
    el.className = `travel-name ${cls}`;
    el.textContent = text;
    el.setAttribute("aria-hidden", "true");
    return { el, m: new maplibregl.Marker({ element: el, anchor: "center", opacityWhenCovered: "0" }).setLngLat([0, 0]).addTo(map) };
  };
  const goldNames = tracks ? Object.keys(tracks.tracks).map((n) => ({ n, ...travelMarker(n, "modern") })) : [];
  const ancient = [[fromNames, "from"], [toNames, "to"]].flatMap(([names, side]) => (Array.isArray(names) ? names : []).map((l) => {
    const mk = travelMarker(l.name, l.kind);
    mk.m.setLngLat([l.lng, l.lat]);
    return { side, ...mk };
  }));
  // Spin the globe gently while the plates move, like the classic Pangaea animations.
  const startLng = map.getCenter().lng, spin = Math.min(120, 25 + span * 0.25);

  const draw = (age) => {
    const i = Math.min(times.length - 1, Math.floor(age)), k = age - i;
    const a = motionFrame(times[i]), b = motionFrame(times[Math.min(times.length - 1, i + 1)]);
    if (ready(a)) { fctx.globalAlpha = 1; fctx.drawImage(a, 0, 0, flatC.width, flatC.height); }
    if (k > 0 && ready(b)) { fctx.globalAlpha = k; fctx.drawImage(b, 0, 0, flatC.width, flatC.height); }
    fctx.globalAlpha = 1;
    const maIce = Math.round(times[i] + (times[Math.min(times.length - 1, i + 1)] - times[i]) * k);
    if (paintIce(flatC, maIce, iceC)) fctx.drawImage(iceC, 0, 0, flatC.width, flatC.height);
    for (let y = 0; y < merc.height; y++) {
      const sy = ((90 - rowLat[y]) / 180) * flatC.height;
      mctx.drawImage(flatC, 0, Math.min(flatC.height - 1, sy), flatC.width, 1, 0, y, merc.width, 1);
    }
    const iw = 1440, ih = 720;
    ictx.drawImage(flatC, 0, 0, iw, ih);
    const label = (text, x, y, font, fill, align = "center") => {
      ictx.font = font; ictx.textAlign = align; ictx.textBaseline = "middle";
      ictx.lineWidth = 5; ictx.strokeStyle = "rgba(0,0,0,0.75)"; ictx.strokeText(text, x, y);
      ictx.fillStyle = fill; ictx.fillText(text, x, y);
    };
    const pos = (lng, lat) => [((((lng + 180) % 360) + 360) % 360) / 360 * iw, (90 - lat) / 180 * ih];
    const maNow = times[i] + (times[Math.min(times.length - 1, i + 1)] - times[i]) * k;
    const progress = span ? Math.abs(maNow - from) / span : 1;
    // Ancient names: out with the old period, in with the new.
    for (const [names, alpha] of [[fromNames, 1 - Math.min(1, progress * 2)], [toNames, Math.max(0, progress * 2 - 1)]]) {
      if (!Array.isArray(names) || alpha <= 0) continue;
      ictx.globalAlpha = alpha;
      for (const n of names) {
        const [x, y] = pos(n.lng, n.lat);
        const big = n.kind === "super";
        if (names === toNames) label(n.name.toUpperCase(), x, y, `700 ${big ? 36 : 30}px system-ui, sans-serif`, "#5dff3a");   // the arriving period's names
        else label(big ? n.name.toUpperCase() : n.name, x, y, `${n.kind === "sea" ? "italic " : ""}${big ? 30 : 24}px 'EB Garamond', Georgia, serif`,
          n.kind === "sea" ? "rgba(190,225,255,0.95)" : "rgba(255,255,255,0.92)");
      }
      ictx.globalAlpha = 1;
    }
    // On the globe: move the gold names, fade the ancient ones.
    for (const g of goldNames) {
      const p = trackAt(tracks.tracks[g.n], maNow);
      g.el.style.display = p ? "" : "none";
      if (p) g.m.setLngLat(p);
    }
    for (const a of ancient) a.el.style.opacity = String(a.side === "from" ? 1 - Math.min(1, progress * 2) : Math.max(0, progress * 2 - 1));
    // Today's places, carried by the plates.
    if (tracks) for (const [name, track] of Object.entries(tracks.tracks)) {
      const p = trackAt(track, maNow);
      if (!p) continue;
      const [x, y] = pos(p[0], p[1]);
      label(name.toUpperCase(), x, y, "600 17px system-ui, sans-serif", "rgba(246,214,150,0.95)");
    }
    const ma = Math.round(times[i] + (times[Math.min(times.length - 1, i + 1)] - times[i]) * k);
    const period = passing.reduce((best, s) => (Math.abs(s.time - ma) < Math.abs(best.time - ma) ? s : best), passing[0]);
    ribbon.update(maNow);
    clock.innerHTML = `<b>${ma}</b><span>million years ago${period ? ` · ${esc(period.label)}` : ""}</span>`;
    map.setCenter([startLng + spin * (age / Math.max(1, times.length - 1)), map.getCenter().lat]);
  };

  // Play: frame index advances with time, waiting whenever the next picture hasn't arrived yet.
  await new Promise((done) => {
    let age = 0, last = performance.now();
    const perFrame = (seconds * 1000) / Math.max(1, times.length - 1);
    const tick = (now) => {
      const dt = now - last; last = now;
      const next = motionFrame(times[Math.min(times.length - 1, Math.floor(age) + 1)]);
      if (ready(next) || (next.complete && next.dataset.fallback)) age = Math.min(times.length - 1, age + dt / perFrame);
      draw(age);
      if (age < times.length - 1) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  await new Promise((r) => setTimeout(r, REDUCED ? 0 : 600));
  const c = map.getCenter();
  try { sessionStorage.setItem("milestones", ribbon.el.querySelector(".rb-events").innerHTML); } catch {}
  goTime(to, { c: `${c.lng.toFixed(2)},${c.lat.toFixed(2)},${map.getZoom().toFixed(2)}` });
}

// After a trip through time, the milestones it passed stay on screen until closed.
function showKeptMilestones() {
  let html = "";
  try { html = sessionStorage.getItem("milestones") || ""; sessionStorage.removeItem("milestones"); } catch {}
  if (!html) return;
  const el = document.createElement("aside");
  el.className = "life-ribbon kept";
  el.innerHTML = `<ol class="rb-events">${html}</ol><button type="button" class="rb-close" aria-label="Close">×</button>`;
  el.querySelector(".rb-close").onclick = () => el.remove();
  document.querySelector(".stage").appendChild(el);
}

function goTime(time, extra = {}) {
  const q = new URLSearchParams({ t: time, ...(typeof storyParams === "function" ? storyParams() : {}), ...extra });
  location.search = q.toString();
}

// ---------- Guided tours (written by the build-time agent, saved as static data) ----------
function tourStep() {
  const key = params.get("tour"), step = +params.get("step") || 0;
  const tour = agent.tours?.[key];
  return tour ? { key, tour, step, s: tour.steps[step] } : null;
}

function startTourStep() {
  const t = tourStep();
  if (!t?.s) return;
  const g = slice.genera.findIndex((x) => x.name === t.s.genus);
  if (g >= 0) goToGenus(g);
}

load(params.has("t") ? +params.get("t") : null);
