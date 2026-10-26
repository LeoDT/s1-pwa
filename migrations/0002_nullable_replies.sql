-- Unknown reply counts are NULL. Existing zeroes are preserved: their provenance cannot be inferred.
CREATE TABLE progress_nullable (
  user_key    TEXT    NOT NULL,
  tid         INTEGER NOT NULL,
  fid         INTEGER NOT NULL DEFAULT 0,
  forum_name  TEXT    NOT NULL DEFAULT '',
  title       TEXT    NOT NULL DEFAULT '',
  last_pid    INTEGER,
  last_floor  INTEGER,
  last_page   INTEGER,
  total_pages INTEGER,
  replies     INTEGER,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_key, tid)
) WITHOUT ROWID;

INSERT INTO progress_nullable
SELECT user_key, tid, fid, forum_name, title, last_pid, last_floor, last_page, total_pages, replies, updated_at
FROM progress;
DROP TABLE progress;
ALTER TABLE progress_nullable RENAME TO progress;
CREATE INDEX idx_progress_recent ON progress (user_key, updated_at DESC);
