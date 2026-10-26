-- Reading schema v2 intentionally discards all legacy reading progress; credentials and other tables are untouched.
DROP TABLE IF EXISTS progress;
CREATE TABLE progress (
  user_key             TEXT    NOT NULL,
  tid                  INTEGER NOT NULL,
  fid                  INTEGER NOT NULL DEFAULT 0,
  forum_name           TEXT    NOT NULL DEFAULT '',
  title                TEXT    NOT NULL DEFAULT '',
  metadata_at          INTEGER,
  metadata_id          TEXT,
  opened_at            INTEGER NOT NULL DEFAULT 0,
  read_at              INTEGER,
  read_id              TEXT,
  read_replies         INTEGER,
  position_at          INTEGER,
  position_id          TEXT,
  position_pid         INTEGER,
  position_floor       INTEGER,
  position_page        INTEGER,
  position_total_pages INTEGER,
  PRIMARY KEY (user_key, tid)
) WITHOUT ROWID;
CREATE INDEX idx_progress_recent ON progress
  (user_key, MAX(opened_at, COALESCE(read_at, 0), COALESCE(position_at, 0)) DESC);
