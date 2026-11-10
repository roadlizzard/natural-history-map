// The panel beside the map, plus the breadcrumb, the hint and search. It teaches at whichever level
// you are on: the whole world, one region, one group of life there, or one fossil.
// Depends on globals from map.js.

// Plain-English nouns for common PBDB classes.
const CLASS_NOUNS = {
  Bivalvia: "bivalve (a clam-like mollusc)", Cephalopoda: "cephalopod (an ammonite, belemnite or relative)",
  Gastropoda: "snail", Scaphopoda: "tusk shell", Insecta: "insect", Malacostraca: "crustacean",
  Ostracoda: "ostracod (a tiny 'seed shrimp')", Anthozoa: "coral", Hydrozoa: "hydrozoan",
  Demospongiae: "sponge", Hexactinellida: "glass sponge", Calcarea: "chalky sponge",
  Echinoidea: "sea urchin", Crinoidea: "sea lily", Asteroidea: "sea star", Ophiuroidea: "brittle star",
  Rhynchonellata: "brachiopod (a lamp shell)", Lingulata: "brachiopod (a lamp shell)",
  Polycystinea: "radiolarian (single-celled plankton with a glassy skeleton)",
  Nodosariata: "foraminiferan (single-celled plankton with a shell)",
  Tubothalamea: "foraminiferan (single-celled plankton with a shell)",
  Globothalamea: "foraminiferan (single-celled plankton with a shell)",
  Osteichthyes: "bony fish", Actinopterygii: "ray-finned fish", Chondrichthyes: "shark or ray",
  Reptilia: "reptile", Saurischia: "saurischian dinosaur", Ornithischia: "ornithischian dinosaur",
  Mammalia: "mammal", Amphibia: "amphibian", Polychaeta: "bristle worm",
};
// One member of each group, for "a plant-eating ___" when the class has no plain noun.
const GROUP_NOUNS = {
  "trilobites": "trilobite", "arthropods": "arthropod", "molluscs": "mollusc", "brachiopods": "brachiopod",
  "corals-sponges": "coral or sponge", "echinoderms": "echinoderm", "fish": "fish", "amphibians": "amphibian",
  "reptiles": "reptile", "dinosaurs": "dinosaur", "mammals": "mammal", "plants": "plant", "other": "organism",
  "bryozoans": "bryozoan", "graptolites": "graptolite", "conodonts": "conodont", "algae": "alga", "forams": "foram",
};
const DIET_ADJ = {
  herbivore: "plant-eating", carnivore: "meat-eating", insectivore: "insect-eating", piscivore: "fish-eating",
  omnivore: "omnivorous", "suspension feeder": "filter-feeding", "deposit feeder": "mud-sifting",
  durophage: "shell-crushing", grazer: "grazing", detritivore: "scavenging", browser: "browsing",
};

// PBDB's ecology vocabulary, said plainly. Terms not listed are shown as PBDB gives them.
const ECO_WORDS = {
  environment: {
    marine: "the sea", brackish: "brackish water", freshwater: "fresh water", terrestrial: "land",
    "marginal marine": "coastal waters", lacustrine: "lakes", fluvial: "rivers",
  },
  motility: {
    stationary: "stayed in one place", attached: "fixed to the seabed or a surface", "fast-moving": "moved fast",
    "actively mobile": "moved about actively", "slow-moving": "moved slowly", "passively mobile": "drifted with the water",
    "facultatively mobile": "could move when it needed to", sedentary: "rarely moved",
  },
  life_habit: {
    nektonic: "swam in open water", planktonic: "drifted as plankton", epifaunal: "lived on the seabed",
    infaunal: "burrowed into the seabed", "semi-infaunal": "lived half-buried in the seabed",
    "ground dwelling": "lived on the ground", gregarious: "lived in groups", solitary: "lived alone",
    scansorial: "climbed", arboreal: "lived in trees", volant: "could fly", boring: "bored into rock or wood",
    colonial: "lived in colonies", fossorial: "dug burrows", amphibious: "lived both in water and on land",
    "low-level epifaunal": "lived on the seabed", "upper-level epifaunal": "stood tall above the seabed to feed",
    "intermediate-level epifaunal": "stood a little above the seabed", "deep infaunal": "burrowed deep into the seabed",
    "shallow infaunal": "burrowed just under the seabed", nektobenthic: "swam close to the seabed", aquatic: "lived in water",
  },
  diet: {
    carnivore: "other animals", herbivore: "plants", omnivore: "plants and animals", insectivore: "insects",
    piscivore: "fish", "suspension feeder": "food particles it filtered out of the water",
    "deposit feeder": "food sifted from mud and sediment", durophage: "hard-shelled prey, crushed",
    photoautotroph: "nothing: it made its own food from sunlight", grazer: "algae or plants it grazed",
    detritivore: "dead and decaying material", browser: "leaves", frugivore: "fruit", microcarnivore: "tiny animals",
    photosymbiotic: "food made by algae living inside it", chemosymbiotic: "food made by bacteria living on chemicals",
    parasite: "its host, as a parasite", chemoautotroph: "nothing: it made its own food from chemicals",
  },
};
const ICONS = {
  where: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  moved: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6"/></svg>',
  ate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 2-2 6 0 8v10"/></svg>',
};
const HINTS = {
  world: "Click a dot to zoom in, or pick a place in the panel",
  region: "Click an animal to see it in the panel",
  species: "The shaded area is where it probably lived · Esc goes back",
};

const panelEl = document.getElementById("panel");
let genusInfo = {}, lifeInfo = {}, lifeImages = {};
const silhouettes = new Map();   // genus -> PhyloPic outline (or null), looked up from the Worker
let fromPanel = false;            // move keyboard focus to the new heading when the panel itself was used

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtMa = (v) => (v >= 10 ? Math.round(v) : v.toFixed(1));
const num = (n) => n.toLocaleString();
const plural = (n, one, many = one + "s") => `${num(n)} ${n === 1 ? one : many}`;

function loadInfo() {
  const get = (url) => d3.json(`${url}?v=${BUILD}`).catch(() => ({}));
  return Promise.all([get(`data/genus-info-${slice.time}.json`), get(`data/life-${slice.time}.json`), get(`data/life-images-${slice.time}.json`)])
    .then(([g, l, im]) => { genusInfo = g; lifeInfo = l; lifeImages = im; if (slice) renderPanel(); });
}

// An outline of the animal (or its closest relative) from PhyloPic, for cards with no picture of it alive.
function silhouetteFor(genus) {
  if (silhouettes.has(genus.name)) return silhouettes.get(genus.name);
  silhouettes.set(genus.name, null);
  const chain = [genus.name, ...(genus.taxonomy || []).slice(1).reverse()];   // genus, family, order... not phylum
  fetch(`/api/silhouette?names=${encodeURIComponent(chain.join(","))}`).then((r) => r.json()).then((s) => {
    if (!s) return;
    silhouettes.set(genus.name, { path: s.svg, relative: s.own ? null : genus.taxonomy.find((t) => t.toLowerCase() === s.matched) || s.matched,
      of: s.of, artist: s.artist, license: s.license, file: s.page });
    renderPanel();
  }).catch(() => {});
  return null;
}

// A bar of who lived here, by group, coloured by family.
function shareBar(counts) {
  const total = d3.sum(counts, ([, n]) => n);
  return `<div class="share" role="img" aria-label="Share of fossil records by group">${counts.map(([g, n]) =>
    `<span style="flex:${n / total};background:${groupColor(g)}" title="${esc(GROUPS[g].label)}: ${Math.round(100 * n / total)}%"></span>`).join("")}</div>`;
}

function choice({ icon, name, sub = "", n = "", attrs = "" }) {
  return `<li><button class="choice" ${attrs}>${icon}<span class="name">${name}${sub ? `<span class="sub">${sub}</span>` : ""}</span><span class="n">${n}</span></button></li>`;
}

// ---------- The four panels ----------

function worldPanel() {
  const counts = d3.rollups(slice.siteList.flatMap((s) => s.occ), (v) => d3.sum(v, (o) => o[2]), ([g]) => slice.groups[slice.genera[g].group])
    .sort((a, c) => c[1] - a[1]);
  const total = d3.sum(counts, ([, n]) => n);
  const rows = counts.map(([g, n]) => choice({
    icon: iconHTML(g), name: esc(GROUPS[g].label), n: n / total < 0.005 ? "<1%" : `${Math.round(100 * n / total)}%`,
    sub: worldFilter === g ? esc(GROUPS[g].blurb) : "",
    attrs: `data-filter="${g}" aria-pressed="${worldFilter === g}"`,
  })).join("");
  const top = [...binsAt(2).values()].sort((a, c) => c.total - a.total).slice(0, 6);
  const regions = top.map((b) => choice({
    icon: iconHTML(b.top), name: esc(regionName(b.sites)), sub: `mostly ${esc(GROUPS[b.top].label.toLowerCase())}`,
    n: num(b.total), attrs: `data-region="${b.id}"`,
  })).join("");
  return `
    <p class="kicker">The world</p>
    <h2 tabindex="-1">${esc(slice.label)}</h2>
    <p class="lede">${esc(slice.blurb)}</p>
    <p class="stats">${num(total)} fossil records · ${num(slice.genera.length)} kinds of life · ${num(slice.siteList.length)} dig sites</p>
    <h3>What lived, by share of fossils found</h3>
    ${shareBar(counts)}
    <ul class="choices">${rows}</ul>
    <p class="small">Pick a group to see where it was found.</p>
    <h3>Richest fossil regions</h3>
    <ul class="choices">${regions}</ul>
    ${toursList()}`;
}

function regionPanel() {
  const r = nav.region;
  const name = regionName(r.sites);
  const formations = [...new Set(r.sites.flatMap((s) => s.occ.map(([, f]) => slice.formations[f]).filter(Boolean)))];
  // Every kind found here, by group, most-found first; each opens its card.
  const byGroup = d3.group([...r.genera].sort((a, c) => c[1] - a[1]), ([g]) => slice.groups[slice.genera[g].group]);
  const groups = r.groups.map((d) => `<li><details${r.groups.length <= 3 ? " open" : ""}><summary>${iconHTML(d.group)}<span>${esc(GROUPS[d.group].label)}</span><span class="n">${plural(d.kinds, "kind")}</span></summary>
    <ul class="kinds">${(byGroup.get(d.group) || []).map(([g]) => `<li><button data-genus="${g}"><i>${esc(shortName(slice.genera[g].name))}</i><span>${genusLine(g)}</span></button></li>`).join("")}</ul></details></li>`).join("");
  const examples = (r.examples || []).map((e) => choice({
    icon: iconHTML(slice.groups[slice.genera[e.g].group]), name: `<i>${esc(shortName(slice.genera[e.g].name))}</i>`, sub: genusLine(e.g),
    attrs: `data-example="${e.g}"`,
  })).join("");
  return `
    <button class="back" data-world>← The whole world</button>
    <p class="kicker">Region · today ${esc(name)}</p>
    <h2 tabindex="-1">${esc(name)}, ${esc(slice.label)}</h2>
    <p class="stats">${plural(r.total, "fossil record")} · ${plural(r.genera.size, "kind")} of life · ${plural(r.sites.length, "dig site")}</p>
    <h3>Examples of what lived here</h3>
    <ul class="choices">${examples}</ul>
    ${examples ? `<p class="small">A few of the ${plural(r.genera.size, "kind")} found here, chosen because each has a photo and a good description. Click one, here or on the map, to see it.</p>`
      : `<p class="small">None of the ${plural(r.genera.size, "kind")} found here has a photo and a full description yet.</p>`}
    <h3>Everything that lived here</h3>
    ${shareBar(r.groups.map((d) => [d.group, d.n]))}
    <ul class="groups">${groups}</ul>
    ${formations.length ? `<p class="small">Found in the rock layers ${esc(formations.slice(0, 4).join(", "))}${formations.length > 4 ? ` and ${formations.length - 4} more` : ""}.</p>` : ""}`;
}

// "A plant-eating ornithischian dinosaur": from PBDB diet and class.
function genusLine(g) {
  const genus = slice.genera[g];
  const group = slice.groups[genus.group];
  let noun = CLASS_NOUNS[genus.taxonomy[1]] || GROUP_NOUNS[group];
  if (group === "dinosaurs" && !/dinosaur/.test(noun)) noun = "dinosaur";   // PBDB sometimes files them only as "Reptilia"
  const diet = lifeInfo[genus.name]?.eco?.diet?.split(/,\s*/)[0];
  const adj = DIET_ADJ[diet];
  const phrase = adj ? `${adj} ${noun}` : noun;
  return `${/^[aeiou]/i.test(phrase) ? "An" : "A"} ${esc(phrase)}`;
}

function plainEco(field, value) {
  const words = value.split(/,\s*/).map((v) => ECO_WORDS[field][v.trim()] || v.trim());
  return [...new Set(words)].join("; ");
}

// The card that pops up on the map for one example fossil: picture, a line on what it was, how it
// lived in a few words, and a short description.
function cardHTML(g) {
  const genus = slice.genera[g];
  const group = slice.groups[genus.group];
  const info = genusInfo[genus.name];
  const life = lifeInfo[genus.name] || {};
  const eco = life.eco || {};
  const im = info?.image;
  const sentences = (t, n) => (t.match(/[^.!?]+[.!?]+(\s|$)/g) || [t]).slice(0, n).join("").trim();
  // What it was (Wikipedia's opening), then how it lived (its diet or behaviour section, if any).
  const intro = info?.text ? sentences(info.text, 3) : "";
  const habit = aboutTheAnimal(life.sections, genus.name).find(([h]) => /diet|feed|behavio|locomot|movement|biology|ecology/i.test(h));
  const ways = [
    eco.environment && `Lived in ${plainEco("environment", eco.environment)}`,
    eco.life_habit && plainEco("life_habit", eco.life_habit).replace(/^./, (c) => c.toUpperCase()),
    eco.diet && `Ate ${plainEco("diet", eco.diet)}`,
  ].filter(Boolean);
  const lived = !genus.range ? "" : genus.range[1] <= 0.012
    ? `${fmtMa(genus.range[0])} million years ago to today`
    : `${fmtMa(genus.range[0])}–${fmtMa(genus.range[1])} million years ago`;
  return `
    ${im ? `<img src="${esc(im.path)}" alt="${esc(im.caption || genus.name)}">`
      : `<div class="no-photo">${iconHTML(group)}<span>No photo on file</span></div>`}
    <h4><i>${esc(shortName(genus.name))}</i></h4>
    <p class="what">${genusLine(g)}${lived ? `, ${lived}` : ""}.</p>
    ${intro ? `<p class="desc">${esc(intro)}</p>` : ""}
    ${ways.length ? `<p class="facts">${esc(ways.join(". "))}.</p>` : ""}
    ${habit ? `<p class="habit"><b>${esc(habit[0])}.</b> ${esc(sentences(habit[1], 2))}</p>` : ""}
    <p class="range-note"></p>
    <p class="credit">${[info ? `Text: <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(info.title.replace(/ /g, "_"))}" target="_blank" rel="noopener">Wikipedia</a>` : "",
      im ? `Photo: ${esc([im.artist, im.license].filter(Boolean).join(", "))}` : ""].filter(Boolean).join(" · ")}</p>`;
}

// ---------- Rendering ----------

// One animal, big, in the panel: a restoration of it alive (or, failing that, its fossil), what it
// was, how it lived, the longer description, and where it probably lived (shaded on the map).
// What the picture shows, judged from where it came from and its file name and caption.
const KIND_TAG = { "life restoration": "As it may have looked", "fossil": "Fossil", "living organism photo": "Living today" };
// Keep only what is about the animal itself. Sections on the rock formation's environment and its other
// animals ("Paleoecology", "Paleoenvironment") go, and so do sentences about the history of research
// ("Marsh considered…", "In 1891…") or the formation rather than the animal.
const OFF_TOPIC_SECTION = /pal(a)?eo-?(ecology|environment)|environment|distribution|stratigraph|discovery|history|classification|taxonomy|phylogen|naming|etymology/i;
const ON_TOPIC_SECTION = /diet|feed|food|predat|prey|behavio|social|locomot|movement|posture|reproduc|growth|biology|lifestyle|habit/i;
const OFF_TOPIC_SENTENCE = new RegExp([
  "\\b(1[6-9]\\d\\d|20[0-2]\\d)s?\\b",                    // dated research history
  "\\bformation\\b", "\\bstrata\\b", "\\bwas named\\b", "\\bdescribed by\\b",
  "[Ss]oon after (its|their) discovery", "has been speculated", "\\b(proposed|opposed|suggested|argued|questioned) by\\b", "popular (dinosaur )?literature", "semitechnical",
  "\\bet al\\b", "and colleagues", "\\b[A-Z][a-z]+ (?:[A-Z]\\. )+[A-Z][a-z]+\\b",   // named researchers
].join("|"));
// Split into sentences, but not after initials or "i.e.", "e.g.", "etc.", "sp.", "cf.".
function sentences(text) {
  const out = [];
  let start = 0;
  const re = /[.!?]["”)]?\s+(?=["“(]?[A-Z0-9])/g;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 6), m.index + 1);
    if (/(\b[A-Za-z]\.|\bi\.e\.|\be\.g\.|\betc\.|\bsp\.|\bcf\.|\bvs\.)$/.test(before)) continue;
    out.push(text.slice(start, m.index + 1).trim());
    start = m.index + m[0].length;
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}
function aboutTheAnimal(sections, genusName = "") {
  const name = genusName.split(" (")[0];
  const out = [];
  for (const [title, body] of sections || []) {
    const parts = sentences(body);
    // A section on the environment stays only if it opens by talking about the animal itself.
    if (OFF_TOPIC_SECTION.test(title) && !ON_TOPIC_SECTION.test(title) && !(name && parts[0]?.includes(name))) continue;
    const kept = parts.filter((t) => !OFF_TOPIC_SENTENCE.test(t)).join(" ");
    if (kept.length >= 120) out.push([title, kept]);
  }
  return out;
}

// The card's short account: a couple of sentences each on what it was, how it looked, what it ate and how
// it lived. Older data files name sections by their Wikipedia heading, so headings are sorted into the same three.
const BRIEF = [["Appearance", /appearance|^description$|anatomy|morpholog|size|features|skeleton|skull/i],
  ["Feeding", /feeding|diet|food|predat|hunting|prey/i],
  ["How it lived", /how it lived|behavio|social|herd|nest|reproduc|growth|locomot|movement|posture|swimming|flight|biology|life ?style|habit|ecology/i]];
// Naming and classification talk is for specialists: drop it from the short account.
const TAXONOMY_SENTENCE = /species (have been|are|were) (assigned|classified|recognized|recognised|named)|wastebasket|polyphyletic|paraphyletic|monophyletic|\btaxon\b|synonym|type species|\bvalid\b|universally recognized|genus contains|species are (currently )?known|subgenus/i;
const stripEtymology = (t) => t.replace(/\s*\((?:[^()]*\b(?:lit\.|(?:literally|from (?:Ancient )?(?:Greek|Latin)|Greek|Latin|meaning|pronounced)\b)[^()]*)\)/gi, "")
  .replace(/\s*\(\s*\)/g, "").replace(/\s+([,.])/g, "$1");
const firstSentences = (text, n = 2) => sentences(stripEtymology(text))
  .filter((t) => !OFF_TOPIC_SENTENCE.test(t) && !TAXONOMY_SENTENCE.test(t)).slice(0, n).join(" ");
function brief(info, life, genusName, group) {
  const parts = [];
  // Plants don't feed or behave: a physical description is all they need.
  for (const [label, re] of (group === "plants" || group === "algae") ? BRIEF.filter(([l]) => l === "Appearance") : BRIEF) {
    const sec = aboutTheAnimal(life.sections, genusName).find(([h]) => re.test(h) && !parts.some((p) => p[2] === h));
    if (sec) parts.push([label, firstSentences(sec[1]), sec[0]]);
  }
  return { intro: info?.text ? firstSentences(info.text) : "", parts: parts.filter(([, t]) => t.length > 40) };
}

function pictureKind(alive, pic) {
  const checked = agent.images?.[pic.path];
  if (checked) return KIND_TAG[checked.kind] || "Picture";
  if (alive) return "As it may have looked";
  const text = `${pic.file} ${pic.caption}`;
  if (/restor|reconstr|life|illustrat|drawing|paleoart|palaeoart|artist|model/i.test(text)) return "As it may have looked";
  if (/fossil|skelet|skull|specimen|holotype|bone|tooth|teeth|cast|mount|shell|imprint/i.test(text)) return "Fossil";
  return "Picture";
}

function speciesPanel() {
  const it = nav.species, g = it.g, genus = slice.genera[g];
  const group = slice.groups[genus.group];
  const info = genusInfo[genus.name];
  const life = lifeInfo[genus.name] || {};
  const eco = life.eco || {};
  const okPic = (p) => p && agent.images?.[p.path]?.matches !== false;    // drop pictures the check found wrong
  const alive = okPic(lifeImages[genus.name]) ? lifeImages[genus.name] : null;
  // The main picture must show it alive. The article's own picture qualifies only if the image check (or,
  // until it has run, the file's name and caption) says it is a restoration; a fossil photo moves lower down.
  const wikiPic = okPic(info?.image) ? info.image : null;
  const wikiAlive = wikiPic && pictureKind(false, wikiPic) === "As it may have looked";
  const pic = alive || wikiPic;   // no picture of it alive: its fossil takes the main spot
  const fossilPic = !wikiAlive && wikiPic && wikiPic !== pic ? wikiPic : null;
  const written = !info?.text && agent.descriptions?.[genus.name]?.text;
  const lived = !genus.range ? "" : genus.range[1] <= 0.012
    ? `${fmtMa(genus.range[0])} million years ago to today`
    : `${fmtMa(genus.range[0])}–${fmtMa(genus.range[1])} million years ago`;
  const facts = [
    eco.environment && ["Lived in", plainEco("environment", eco.environment)],
    eco.life_habit && ["Way of life", plainEco("life_habit", eco.life_habit)],
    group !== "plants" && group !== "algae" && eco.motility && ["Moved", plainEco("motility", eco.motility)],
    group !== "plants" && group !== "algae" && eco.diet && ["Ate", plainEco("diet", eco.diet)],
  ].filter(Boolean);
  const credit = pic ? [pic.artist, pic.license].filter(Boolean).join(", ") : "";
  const sil = !pic && silhouetteFor(genus);
  return `
    ${pic ? `<figure class="life-pic"><img src="${esc(pic.path)}" alt="${esc(alive ? `Restoration of ${genus.name}` : pic.caption || genus.name)}">
      <figcaption><span class="tag">${pictureKind(alive, pic)}</span>${credit ? esc(credit) + " · " : ""}<a href="${esc(pic.file)}" target="_blank" rel="noopener">source</a></figcaption></figure>`
      : sil ? `<figure class="life-pic sil-pic"><img src="${esc(sil.path)}" alt="Silhouette of ${esc(sil.relative ? `a relative of ${genus.name} (${sil.of})` : genus.name)}">
      <figcaption><span class="tag">${sil.relative ? `Outline of a relative · ${esc(sil.relative)}` : "Outline"}</span>${esc([sil.artist, sil.license].filter(Boolean).join(", "))} · <a href="${esc(sil.file)}" target="_blank" rel="noopener">PhyloPic</a></figcaption></figure>`
      : `<div class="photo silhouette">${iconHTML(group, "lg")}<p>${fossilPic ? "No picture of it alive yet. Its fossil is below." : "No picture on file."}</p></div>`}
    <button class="back-btn" data-back>← ${nav.region ? `Back to the fossils of ${esc(regionName(nav.region.sites))}` : "Back to the whole world"}</button>
    <p class="kicker">${iconHTML(group)} ${esc(GROUPS[group].label)}</p>
    <h2 tabindex="-1"><i>${esc(shortName(genus.name))}</i></h2>
    <p class="lede">${genusLine(g)}${lived ? `, ${lived}` : ""}.</p>
    ${facts.length ? `<ul class="facts-list">${facts.map(([k, v]) => `<li><b>${k}</b>${esc(v[0].toUpperCase() + v.slice(1))}</li>`).join("")}</ul>` : ""}
    ${tourBox()}
    ${fossilPic ? `<figure class="fossil-pic"><img src="${esc(fossilPic.path)}" alt="${esc(fossilPic.caption || `Fossil of ${genus.name}`)}" loading="lazy">
      <figcaption><span class="tag">${pictureKind(false, fossilPic)}</span>${esc([fossilPic.artist, fossilPic.license].filter(Boolean).join(", "))} · <a href="${esc(fossilPic.file)}" target="_blank" rel="noopener">source</a></figcaption></figure>` : ""}
    ${(() => { const b = brief(info, life, genus.name, group);
      return (b.intro ? `<p>${esc(b.intro)}</p>` : "") + b.parts.map(([label, t]) => `<p class="brief"><b>${label}.</b> ${esc(t)}</p>`).join(""); })()}
    ${written ? `<p>${esc(written)}</p><p class="small">Written by an AI model (Gemma) from this genus's records in the Paleobiology Database, as there is no encyclopedia article yet. Checked automatically, not by a person.</p>` : ""}
    <p class="range-note">${typeof rangeNote === "function" ? rangeNote() : ""}</p>
    <p class="small">${info ? `Text: <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(info.title.replace(/ /g, "_"))}" target="_blank" rel="noopener">Wikipedia</a> (CC BY-SA 4.0). ` : ""}${facts.length ? `Ecology: <a href="https://paleobiodb.org/classic/checkTaxonInfo?taxon_no=${genus.tid}" target="_blank" rel="noopener">PBDB</a>.` : ""}</p>`;
}

function renderPanel() {
  if (!slice) return;
  const html = { world: worldPanel, region: regionPanel, species: speciesPanel }[nav.level]();
  // An animal opens in its own card floating over the map; the side card keeps only the time slider.
  const pop = document.getElementById("species-pop"), popBody = document.getElementById("pop-body");
  if (nav.level === "species") {
    panelEl.innerHTML = "";
    popBody.innerHTML = html;
    popBody.scrollTop = 0;
    document.getElementById("pop-title").textContent = shortName(slice.genera[nav.species.g].name);
    pop.hidden = false;
    pop.style.setProperty("--range-color", groupColor(slice.groups[slice.genera[nav.species.g].group]));
    // Just under the time slider's card.
    const head = document.getElementById("panel-card").getBoundingClientRect(), stage = pop.parentElement.getBoundingClientRect();
    pop.style.setProperty("--pop-top", `${Math.round(head.bottom - stage.top + 10)}px`);
    setPopMin(false);
    bindPanel(popBody);
  } else {
    pop.hidden = true;
    panelEl.innerHTML = html;
    panelEl.scrollTop = 0;
    bindPanel();
  }
  renderGroupsCard();
  const worldBack = document.getElementById("world-back");
  worldBack.hidden = nav.level === "world";
  worldBack.onclick = () => goWorld();
  renderCrumbs();
  // The corner arrow: one step back, from an animal to its place or from a place to the world.
  const corner = document.getElementById("corner-back");
  corner.hidden = nav.level === "world";
  corner.title = nav.level === "species" && nav.region ? `Back to the fossils of ${regionName(nav.region.sites)}` : "Back to the whole world";
  corner.onclick = () => { fromPanel = true; back(); };
  d3.select("#hint").text(HINTS[nav.level]);
  if (fromPanel) { (nav.level === "species" ? document.getElementById("pop-body") : panelEl).querySelector("h2")?.focus(); fromPanel = false; }
}

// Fold the animal's card down to its title bar, or open it again.
function setPopMin(min) {
  const pop = document.getElementById("species-pop"), btn = document.getElementById("pop-min");
  pop.classList.toggle("min", min);
  btn.setAttribute("aria-expanded", String(!min));
  btn.setAttribute("aria-label", min ? "Expand" : "Minimise");
  btn.textContent = min ? "+" : "–";
}
document.getElementById("pop-min").addEventListener("click", () => setPopMin(!document.getElementById("species-pop").classList.contains("min")));
document.getElementById("pop-back").addEventListener("click", () => { fromPanel = true; back(); });
document.getElementById("pop-close").addEventListener("click", () => back());

function bindPanel(root = panelEl) {
  const on = (sel, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener("click", () => { fromPanel = true; fn(el); }));
  on("[data-filter]", (el) => { worldFilter = worldFilter === el.dataset.filter ? null : el.dataset.filter; renderAll(); fromPanel = false; });
  on("[data-region]", (el) => goRegion(binsAt(2).get(el.dataset.region)));
  on("[data-example]", (el) => openCard(nav.region.examples.find((e) => e.g === +el.dataset.example)));
  on("[data-genus]", (el) => openGenusHere(+el.dataset.genus));
  on("[data-back]", () => backToPlace());
  on("[data-world]", () => goWorld());
  on("[data-tour]", (el) => goTourStep(el.dataset.tour, 0));
  on("[data-tour-go]", (el) => goTourStep(params.get("tour"), +el.dataset.tourGo));
  on("[data-tour-end]", () => goTime(slice.time));
}

function renderCrumbs() {
  const parts = [["world", slice.label]];
  if (nav.region) parts.push(["region", regionName(nav.region.sites)]);
  if (nav.species) parts.push(["species", shortName(slice.genera[nav.species.g].name)]);
  const el = document.getElementById("crumbs");
  if (!el) return;
  el.innerHTML = parts.map(([level, label], i) => i === parts.length - 1
    ? `<span aria-current="page">${esc(label)}</span>`
    : `<button data-level="${level}">${esc(label)}</button><span class="sep" aria-hidden="true">›</span>`).join("");
  el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    fromPanel = true;
    const level = b.dataset.level;
    if (level === "world") goWorld();
    else if (level === "region") backToPlace();
  }));
}

// ---------- Guided tours ----------

function toursList() {
  const tours = Object.entries(agent.tours || {});
  if (!tours.length) return "";
  return `<h3>Guided tours</h3><ul class="choices">${tours.map(([key, t]) => choice({
    icon: "", name: esc(t.title), sub: esc(t.intro), n: `${t.steps.length} stops`, attrs: `data-tour="${esc(key)}"`,
  })).join("")}</ul>`;
}

function tourBox() {
  const t = typeof tourStep === "function" ? tourStep() : null;
  if (!t) return "";
  const last = t.step >= t.tour.steps.length - 1;
  return `<div class="tour-box" role="region" aria-label="Guided tour">
    <p class="kicker">Tour · ${esc(t.tour.title)} · stop ${t.step + 1} of ${t.tour.steps.length}</p>
    <p>${esc(t.s.text)}</p>
    <div class="tour-nav">
      ${t.step > 0 ? `<button data-tour-go="${t.step - 1}">← Previous</button>` : ""}
      ${last ? "" : `<button data-tour-go="${t.step + 1}">Next stop →</button>`}
      <button data-tour-end>End tour</button>
    </div></div>`;
}

function goTourStep(key, step) {
  const s = agent.tours[key].steps[step];
  goTime(s.time, { tour: key, step });
}

// ---------- Search ----------

function bindSearch() {
  if (!document.getElementById("search")) return;    // the header is just the logo now
  const names = slice.genera.map((g, i) => [g.name, i]).sort((a, c) => a[0].localeCompare(c[0]));
  document.getElementById("genus-names").innerHTML = names.map(([n]) => `<option value="${esc(n)}">`).join("");
  const index = new Map(names.map(([n, i]) => [n.toLowerCase(), i]));
  const input = document.getElementById("search");
  const go = () => {
    const g = index.get(input.value.trim().toLowerCase());
    if (g == null) return;
    input.value = "";
    input.blur();
    fromPanel = true;
    goToGenus(g);
  };
  input.addEventListener("change", go);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

// map.js loads the slice; wait for it, then fill in the panel and search.
(function waitForSlice() {
  if (!slice || !map) { setTimeout(waitForSlice, 50); return; }
  bindSearch();
  loadInfo();
})();


// The world view's list of what lived: click a group to see where it lived across the Earth.
function renderGroupsCard() {
  const card = document.getElementById("groups-card");
  if (!card) return;
  card.hidden = nav.level !== "world";
  if (card.hidden) return;
  if (typeof rightStack === "function") rightStack();
  const open = card.dataset.open === "1";
  const kinds = d3.rollups(slice.genera, (v) => v.length, (x) => slice.groups[x.group]).filter(([g]) => GROUPS[g]).sort((a, c) => c[1] - a[1]);
  card.innerHTML = `<button type="button" class="strip" aria-expanded="${open}">What lived <span>${kinds.length} groups${worldFilter ? ` · showing ${esc(GROUPS[worldFilter].label)}` : ""}</span><i>${open ? "▾" : "▸"}</i></button><ul${open ? "" : " hidden"}>${kinds.map(([g, n]) => `<li><button type="button" class="zone-group" style="--c:${groupColor(g)}" data-group="${g}" aria-pressed="${worldFilter === g}" aria-label="${esc(GROUPS[g].label)}: ${n}" title="${esc(GROUPS[g].label)} · ${n}">${iconHTML(g)}<span>${esc(GROUPS[g].label.replace(/ & .*|,.*/, ""))}</span><span class="n">${n}</span></button></li>`).join("")}</ul>`;
  card.querySelector(".strip").addEventListener("click", () => { card.dataset.open = open ? "0" : "1"; renderGroupsCard(); });
  card.querySelectorAll("[data-group]").forEach((b) => b.addEventListener("click", () => {
    worldFilter = worldFilter === b.dataset.group ? null : b.dataset.group;
    renderAll(); showGroupRange();
  }));
}
