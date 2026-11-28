-- Per-category stats for signed-in users, the substrate for category tags
-- ("Philosopher", "#1 in Literature", ...) and the public profile page.
--
-- The client's IndexedDB AttemptEvent log (src/engine/log.ts) is the record
-- every practice mode already writes. A signed-in client uploads those events
-- to POST /api/stats/attempts; `stat_attempts` keeps one compact row per event
-- (no answer text, no question text) and `(user_id, client_id)` is UNIQUE so a
-- re-sent batch is a no-op. `user_category_stats` is the per-(user, category)
-- aggregate, recomputed from `stat_attempts` for each category a batch
-- touched, so it can never drift from the rows it summarises.
--
-- Purely additive: no existing table is altered.

CREATE TABLE stat_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,            -- AttemptEvent.id, for idempotent re-sync
  at INTEGER NOT NULL,                -- epoch ms the attempt happened (client clock, clamped)
  mode TEXT NOT NULL,                 -- 'tossup' | 'bonus' | 'oac' | 'ear'
  category TEXT NOT NULL,             -- one of src/types.ts CATEGORIES
  correct INTEGER NOT NULL DEFAULT 0, -- 0/1
  neg INTEGER NOT NULL DEFAULT 0,     -- 0/1, an interrupt that lost points
  powered INTEGER NOT NULL DEFAULT 0, -- 0/1, correct buzz inside the power mark
  is_tossup INTEGER NOT NULL DEFAULT 0, -- 0/1, a buzzable question (not a bonus part)
  buzz_permille INTEGER,              -- correct tossup buzz point as 0..1000 of the question, else NULL
  points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_stat_attempts_client ON stat_attempts(user_id, client_id);
CREATE INDEX idx_stat_attempts_user_at ON stat_attempts(user_id, at DESC);
CREATE INDEX idx_stat_attempts_user_category ON stat_attempts(user_id, category);

CREATE TABLE user_category_stats (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  heard INTEGER NOT NULL DEFAULT 0,     -- every attempt (tossups + bonus parts)
  correct INTEGER NOT NULL DEFAULT 0,
  tossups INTEGER NOT NULL DEFAULT 0,   -- tossups heard
  powers INTEGER NOT NULL DEFAULT 0,
  negs INTEGER NOT NULL DEFAULT 0,
  buzz_sum INTEGER NOT NULL DEFAULT 0,  -- sum of buzz_permille over correct tossup buzzes
  buzz_n INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, category)
);
CREATE INDEX idx_user_category_stats_category ON user_category_stats(category, heard);
