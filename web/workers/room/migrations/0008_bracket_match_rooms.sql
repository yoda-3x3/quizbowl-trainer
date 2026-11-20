-- H2H match rooms for bracket mode. `room_code` remembers the Room DO a match
-- is bound to so re-requesting "join match" returns the same room rather than
-- creating duplicates; `regulation_tossups` (TD-configurable at seed time,
-- default 20) is how long an H2H match runs before the room reports a winner
-- back to the bracket (see room.ts's reportMatchResultIfOver).

ALTER TABLE tournament_brackets ADD COLUMN regulation_tossups INTEGER NOT NULL DEFAULT 20;
ALTER TABLE bracket_matches ADD COLUMN room_code TEXT;
