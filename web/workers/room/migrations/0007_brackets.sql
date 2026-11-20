-- Bracket mode (single elimination). Additive: a tournament is "bracket mode"
-- simply by having a row in tournament_brackets; the existing `tournaments`
-- table and its scoreboard-mode flow (tournaments.ts) are untouched.
--
-- An "entrant" is a joined player's team (or the player alone, if they joined
-- solo) — see brackets.ts for how `tournament_players` rows are grouped into
-- entrants. `entrant_*_key` stays NULL until a previous round's result (or a
-- bye) fills it in, which is how later rounds start as empty placeholders
-- that propagation fills without ever inserting new rows.

CREATE TABLE tournament_brackets (
  tournament_id INTEGER PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  seeding_mode TEXT NOT NULL DEFAULT 'random', -- 'random' | 'elo' | 'manual'
  advance_mode TEXT NOT NULL DEFAULT 'auto',   -- 'auto' | 'manual' (TD confirm)
  elo_min INTEGER,
  elo_max INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE bracket_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  entrant_a_key TEXT,
  entrant_a_label TEXT,
  entrant_b_key TEXT,
  entrant_b_label TEXT,
  winner_key TEXT,
  state TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'ready' | 'awaiting_confirm' | 'finished'
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  UNIQUE (tournament_id, round, slot)
);
CREATE INDEX idx_bracket_matches_tournament ON bracket_matches(tournament_id);
