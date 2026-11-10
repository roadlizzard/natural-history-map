-- One row per judgment the agent has to make. The build pushes jobs; the cron fills in results.
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,          -- e.g. "image:Allosaurus", "habitat:Hybodus", "slice:230"
  kind TEXT NOT NULL,           -- image | habitat | describe | slice | tour
  priority INTEGER NOT NULL DEFAULT 0,   -- higher first (things the page shows most)
  input TEXT NOT NULL,          -- JSON
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | done | failed
  result TEXT,                  -- JSON, already checked by the Worker's validator
  error TEXT,                   -- last validation or model error, fed back on the next try
  tries INTEGER NOT NULL DEFAULT 0,
  updated TEXT
);
CREATE INDEX jobs_queue ON jobs (status, priority DESC);
-- Days the free allowance ran out, so the cron stops early.
CREATE TABLE spent (day TEXT PRIMARY KEY);
