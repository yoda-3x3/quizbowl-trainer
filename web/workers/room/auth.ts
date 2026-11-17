/**
 * Auth endpoints for the Rooms Worker.
 *
 * The four routes are POST signup, POST signin, POST signout and GET me. They
 * live here so the Durable Object code in room.ts stays focused on rooms; the
 * entry worker in index.ts dispatches /api/auth/* to handleAuth().
 *
 * The D1 database is wrapped in a small AuthStore interface so the endpoints
 * can be tested against a plain in-memory shim without pulling a Workers test
 * harness into the worker tsconfig.
 */

import { hash, verify } from './password';
import {
  SESSION_TTL_MS,
  newSessionToken,
  parseSessionCookie,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from './session';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type Role = 'user' | 'admin';

export interface StoredUser {
  id: number;
  username: string;
  pwHash: string;
  role: Role;
  createdAt: number;
  bannedAt: number | null;
}

export interface PublicUser {
  id: number;
  username: string;
  role: Role;
}

export interface StoredSession {
  userId: number;
  expiresAt: number;
}

/**
 * The storage shape the auth endpoints need. The production implementation is
 * built from a D1Database with `d1Store()`; tests pass a plain in-memory map.
 */
export interface AuthStore {
  countUsers(): Promise<number>;
  findUserByUsername(username: string): Promise<StoredUser | null>;
  findUserById(id: number): Promise<StoredUser | null>;
  createUser(
    username: string,
    pwHash: string,
    role: Role,
    createdAt: number,
  ): Promise<number>;
  createSession(
    token: string,
    userId: number,
    createdAt: number,
    expiresAt: number,
  ): Promise<void>;
  findSession(token: string): Promise<StoredSession | null>;
  deleteSession(token: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const USERNAME_RE = /^[a-z0-9_]+$/i;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const PASSWORD_MIN = 8;

export function validateUsername(u: unknown): string | null {
  if (typeof u !== 'string') return 'Username is required.';
  if (u.length < USERNAME_MIN)
    return `Username must be at least ${USERNAME_MIN} characters.`;
  if (u.length > USERNAME_MAX)
    return `Username cannot exceed ${USERNAME_MAX} characters.`;
  if (!USERNAME_RE.test(u))
    return 'Username may only contain letters, digits and underscores.';
  return null;
}

export function validatePassword(p: unknown): string | null {
  if (typeof p !== 'string') return 'Password is required.';
  if (p.length < PASSWORD_MIN)
    return `Password must be at least ${PASSWORD_MIN} characters.`;
  return null;
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

export const RATE_LIMIT_MAX = 10;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

interface Bucket {
  count: number;
  resetAt: number;
}

/** Per-isolate bucket. A cold start resets it, which is fine for brute-force blunting. */
const buckets = new Map<string, Bucket>();

/** True if the request should be allowed; false if it should 429. */
export function rateLimit(key: string, now: number): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (b.count >= RATE_LIMIT_MAX) return false;
  b.count += 1;
  return true;
}

/** For tests. */
export function __resetRateLimit(): void {
  buckets.clear();
}

// ---------------------------------------------------------------------------
// D1-backed store
// ---------------------------------------------------------------------------

/**
 * Rows coming back from D1 are untyped. This helper narrows a value to a
 * number without throwing on a missing column.
 */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roleOf(v: unknown): Role {
  return v === 'admin' ? 'admin' : 'user';
}

/** Builds an AuthStore around a Cloudflare D1Database. */
export function d1Store(db: D1Database): AuthStore {
  return {
    async countUsers() {
      const row = await db
        .prepare('SELECT COUNT(*) AS c FROM users')
        .first<{ c: number }>();
      return row ? num(row.c) : 0;
    },

    async findUserByUsername(username) {
      const row = await db
        .prepare(
          'SELECT id, username, pw_hash, role, created_at, banned_at FROM users WHERE username = ?',
        )
        .bind(username)
        .first<Record<string, unknown>>();
      if (!row) return null;
      return {
        id: num(row.id),
        username: String(row.username),
        pwHash: String(row.pw_hash),
        role: roleOf(row.role),
        createdAt: num(row.created_at),
        bannedAt: row.banned_at == null ? null : num(row.banned_at),
      };
    },

    async findUserById(id) {
      const row = await db
        .prepare(
          'SELECT id, username, pw_hash, role, created_at, banned_at FROM users WHERE id = ?',
        )
        .bind(id)
        .first<Record<string, unknown>>();
      if (!row) return null;
      return {
        id: num(row.id),
        username: String(row.username),
        pwHash: String(row.pw_hash),
        role: roleOf(row.role),
        createdAt: num(row.created_at),
        bannedAt: row.banned_at == null ? null : num(row.banned_at),
      };
    },

    async createUser(username, pwHash, role, createdAt) {
      const res = await db
        .prepare(
          'INSERT INTO users (username, pw_hash, role, created_at) VALUES (?, ?, ?, ?)',
        )
        .bind(username, pwHash, role, createdAt)
        .run();
      const meta = (res as { meta?: { last_row_id?: number } }).meta;
      return num(meta?.last_row_id);
    },

    async createSession(token, userId, createdAt, expiresAt) {
      await db
        .prepare(
          'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
        )
        .bind(token, userId, createdAt, expiresAt)
        .run();
    },

    async findSession(token) {
      const row = await db
        .prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?')
        .bind(token)
        .first<Record<string, unknown>>();
      if (!row) return null;
      return {
        userId: num(row.user_id),
        expiresAt: num(row.expires_at),
      };
    },

    async deleteSession(token) {
      await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    },
  };
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

export interface RequestContext {
  /** Lower-cased client IP used for rate-limit keying. */
  ip: string;
  /** Edge colo, so the same IP hitting two colos has two buckets. */
  colo: string;
  /** Milliseconds since the epoch. */
  now: number;
}

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (extra) {
    for (const [k, v] of new Headers(extra).entries()) headers.append(k, v);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

interface Credentials {
  username: string;
  password: string;
}

async function readCredentials(request: Request): Promise<Credentials | null> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    const username = typeof b.username === 'string' ? b.username : '';
    const password = typeof b.password === 'string' ? b.password : '';
    return { username, password };
  } catch {
    return null;
  }
}

function toPublicUser(u: StoredUser): PublicUser {
  return { id: u.id, username: u.username, role: u.role };
}

/** Looks up the user that owns the session cookie on a request, or null. */
export async function authenticate(
  request: Request,
  store: AuthStore,
  now: number,
): Promise<{ user: PublicUser; token: string } | null> {
  const token = parseSessionCookie(request.headers.get('cookie'));
  if (!token) return null;
  const session = await store.findSession(token);
  if (!session) return null;
  if (session.expiresAt <= now) return null;
  const user = await store.findUserById(session.userId);
  if (!user) return null;
  if (user.bannedAt != null) return null;
  return { user: toPublicUser(user), token };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

async function handleSignup(
  request: Request,
  store: AuthStore,
  ctx: RequestContext,
): Promise<Response> {
  const creds = await readCredentials(request);
  if (!creds) return json({ error: 'invalid body' }, 400);

  const uErr = validateUsername(creds.username);
  if (uErr) return json({ error: uErr }, 400);
  const pErr = validatePassword(creds.password);
  if (pErr) return json({ error: pErr }, 400);

  const existing = await store.findUserByUsername(creds.username);
  if (existing) return json({ error: 'username taken' }, 409);

  // Seed path: the first account on the system is the admin.
  const existingCount = await store.countUsers();
  const role: Role = existingCount === 0 ? 'admin' : 'user';

  const pwHash = await hash(creds.password);
  const id = await store.createUser(creds.username, pwHash, role, ctx.now);

  const token = newSessionToken();
  await store.createSession(token, id, ctx.now, ctx.now + SESSION_TTL_MS);

  return json(
    { user: { id, username: creds.username, role } },
    200,
    { 'set-cookie': serializeSessionCookie(token) },
  );
}

async function handleSignin(
  request: Request,
  store: AuthStore,
  ctx: RequestContext,
): Promise<Response> {
  const creds = await readCredentials(request);
  if (!creds) return json({ error: 'invalid body' }, 400);

  if (typeof creds.username !== 'string' || creds.username.length === 0) {
    return json({ error: 'invalid credentials' }, 401);
  }

  const rateKey = `${ctx.colo}:${ctx.ip}:${creds.username.toLowerCase()}`;
  if (!rateLimit(rateKey, ctx.now)) {
    return json({ error: 'too many attempts, try again later' }, 429);
  }

  const user = await store.findUserByUsername(creds.username);
  if (!user) {
    // Spend the time anyway so a timing side channel does not distinguish a
    // missing user from a bad password.
    await verify(creds.password, 'pbkdf2$1$AAAA$AAAA');
    return json({ error: 'invalid credentials' }, 401);
  }
  const ok = await verify(creds.password, user.pwHash);
  if (!ok) return json({ error: 'invalid credentials' }, 401);
  if (user.bannedAt != null)
    return json({ error: 'account is not available' }, 403);

  const token = newSessionToken();
  await store.createSession(token, user.id, ctx.now, ctx.now + SESSION_TTL_MS);

  return json({ user: toPublicUser(user) }, 200, {
    'set-cookie': serializeSessionCookie(token),
  });
}

async function handleSignout(
  request: Request,
  store: AuthStore,
): Promise<Response> {
  const token = parseSessionCookie(request.headers.get('cookie'));
  if (token) await store.deleteSession(token);
  return json({ ok: true }, 200, {
    'set-cookie': serializeClearedSessionCookie(),
  });
}

async function handleMe(
  request: Request,
  store: AuthStore,
  ctx: RequestContext,
): Promise<Response> {
  const auth = await authenticate(request, store, ctx.now);
  if (!auth) return json({ error: 'not signed in' }, 401);
  return json({ user: auth.user });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Handles an /api/auth/* request. Returns null for an unknown path so the
 * caller can fall through to its other routes.
 */
export async function handleAuth(
  request: Request,
  store: AuthStore,
  ctx: RequestContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/auth/signup') {
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405);
    return handleSignup(request, store, ctx);
  }
  if (path === '/api/auth/signin') {
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405);
    return handleSignin(request, store, ctx);
  }
  if (path === '/api/auth/signout') {
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405);
    return handleSignout(request, store);
  }
  if (path === '/api/auth/me') {
    if (request.method !== 'GET')
      return json({ error: 'method not allowed' }, 405);
    return handleMe(request, store, ctx);
  }
  return null;
}
