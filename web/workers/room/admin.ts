/**
 * Admin endpoints for the Rooms Worker.
 *
 * Every route is guarded: it first calls `requireUser` (auth), then checks the
 * user's `role === 'admin'`. A signed-in non-admin receives 403, not 404, so a
 * ban-dodging attacker cannot tell real admin paths from unknown ones.
 *
 * The data layer sits behind a small `AdminStore` interface, built from D1 in
 * production and from a plain in-memory object in tests, matching the pattern
 * in `auth.ts` and `tournaments.ts`.
 *
 * This change adds the user-management endpoints. Rooms, packets and protests
 * land in the next commit.
 */

import {
  requireUser,
  type AuthStore,
  type RequestContext,
  type Role,
  type StoredUser,
} from './auth';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface AdminUserListEntry {
  id: number;
  username: string;
  role: Role;
  created_at: number;
  banned_at: number | null;
}

/**
 * The admin-only data access layer. Production builds this from a D1Database;
 * tests pass a plain in-memory shim.
 *
 * Notes on scope: `AdminStore` deliberately shares no interface ancestry with
 * `AuthStore` or `TournamentStore`. Each kind of store is defined where its
 * other callers live, and admin extends none of them so the existing in-memory
 * shims in `auth.test.ts` and `tournaments.test.ts` keep working without
 * changes.
 */
export interface AdminStore {
  /** Paginated user search; q is a case-insensitive substring of username. */
  listUsers(opts: {
    q: string;
    offset: number;
    limit: number;
  }): Promise<{ rows: StoredUser[]; total: number }>;

  setUserRole(id: number, role: Role): Promise<void>;
  setUserBanned(id: number, bannedAt: number | null): Promise<void>;
  deleteSessionsForUser(userId: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const USER_LIST_LIMIT_MAX = 50;
export const USER_LIST_LIMIT_DEFAULT = 25;

function isRole(v: unknown): v is Role {
  return v === 'user' || v === 'admin';
}

// ---------------------------------------------------------------------------
// D1-backed store
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function roleOf(v: unknown): Role {
  return v === 'admin' ? 'admin' : 'user';
}

function rowToUser(row: Record<string, unknown>): StoredUser {
  return {
    id: num(row.id),
    username: String(row.username ?? ''),
    pwHash: String(row.pw_hash ?? ''),
    role: roleOf(row.role),
    createdAt: num(row.created_at),
    bannedAt: numOrNull(row.banned_at),
  };
}

/** Builds an AdminStore around a Cloudflare D1Database. */
export function d1AdminStore(db: D1Database): AdminStore {
  return {
    async listUsers({ q, offset, limit }) {
      const safeLimit = Math.max(1, Math.min(limit, USER_LIST_LIMIT_MAX));
      const safeOffset = Math.max(0, offset);
      const like = `%${q.toLowerCase().replace(/[%_\\]/g, (c) => '\\' + c)}%`;
      const totalRow = await db
        .prepare(
          `SELECT COUNT(*) AS c FROM users WHERE lower(username) LIKE ? ESCAPE '\\'`,
        )
        .bind(like)
        .first<{ c: number }>();
      const total = totalRow ? num(totalRow.c) : 0;
      const res = await db
        .prepare(
          `SELECT id, username, pw_hash, role, created_at, banned_at
             FROM users
             WHERE lower(username) LIKE ? ESCAPE '\\'
             ORDER BY id ASC
             LIMIT ? OFFSET ?`,
        )
        .bind(like, safeLimit, safeOffset)
        .all<Record<string, unknown>>();
      const rows = (res.results ?? []).map(rowToUser);
      return { rows, total };
    },

    async setUserRole(id, role) {
      await db
        .prepare('UPDATE users SET role = ? WHERE id = ?')
        .bind(role, id)
        .run();
    },

    async setUserBanned(id, bannedAt) {
      await db
        .prepare('UPDATE users SET banned_at = ? WHERE id = ?')
        .bind(bannedAt, id)
        .run();
    },

    async deleteSessionsForUser(userId) {
      await db
        .prepare('DELETE FROM sessions WHERE user_id = ?')
        .bind(userId)
        .run();
    },
  };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function readBody<T>(request: Request): Promise<T | null> {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') return null;
    return body as T;
  } catch {
    return null;
  }
}

/**
 * Enforces the admin role on the caller. Returns the authenticated admin on
 * success, or a `Response` to send straight back on failure (401 or 403).
 */
async function requireAdmin(
  request: Request,
  authStore: AuthStore,
  ctx: RequestContext,
): Promise<{ id: number; role: Role; username: string } | Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);
  if (me.role !== 'admin') return json({ error: 'admin only' }, 403);
  return me;
}

function toUserListEntry(u: StoredUser): AdminUserListEntry {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    created_at: u.createdAt,
    banned_at: u.bannedAt,
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function handleListUsers(
  request: Request,
  authStore: AuthStore,
  admin: AdminStore,
  ctx: RequestContext,
): Promise<Response> {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const pageRaw = Number(url.searchParams.get('page') ?? '1');
  const limitRaw = Number(url.searchParams.get('limit') ?? USER_LIST_LIMIT_DEFAULT);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, USER_LIST_LIMIT_MAX)
      : USER_LIST_LIMIT_DEFAULT;

  const { rows, total } = await admin.listUsers({
    q,
    offset: (page - 1) * limit,
    limit,
  });
  const pageCount = total === 0 ? 1 : Math.ceil(total / limit);
  return json({
    users: rows.map(toUserListEntry),
    page,
    pageCount,
    total,
  });
}

interface RoleBody {
  role?: unknown;
}

async function handleSetRole(
  request: Request,
  authStore: AuthStore,
  admin: AdminStore,
  ctx: RequestContext,
  userId: number,
): Promise<Response> {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;

  const body = await readBody<RoleBody>(request);
  if (!body) return json({ error: 'invalid body' }, 400);
  if (!isRole(body.role)) {
    return json({ error: 'role must be "user" or "admin"' }, 400);
  }

  const target = await authStore.findUserById(userId);
  if (!target) return json({ error: 'user not found' }, 404);

  // Refuse to demote yourself: that would lock you out of the dashboard.
  if (target.id === me.id && body.role !== 'admin') {
    return json({ error: 'cannot demote yourself' }, 400);
  }

  await admin.setUserRole(userId, body.role);
  const fresh = await authStore.findUserById(userId);
  if (!fresh) return json({ error: 'user not found' }, 404);
  return json({ user: toUserListEntry(fresh) });
}

async function handleBan(
  request: Request,
  authStore: AuthStore,
  admin: AdminStore,
  ctx: RequestContext,
  userId: number,
): Promise<Response> {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;

  const target = await authStore.findUserById(userId);
  if (!target) return json({ error: 'user not found' }, 404);

  if (target.id === me.id) {
    return json({ error: 'cannot ban yourself' }, 400);
  }

  await admin.setUserBanned(userId, ctx.now);
  await admin.deleteSessionsForUser(userId);
  const fresh = await authStore.findUserById(userId);
  if (!fresh) return json({ error: 'user not found' }, 404);
  return json({ user: toUserListEntry(fresh) });
}

async function handleUnban(
  request: Request,
  authStore: AuthStore,
  admin: AdminStore,
  ctx: RequestContext,
  userId: number,
): Promise<Response> {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;

  const target = await authStore.findUserById(userId);
  if (!target) return json({ error: 'user not found' }, 404);

  await admin.setUserBanned(userId, null);
  const fresh = await authStore.findUserById(userId);
  if (!fresh) return json({ error: 'user not found' }, 404);
  return json({ user: toUserListEntry(fresh) });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Handles an /api/admin/* request. Returns null for anything that is not an
 * admin path so the caller can fall through to its other routes.
 */
export async function handleAdmin(
  request: Request,
  authStore: AuthStore,
  admin: AdminStore,
  ctx: RequestContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/admin')) return null;

  if (path === '/api/admin/users') {
    if (request.method !== 'GET')
      return json({ error: 'method not allowed' }, 405);
    return handleListUsers(request, authStore, admin, ctx);
  }

  const userAction = /^\/api\/admin\/users\/(\d+)\/(role|ban|unban)$/.exec(path);
  if (userAction) {
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405);
    const id = parseId(userAction[1] ?? '');
    if (id === null) return json({ error: 'not found' }, 404);
    const action = userAction[2];
    if (action === 'role')
      return handleSetRole(request, authStore, admin, ctx, id);
    if (action === 'ban')
      return handleBan(request, authStore, admin, ctx, id);
    if (action === 'unban')
      return handleUnban(request, authStore, admin, ctx, id);
  }

  return json({ error: 'not found' }, 404);
}
