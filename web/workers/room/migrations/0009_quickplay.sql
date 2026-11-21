-- Quick Play (Tournaments v2 step 5): public matchmaking (rated) and private
-- invite-code games (unrated), both reusing the same Room DO + match concept
-- as H2H bracket rooms (see brackets.ts / room.ts's reportMatchResultIfOver),
-- but standing alone rather than belonging to a tournament/bracket.
--
-- `quickplay_queue` holds users currently waiting for a public opponent;
-- joining pairs the caller with the longest-waiting other entry (FIFO) if one
-- exists, else inserts a row and waits. `quickplay_matches` mirrors
-- bracket_matches' shape (entrants, winner, state, room_code) but keys
-- entrants directly to user ids instead of bracket entrant keys, since Quick
-- Play has no teams. `rated` is 1 for public matches and 0 for private ones,
-- so recordQuickPlayMatchResult knows whether to touch ELO.

CREATE TABLE quickplay_queue (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL
);

CREATE TABLE quickplay_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                    -- 'public' | 'private'
  rated INTEGER NOT NULL DEFAULT 0,
  invite_code TEXT,                      -- set only for a pending 'private' match
  entrant_a_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entrant_b_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  winner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'ready' | 'finished'
  regulation_tossups INTEGER NOT NULL DEFAULT 20,
  room_code TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE UNIQUE INDEX idx_quickplay_matches_invite ON quickplay_matches(invite_code);
CREATE INDEX idx_quickplay_matches_entrant_a ON quickplay_matches(entrant_a_user_id);
CREATE INDEX idx_quickplay_matches_entrant_b ON quickplay_matches(entrant_b_user_id);
