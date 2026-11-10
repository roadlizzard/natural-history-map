// Natural History Map: serves the static site, and on a cron works through the agent job queue in D1
// with Workers AI. Every answer goes through a plain-code validator before it is saved; a failed check
// is fed back to the model on the next try (up to MAX_TRIES). The page itself never calls this.

const MAX_TRIES = 3;
const KINDS = {};

// ---------- shared ----------
const norm = (s) => String(s || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s+/g, " ").trim();

function b64(buf) {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function ask(env, messages, schema, maxTokens = 600, think = false) {
  const out = await env.AI.run(env.MODEL, {
    messages, max_completion_tokens: maxTokens, temperature: 0.2,
    chat_template_kwargs: { enable_thinking: think },     // plain checks don't need reasoning; it saves the allowance
    response_format: { type: "json_schema", json_schema: { name: "answer", schema, strict: true } },
  });
  const raw = out?.choices?.[0]?.message?.content ?? out?.response ?? out;
  if (typeof raw !== "string") return { result: raw, usage: out?.usage };
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return { result: JSON.parse(m ? m[0] : raw), usage: out?.usage };
  } catch {
    throw new Error(`answer was not complete JSON (${out?.choices?.[0]?.finish_reason || "?"}): ${raw.slice(0, 160)}`);
  }
}

const retryNote = (job) => job.error
  ? [{ role: "user", content: `Your last answer was rejected by the checker: ${job.error}. Fix that and answer again.` }]
  : [];

// ---------- 1. image check ----------
KINDS.image = {
  schema: {
    type: "object", additionalProperties: false, required: ["kind", "matches", "note"],
    properties: {
      kind: { type: "string", enum: ["life restoration", "fossil", "living organism photo", "diagram or map", "other"] },
      matches: { type: "boolean" },
      note: { type: "string" },
    },
  },
  async run(env, job, input, origin) {
    const res = await env.ASSETS.fetch(new Request(new URL(input.path, origin)));
    if (!res.ok) throw new Error(`image ${input.path} not found (${res.status})`);
    const type = input.path.endsWith(".png") ? "image/png" : "image/jpeg";
    const url = `data:${type};base64,${b64(await res.arrayBuffer())}`;
    return ask(env, [
      { role: "system", content: "You check pictures for a public natural-history map. Answer only with the JSON asked for." },
      { role: "user", content: [
        { type: "image_url", image_url: { url } },
        { type: "text", text:
          `This picture is meant to show the genus ${input.genus} (${input.group}; ${input.taxonomy}).` +
          ` Its file caption says: "${input.caption}".\n` +
          `kind: is it an artist's life restoration (the living animal or plant drawn, painted or modelled), ` +
          `a photo of a fossil, a photo of a living organism today, a diagram or map, or other?\n` +
          `matches: could it plausibly show this kind of organism (${input.group})? false if it shows something else ` +
          `entirely (a person, a building, a different kind of life).\nnote: one short sentence on what you see.` },
      ] },
      ...retryNote(job),
    ], this.schema, 200);
  },
  check(r) {
    if (!this.schema.properties.kind.enum.includes(r.kind)) return "kind must be one of the listed values";
    if (typeof r.matches !== "boolean") return "matches must be true or false";
    return null;
  },
};

// ---------- 2. habitat with a quoted reason ----------
KINDS.habitat = {
  schema: {
    type: "object", additionalProperties: false, required: ["habitats", "quote"],
    properties: {
      habitats: { type: "array", items: { type: "string", enum: ["sea", "coast", "freshwater", "land", "unknown"] } },
      quote: { type: "string" },
    },
  },
  run(env, job, input) {
    return ask(env, [
      { role: "system", content: "You read encyclopedia text about fossil organisms and say where they lived. Answer only with the JSON asked for." },
      { role: "user", content:
        `Genus: ${input.genus} (${input.group}).\nText:\n"""${input.text}"""\n\n` +
        `habitats: where did it live? Any of sea (open sea or shallow seas), coast (shore, lagoon, estuary, ` +
        `brackish), freshwater (rivers, lakes, swamps), land. Use "unknown" alone if the text does not say.\n` +
        `quote: copy, word for word, the shortest phrase from the text that shows it (empty if unknown).` },
      ...retryNote(job),
    ], this.schema, 200);
  },
  check(r, input) {
    const h = r.habitats || [];
    if (!h.length) return "habitats is empty";
    if (h.includes("unknown")) return h.length === 1 ? null : '"unknown" must be alone';
    if (norm(r.quote).length < 6) return "quote is missing";
    if (!norm(input.text).includes(norm(r.quote).replace(/^"|"$/g, ""))) return `the quote "${r.quote}" is not in the text word for word`;
    return null;
  },
};

// ---------- 3. a short description from PBDB facts, for genera with no article ----------
KINDS.describe = {
  schema: {
    type: "object", additionalProperties: false, required: ["text"],
    properties: { text: { type: "string" } },
  },
  run(env, job, input) {
    return ask(env, [
      { role: "system", content: "You write plain, accurate museum-label text for the public. You never add facts that are not in the notes." },
      { role: "user", content:
        `Write 2 to 4 short sentences about the fossil genus ${input.genus} for a general reader, using ONLY these notes.` +
        ` Explain what kind of organism it was in everyday words, when it lived and how it lived if the notes say.` +
        ` Do not invent sizes, dates, places or behaviour. Every number you use must appear in the notes.\n\nNotes:\n${input.facts}` },
      ...retryNote(job),
    ], this.schema, 350);
  },
  check(r, input) {
    const t = r.text || "";
    if (t.length < 120 || t.length > 900) return `text is ${t.length} characters; it must be 120 to 900`;
    if (!t.includes(input.genus)) return `text must name ${input.genus}`;
    const nums = t.match(/\d+(?:[.,]\d+)?/g) || [];
    const bad = nums.filter((n) => !input.facts.includes(n.replace(",", "")) && !input.facts.includes(n));
    if (bad.length) return `these numbers are not in the notes: ${bad.join(", ")}`;
    // Names too: every capitalised word that does not start a sentence (a place, a period, a relative's
    // name, a rock formation) must come from the notes, so it cannot invent where or when it lived.
    const facts = input.facts.toLowerCase();
    const names = [...t.matchAll(/(?<![.!?:]\s|^)\b([A-Z][a-zA-Z-]{2,})/g)].map((m) => m[1])
      .filter((w) => w !== input.genus && !facts.includes(w.toLowerCase()));
    if (names.length) return `these names are not in the notes: ${[...new Set(names)].join(", ")}`;
    return null;
  },
};

// ---------- 4. per-period blurb and ancient place names ----------
KINDS.slice = {
  schema: {
    type: "object", additionalProperties: false, required: ["blurb", "labels"],
    properties: {
      blurb: { type: "string" },
      labels: { type: "array", items: {
        type: "object", additionalProperties: false, required: ["name", "kind", "lng", "lat"],
        properties: { name: { type: "string" }, kind: { type: "string", enum: ["super", "land", "sea"] },
                      lng: { type: "number" }, lat: { type: "number" } } } },
    },
  },
  run(env, job, input) {
    return ask(env, [
      { role: "system", content: "You are a palaeogeographer labelling a map of the ancient Earth for the public. Answer only with the JSON asked for." },
      { role: "user", content:
        `The map shows Earth ${input.time} million years ago (${input.label}).\n` +
        `Land and sea on a 5° grid (rows from 90°N down to 90°S, columns from 180°W eastward; # land, . sea):\n${input.grid}\n\n` +
        `Where today's landmasses sat then (from the plate model): ${input.anchors}\n` +
        `Most common fossils in this slice: ${input.life}\n\n` +
        `blurb: one sentence (under 200 characters) a visitor reads first: how the world looked and what lived in it.\n` +
        `labels: 6 to 12 names used by geologists for this time: supercontinents or continents (kind super or land) ` +
        `and oceans or seas (kind sea), each with lng/lat of a point on land for land names and in open sea for sea names.` },
      ...retryNote(job),
    ], this.schema, 4000, true);
  },
  check(r, input) {
    if (!r.blurb || r.blurb.length > 220) return "blurb must be one sentence under 200 characters";
    const labels = r.labels || [];
    if (labels.length < 4) return "give at least 4 labels";
    const wrong = [];
    for (const l of labels) {
      const col = ((Math.round(l.lng + 180) % 360) + 360) % 360, row = Math.max(0, Math.min(179, Math.round(90 - l.lat)));
      const cell = input.mask[row * 360 + col];   // # land, ~ shallow shelf, . deep sea
      const ok = l.kind === "sea" ? cell !== "#" : cell !== ".";
      if (!ok) wrong.push(`${l.name} (${l.kind}) at ${l.lng},${l.lat} is on ${cell === "#" ? "land" : "deep sea"}`);
    }
    return wrong.length ? `move these: ${wrong.join("; ")}` : null;
  },
};

// ---------- 5. guided tour ----------
KINDS.tour = {
  schema: {
    type: "object", additionalProperties: false, required: ["title", "intro", "steps"],
    properties: {
      title: { type: "string" }, intro: { type: "string" },
      steps: { type: "array", items: {
        type: "object", additionalProperties: false, required: ["time", "genus", "text"],
        properties: { time: { type: "number" }, genus: { type: "string" }, text: { type: "string" } } } },
    },
  },
  run(env, job, input) {
    return ask(env, [
      { role: "system", content: "You write short guided tours of a fossil map for curious members of the public. Plain words, no jargon. Answer only with the JSON asked for." },
      { role: "user", content:
        `Tour theme: ${input.theme}\nWrite 5 to 7 steps. Each step shows one fossil genus at one time slice and ` +
        `says in 1 or 2 sentences why it matters for the theme. Only use genera from this list (time in Ma: genera):\n` +
        `${input.choices}\n\nFacts you may use:\n${input.facts}` },
      ...retryNote(job),
    ], this.schema, 4000, true);
  },
  check(r, input) {
    const steps = r.steps || [];
    if (steps.length < 4 || steps.length > 8) return "write 5 to 7 steps";
    const bad = steps.filter((s) => !(input.allowed[String(s.time)] || []).includes(s.genus));
    return bad.length ? `not in the list for that time: ${bad.map((s) => `${s.genus} at ${s.time}`).join(", ")}` : null;
  },
};

// ---------- the queue ----------
const today = () => new Date().toISOString().slice(0, 10);
const outOfAllowance = (e) => /4006|daily free allocation|neurons|exceeded/i.test(String(e?.message || e));

async function work(env, origin, limit, kind = null) {
  if (await env.DB.prepare("SELECT 1 FROM spent WHERE day = ?").bind(today()).first()) return { stopped: "allowance used today" };
  const { results } = await env.DB.prepare(
    `SELECT * FROM jobs WHERE status = 'pending' ${kind ? "AND kind = ?2" : ""} ORDER BY priority DESC, id LIMIT ?1`)
    .bind(...(kind ? [limit, kind] : [limit])).all();
  const log = [];
  for (const job of results) {
    const kind = KINDS[job.kind], input = JSON.parse(job.input);
    let result = null, error = null;
    try {
      ({ result } = await kind.run(env, job, input, origin));
      error = kind.check(result, input);
    } catch (e) {
      if (outOfAllowance(e)) {
        await env.DB.prepare("INSERT OR IGNORE INTO spent (day) VALUES (?)").bind(today()).run();
        log.push("stopped: free allowance used for today");
        break;
      }
      error = `model error: ${String(e?.message || e).slice(0, 300)}`;
    }
    const tries = job.tries + 1;
    const status = !error ? "done" : tries >= MAX_TRIES ? "failed" : "pending";
    await env.DB.prepare("UPDATE jobs SET status = ?, result = ?, error = ?, tries = ?, updated = ? WHERE id = ?")
      .bind(status, result ? JSON.stringify(result) : null, error, tries, new Date().toISOString(), job.id).run();
    log.push(`${job.id}: ${status}${error ? " - " + error.slice(0, 120) : ""}`);
  }
  return { log };
}

// ---------- serving the agent's answers to the page ----------
// The page loads these like any other data file; they come from D1, so new answers show up without a redeploy.
const FILES = { images: "image", habitats: "habitat", descriptions: "describe", tours: "tour" };

async function done(env, kind) {
  const { results } = await env.DB.prepare("SELECT id, input, result FROM jobs WHERE status = 'done' AND kind = ?").bind(kind).all();
  // Answers saved before a check was tightened are checked again on the way out, so none slips through.
  return Object.fromEntries(results
    .filter((r) => kind !== "describe" || !KINDS.describe.check(JSON.parse(r.result), JSON.parse(r.input)))
    .map((r) => [r.id.slice(kind.length + 1), JSON.parse(r.result)]));
}

async function agentData(env, url) {
  // Ask the asset store without the browser's "has it changed?" headers, so we always get the file itself.
  const asset = () => env.ASSETS.fetch(new Request(url.origin + url.pathname));
  let m = url.pathname.match(/^\/data\/agent\/(\w+)\.json$/);
  if (m && FILES[m[1]]) return done(env, FILES[m[1]]);
  m = url.pathname.match(/^\/data\/labels-(\d+)\.json$/);
  if (m) {
    const res = await asset();                                  // hand-checked names win
    if (res.ok) return res.json();
    return (await done(env, "slice"))[m[1]]?.labels || [];
  }
  if (url.pathname === "/data/slices.json") {
    const [slices, made] = await Promise.all([asset().then((r) => r.json()), done(env, "slice")]);
    return slices.map((s) => ({ ...s, blurb: s.blurb || made[String(s.time)]?.blurb || "" }));
  }
  return null;
}

// ---------- build status: what the Mac reports, and whether it has gone quiet ----------
async function markStalled(env) {
  const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  await env.DB.prepare("UPDATE builds SET state = 'stalled', detail = 'no report for 20+ minutes: is the Mac asleep or offline? ' || COALESCE(detail, '') " +
    "WHERE state IN ('running', 'retrying') AND updated < ?").bind(cutoff).run();
}

async function statusPage(env) {
  const { results } = await env.DB.prepare("SELECT * FROM builds ORDER BY CAST(time AS INTEGER) DESC").all();
  const jobs = (await env.DB.prepare("SELECT kind, status, COUNT(*) AS n FROM jobs GROUP BY kind, status").all()).results;
  const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const colour = { live: "#3c3", running: "#69f", retrying: "#fa3", stalled: "#f80", failed: "#f44" };
  const rows = results.map((b) => `<tr><td>${esc(b.time)} Ma</td><td style="color:${colour[b.state] || "#ccc"}">${esc(b.state)}</td>` +
    `<td>${esc(b.tries)}</td><td>${esc(b.updated)}</td><td><code>${esc(b.detail)}</code></td></tr>`).join("");
  const q = jobs.map((j) => `<li>${esc(j.kind)} · ${esc(j.status)}: ${j.n}</li>`).join("");
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width">
<title>Build status</title><style>body{font:14px system-ui;background:#111;color:#ddd;margin:20px}table{border-collapse:collapse;width:100%}
td,th{border-bottom:1px solid #333;padding:6px;text-align:left;vertical-align:top}code{white-space:pre-wrap;color:#aaa}</style>
<h1>Build status</h1><p>Reported by the Mac every 5 minutes; "stalled" means the reports stopped.</p>
<table><tr><th>Period</th><th>State</th><th>Retries</th><th>Last report (UTC)</th><th>Last line</th></tr>${rows}</table>
<h2>Agent checks on Cloudflare</h2><ul>${q}</ul>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}


// ---------- Silhouettes from PhyloPic, for animals with no picture of them alive ----------
// The cron copies PhyloPic's image list into D1 a few pages per run, then starts again weekly to pick up
// new drawings. /api/silhouette?names=Genus,Family,Order,... answers with the most specific match.
const PHYLOPIC = "https://api.phylopic.org";
const PHYLOPIC_PAGES_PER_RUN = 20;
const UA = { "User-Agent": "anthropocene-natural-history-map/0.2 (https://anthropocene.bladedestroyer.workers.dev)" };

function licenceName(url = "") {
  const u = url.toLowerCase();
  if (u.includes("publicdomain")) return "Public domain";
  for (const code of ["by-nc-sa", "by-sa", "by-nc", "by"]) if (u.includes(`/licenses/${code}/`)) return `CC ${code.toUpperCase()} ${u.replace(/\/$/, "").split("/").pop()}`;
  return "";
}

async function syncPhylopic(env) {
  // The tables (worker/migrations/0003_phylopic.sql), made here too since the Worker can always reach its own D1.
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS phylopic (name TEXT PRIMARY KEY, uuid TEXT NOT NULL, svg TEXT NOT NULL, of_name TEXT NOT NULL, artist TEXT, license TEXT, exact INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS phylopic_sync (id INTEGER PRIMARY KEY CHECK (id = 1), page INTEGER NOT NULL, total INTEGER)"),
    env.DB.prepare("INSERT OR IGNORE INTO phylopic_sync (id, page, total) VALUES (1, 0, NULL)"),
  ]);
  const row = await env.DB.prepare("SELECT page, total FROM phylopic_sync WHERE id = 1").first();
  if (!row) return;
  let { page, total } = row;
  const index = await (await fetch(`${PHYLOPIC}/images?build=562`, { headers: UA })).json().catch(() => null);
  if (!index) return;
  total = index.totalPages;
  if (page >= total) {                       // finished: start over once a week for new drawings
    if (new Date().getUTCDay() === 0 && new Date().getUTCHours() === 0 && new Date().getUTCMinutes() < 15) page = 0;
    else return;
  }
  const upsert = env.DB.prepare(`INSERT INTO phylopic (name, uuid, svg, of_name, artist, license, exact) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET uuid = excluded.uuid, svg = excluded.svg, of_name = excluded.of_name,
      artist = excluded.artist, license = excluded.license, exact = excluded.exact WHERE excluded.exact >= phylopic.exact`);
  for (const end = Math.min(total, page + PHYLOPIC_PAGES_PER_RUN); page < end; page++) {
    const res = await fetch(`${PHYLOPIC}/images?build=562&embed_items=true&embed_specificNode=true&page=${page}`, { headers: UA });
    if (!res.ok) break;
    const d = await res.json();
    const batch = [];
    for (const it of d._embedded?.items || []) {
      const node = it._embedded?.specificNode || {};
      const names = (node.names || []).filter((n) => n?.[0]?.class === "scientific").map((n) => n[0].text);
      const svg = it._links?.vectorFile?.href;
      if (!names.length || !svg) continue;
      const artist = it.attribution || it._links?.contributor?.title || "";
      const seen = new Set();
      for (const n of names) {
        const key = n.split(" ")[0].toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        batch.push(upsert.bind(key, it.uuid, svg, names[0], artist, licenceName(it._links?.license?.href), n.split(" ").length === 1 ? 1 : 0));
      }
    }
    if (batch.length) await env.DB.batch(batch);
  }
  await env.DB.prepare("UPDATE phylopic_sync SET page = ?, total = ? WHERE id = 1").bind(page, total).run();
}

async function silhouette(env, url) {
  const names = (url.searchParams.get("names") || "").split(",").map((n) => n.trim().toLowerCase()).filter(Boolean).slice(0, 12);
  if (!names.length) return Response.json(null);
  if (!(await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE name = 'phylopic'").first())) return Response.json(null);
  const { results } = await env.DB.prepare(`SELECT * FROM phylopic WHERE name IN (${names.map(() => "?").join(",")})`).bind(...names).all();
  const by = new Map(results.map((r) => [r.name, r]));
  const i = names.findIndex((n) => by.has(n));
  const r = i >= 0 ? by.get(names[i]) : null;
  return Response.json(r && { svg: r.svg, of: r.of_name, artist: r.artist, license: r.license, matched: names[i], own: i === 0,
    page: `https://www.phylopic.org/images/${r.uuid}` }, { headers: { "cache-control": "public, max-age=3600" } });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/data/")) {
      const cache = caches.default, key = new Request(url.origin + url.pathname + url.search);
      const hit = await cache.match(key);
      if (hit) return hit;
      const out = await agentData(env, url);
      if (out) {
        const res = out instanceof Response ? out : Response.json(out, { headers: { "cache-control": "public, max-age=900" } });
        if (!(out instanceof Response)) ctx.waitUntil(cache.put(key, res.clone()));
        return res;
      }
    }
    // Manual run for testing, only from wrangler dev on this machine.
    if (url.pathname === "/__agent" && url.hostname === "localhost") {
      return Response.json(await work(env, url.origin, Number(url.searchParams.get("n") || 3), url.searchParams.get("kind")));
    }
    if (url.pathname === "/status") return statusPage(env);
    if (url.pathname === "/api/silhouette") return silhouette(env, url);
    return env.ASSETS.fetch(req);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(markStalled(env));
    ctx.waitUntil(syncPhylopic(env));
    ctx.waitUntil(work(env, "https://assets.local", Number(env.JOBS_PER_RUN)));
  },
};
