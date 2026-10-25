-- docs/data-model.md §2
CREATE TABLE IF NOT EXISTS progress (
  user_key    TEXT    NOT NULL,
  tid         INTEGER NOT NULL,
  fid         INTEGER NOT NULL DEFAULT 0,
  forum_name  TEXT    NOT NULL DEFAULT '',
  title       TEXT    NOT NULL DEFAULT '',
  last_pid    INTEGER,
  last_floor  INTEGER,
  last_page   INTEGER,
  total_pages INTEGER,
  replies     INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_key, tid)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_progress_recent
  ON progress (user_key, updated_at DESC);
