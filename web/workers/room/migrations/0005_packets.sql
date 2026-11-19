-- Server-side packet persistence.
--
-- The importer used to be host-only: parsed in the browser, kept in a local
-- queue, and nothing crossed the wire (see NOTES.md, Card C and §18). This
-- migration adds a shared `packets` table so packets another user uploaded
-- are visible on every device.
--
-- `data` is the serialised JSON of the parsed packet (tossups + bonuses, or an
-- OAC packet). Capped to 1 MB by the upload endpoint.
--
-- `uploader_id` references `users(id)` so the admin dashboard and the client
-- can show who uploaded a packet; the FK is `ON DELETE SET NULL` so a deleted
-- user does not wipe their shared packets.

CREATE TABLE packets (
  id TEXT PRIMARY KEY,
  uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  tossup_count INTEGER NOT NULL DEFAULT 0,
  bonus_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_packets_created_at ON packets(created_at);
CREATE INDEX idx_packets_uploader ON packets(uploader_id);
