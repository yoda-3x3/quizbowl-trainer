-- Individual ELO ratings, one shared pool across public Quick Play and
-- official tournaments (team ELO is deferred). A row is created lazily the
-- first time a user finishes a rated match; until then their rating is the
-- virtual default (see ELO_START in ratings.ts) computed without a row.

CREATE TABLE player_ratings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  elo INTEGER NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_player_ratings_elo ON player_ratings(elo DESC);
