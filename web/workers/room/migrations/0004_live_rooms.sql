-- Live rooms index.
--
-- Cloudflare Durable Objects expose no primitive to enumerate live DOs, so the
-- Room DO registers itself in this table on first websocket accept, touches
-- `last_seen` on every heartbeat/message, and deletes its row on the final
-- disconnect. The admin dashboard lists from this table.
--
-- `closed_at` is set by the admin close endpoint. The DO sees it on its next
-- heartbeat (or, more often, via a direct internal fetch from the worker) and
-- drains the socket set with a `{kind:'closed',reason:'closed by admin'}`
-- broadcast before deleting the row.
--
-- The admin listing sweeps rows whose `last_seen` is older than two minutes
-- before returning, so a DO evicted ungracefully never produces a ghost entry.

CREATE TABLE live_rooms (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  player_count INTEGER NOT NULL DEFAULT 0,
  closed_at INTEGER
);
CREATE INDEX idx_live_rooms_last_seen ON live_rooms(last_seen);
