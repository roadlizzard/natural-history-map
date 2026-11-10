-- Silhouettes from PhyloPic, indexed by genus or group name; filled a few pages at a time by the cron.
CREATE TABLE IF NOT EXISTS phylopic (
  name TEXT PRIMARY KEY,      -- lower-case genus or group name
  uuid TEXT NOT NULL,
  svg TEXT NOT NULL,
  of_name TEXT NOT NULL,      -- what the picture is of
  artist TEXT,
  license TEXT,
  exact INTEGER NOT NULL      -- 1 if the picture is of this group itself, 0 if of one of its species
);
CREATE TABLE IF NOT EXISTS phylopic_sync (id INTEGER PRIMARY KEY CHECK (id = 1), page INTEGER NOT NULL, total INTEGER);
INSERT OR IGNORE INTO phylopic_sync (id, page, total) VALUES (1, 0, NULL);
