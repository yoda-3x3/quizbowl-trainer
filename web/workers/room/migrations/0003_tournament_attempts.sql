-- Tournament attempts: one row per resolved question per player.
--
-- The client POSTs an attempt after each question in a tournament. The server
-- is the source of truth for the live scoreboard, so a protest can restitute
-- points by writing `restitution_delta` onto the matching row rather than
-- rewriting the player's AttemptEvent log.
--
-- A tossup attempt stores `powered`, `buzz_word_index` and `power_word_index`;
-- a bonus part collapses onto this same shape with `buzz_word_index = NULL`
-- and `powered = 0`. The `question_id` is whatever the client recorded —
-- for a bonus part it is the bonus id with a `#<part-index>` suffix, matching
-- the `AttemptEvent.questionId` already used in src/screens/Bonus.tsx.

CREATE TABLE tournament_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  seq INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  given_answer TEXT NOT NULL DEFAULT '',
  directive TEXT NOT NULL,            -- 'accept' | 'prompt' | 'reject'
  points INTEGER NOT NULL,
  powered INTEGER NOT NULL DEFAULT 0, -- 0/1
  buzz_word_index INTEGER,
  total_words INTEGER NOT NULL,
  power_word_index INTEGER,
  ms_to_answer INTEGER,
  created_at INTEGER NOT NULL,
  restituted_at INTEGER,              -- NULL unless a protest flipped the score
  restitution_delta INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_tournament_attempts_tournament ON tournament_attempts(tournament_id);
CREATE INDEX idx_tournament_attempts_user ON tournament_attempts(user_id);
CREATE INDEX idx_tournament_attempts_question ON tournament_attempts(tournament_id, question_id);
