-- Tournaments, their players, their locked question sequence, and the protests
-- raised during one. Everything references users(id) so a protest always has a
-- real author who the admin dashboard can contact; cascade deletes keep an
-- abandoned tournament from leaving orphan player/question/protest rows.

CREATE TABLE tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  format TEXT NOT NULL,              -- 'tossups' | 'tossups_bonuses'
  n_tossups INTEGER NOT NULL,
  n_bonuses INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  state TEXT NOT NULL DEFAULT 'open' -- 'open' | 'running' | 'finished' | 'cancelled'
);
CREATE INDEX idx_tournaments_state ON tournaments(state);

CREATE TABLE tournament_players (
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  team TEXT NOT NULL DEFAULT '',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE tournament_questions (
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  question_kind TEXT NOT NULL,       -- 'tossup' | 'bonus'
  PRIMARY KEY (tournament_id, seq)
);

CREATE TABLE protests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  raised_by INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  given_answer TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'rejected'
  created_at INTEGER NOT NULL,
  resolved_by INTEGER REFERENCES users(id),
  resolved_at INTEGER,
  resolved_note TEXT
);
CREATE INDEX idx_protests_state ON protests(state);
CREATE INDEX idx_protests_tournament ON protests(tournament_id);
