CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,         -- PBKDF2 output: "pbkdf2$<iterations>$<salt_b64>$<hash_b64>"
  role TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
  created_at INTEGER NOT NULL,   -- unix ms
  banned_at INTEGER              -- unix ms when banned, else NULL
);
CREATE INDEX idx_users_username ON users(username);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,        -- 32 bytes hex
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
