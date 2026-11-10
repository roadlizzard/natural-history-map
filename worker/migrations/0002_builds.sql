-- What each period's build on the Mac is doing, reported by scripts/watch-builds.py.
CREATE TABLE builds (
  time TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  detail TEXT,
  tries INTEGER NOT NULL DEFAULT 0,
  updated TEXT NOT NULL
);
