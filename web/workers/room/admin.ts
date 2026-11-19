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
 * Room management notes
 * ---------------------
 * Cloudflare Durable Objects expose no primitive to enumerate live DOs, so
 * `room.ts` now maintains a `live_rooms` D1 table (migration 0004). This
 * module lists from that table (sweeping rows older than the staleness
 * window so an ungracefully evicted DO never shows up) and marks a row
 * `closed_at` on close. The caller supplies a `RoomCloser` so the admin
 * worker can also reach the DO directly through its `/__internal/close`
 * route and drain the sockets immediately instead of waiting for the next
 * heartbeat; the shared secret is in `env.INTERNAL_SECRET`.
 *
 * Packets note
 * ------------
 * Packets are now persisted server-side; see `packets.ts`. The admin list and
 * remove endpoints share the same `PacketStore` the user-facing `/api/packets`
 * routes use. The caller passes the store in; the admin dispatcher never
 * reaches for D1 itself.
 */

import {
  requireUser,
  type AuthStore,
  type RequestContext,
  type Role,
  type StoredUser,
} from './auth';
import type {
  AttemptRow,
  ProtestRow,
  ProtestState,
  TournamentStore,
} from './tournaments';
import {
  listAdminPackets as listPacketsFromStore,
  removeAdminPacket as removePacketFromStore,
  type PacketListEntry,
  type PacketStore,
} from './packets';
// Pyramidal scoring is shared with the client; see the comment in
// tournaments.ts about crossing the src/workers boundary intentionally.
import { scoreTossup, scoreBonusPart } from '../../src/engine/scoring';

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

/** Milliseconds a `live_rooms` row's `last_seen` may lag before the sweep
 * removes it. Tuned above the DO's heartbeat interval with room to spare. */
export const LIVE_ROOMS_STALENESS_MS = 2 * 60 * 1000;

export interface AdminLiveRoomView {
  id: string;
  created_at: number;
  last_seen: number;
  player_count: number;
}

export interface LiveRoomRow {
  id: string;
  createdAt: number;
  lastSeen: number;
  playerCount: number;
  closedAt: number | null;
}

/**
 * Fire-and-forget hook the admin close handler uses to reach the live Room DO
 * directly, bypassing the heartbeat loop. The implementation in `index.ts`
 * wraps `env.ROOM.get(...).fetch('/__internal/close', ...)` with the shared
 * secret; the test harness passes a no-op.
 */
export interface RoomCloser {
  close(id: string): Promise<void>;
}

export interface AdminProtestView {
  id: number;
  tournament_id: number;
  tournament_name: string;
  question_id: string;
  raised_by: number;
  raised_by_username: string;
  reason: string;
  given_answer: string;
  state: ProtestState;
  created_at: number;
  resolved_by: number | null;
  resolved_at: number | null;
  resolved_note: string | null;
  /**
   * Set once a decision is written. For an accepted protest it is the points
   * the player was awarded minus the points they originally scored; for a
   * rejected protest or a pending one it is null. Surfaced on the admin
   * protests tab so the admin can see the effect of their decision.
   */
  restitution_delta: number | null;
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

  /**
   * Live rooms: sweep rows older than `stalenessMs` first so the listing never
   * shows a ghost from a DO that was evicted ungracefully, then return the
   * fresh rows in creation order.
   */
  listLiveRooms(now: number, stalenessMs: number): Promise<LiveRoomRow[]>;
  findLiveRoom(id: string): Promise<LiveRoomRow | null>;
  /** Marks the row for closure. Returns true if the row existed. */
  markRoomClosed(id: string, closedAt: number): Promise<boolean>;

  /** Pending by default; pass null for all states. */
  listProtests(state: ProtestState | null): Promise<ProtestRow[]>;
  findProtest(id: number): Promise<ProtestRow | null>;
  resolveProtest(
    id: number,
    state: ProtestState,
    resolvedBy: number,
    resolvedAt: number,
    note: string | null,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const USER_LIST_LIMIT_MAX = 50;
export const USER_LIST_LIMIT_DEFAULT = 25;
export const PROTEST_NOTE_MAX = 1000;

function isRole(v: unknown): v is Role {
  return v === 'user' || v === 'admin';
}

function isProtestState(v: unknown): v is ProtestState {
  return v === 'pending' || v === 'accepted' || v === 'rejected';
}

function isDecision(v: unknown): v is 'accepted' | 'rejected' {
  return v === 'accepted' || v === 'rejected';
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

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

function roleOf(v: unknown): Role {
  return v === 'admin' ? 'admin' : 'user';
}

function protestStateOf(v: unknown): ProtestState {
  return v === 'accepted' || v === 'rejected' ? v : 'pending';
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

function rowToLiveRoom(row: Record<string, unknown>): LiveRoomRow {
  return {
    id: String(row.id ?? ''),
    createdAt: num(row.created_at),
    lastSeen: num(row.last_seen),
    playerCount: num(row.player_count),
    closedAt: numOrNull(row.closed_at),
  };
}

function rowToProtest(row: Record<string, unknown>): ProtestRow {
  return {
    id: num(row.id),
    tournamentId: num(row.tournament_id),
    questionId: String(row.question_id ?? ''),
    raisedBy: num(row.raised_by),
    reason: String(row.reason ?? ''),
    givenAnswer: String(row.given_answer ?? ''),
    state: protestStateOf(row.state),
    createdAt: num(row.created_at),
    resolvedBy: numOrNull(row.resolved_by),
    resolvedAt: numOrNull(row.resolved_at),
    resolvedNote: strOrNull(row.resolved_note),
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

    async listLiveRooms(now, stalenessMs) {
      const cutoff = now - stalenessMs;
      await db
        .prepare('DELETE FROM live_rooms WHERE last_seen < ?')
        .bind(cutoff)
        .run();
      const res = await db
        .prepare(
          `SELECT id, created_at, last_seen, player_count, closed_at
             FROM live_rooms
             WHERE closed_at IS NULL
             ORDER BY created_at ASC`,
        )
        .all<Record<string, unknown>>();
      return (res.results ?? []).map(rowToLiveRoom);
    },

    async findLiveRoom(id) {
      const row = await db
        .prepare(
          `SELECT id, created_at, last_seen, player_count, closed_at
             FROM live_rooms WHERE id = ?`,
        )
        .bind(id)
        .first<Record<string, unknown>>();
      return row ? rowToLiveRoom(row) : null;
    },

    async markRoomClosed(id, closedAt) {
      const res = await db
        .prepare('UPDATE live_rooms SET closed_at = ? WHERE id = ?')
        .bind(closedAt, id)
        .run();
      // `meta.changes` is the row count D1 affected. Fall back to a scan if
      // the driver omits it (older local wrangler).
      const changes =
        (res.meta as { changes?: number } | undefined)?.changes ?? -1;
      if (changes >= 0) return changes > 0;
      return (await this.findLiveRoom(id)) !== null;
    },

    async listProtests(state) {
      if (state === null) {
        const res = await db
          .prepare(
            `SELECT id, tournament_id, question_id, raised_by, reason,
                    given_answer, state, created_at, resolved_by, resolved_at,
                    resolved_note
               FROM protests
               ORDER BY created_at DESC`,
          )
          .all<Record<string, unknown>>();
        return (res.results ?? []).map(rowToProtest);
      }
      const res = await db
        .prepare(
          `SELECT id, tournament_id, question_id, raised_by, reason,
                  given_answer, state, created_at, resolved_by, resolved_at,
                  resolved_note
             FROM protests
             WHERE state = ?
             ORDER BY created_at DESC`,
        )
        .bind(state)
        .all<Record<string, unknown>>();
      return (res.results ?? []).map(rowToProtest);
    },

    async findProtest(id) {
      const row = await db
        .prepare(
          `SELECT id, tournament_id, question_id, raised_by, reason,
                  given_answer, state, created_at, resolved_by, resolved_at,
                  resolved_note
             FROM protests WHERE id = ?`,
        )
        .bind(id)
        .first<Record<string, unknown>>();
      return row ? rowToProtest(row) : null;
    },

    async resolveProtest(id, state, resolvedBy, resolvedAt, note) {
      await db
        .prepare(
          `UPDATE protests
             SET state = ?, resolved_by = ?, resolved_at = ?, resolved_note = ?
             WHERE id = ?`,
        )
        .bind(state, resolvedBy, resolvedAt, note, id)
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
// Rooms (live index — see file header)
// ---------------------------------------------------------------------------

function toLiveRoomView(r: LiveRoomRow): AdminLiveRoomView {
  return {
    id: r.id,
    created_at: r.createdAt,
    last_seen: r.lastSeen,
    player_count: r.playerCount,
  };
}

async function handleListRooms(
  request: Request,
  authStore: AuthStore,
  admin: AdminStore,
  ctx: RequestContext,
): Promise<Response> {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;
  const rows = await admin.listLiveRooms(ctx.now, LIVE_ROOMS_STALENESS_MS);
  return json({ rooms: rows.map(toLiveRoomView) });
}

async function handleCloseRoom(
  request: Request,
  authStore: AuthStore,
  admin: AdminStore,
  rooms: RoomCloser,
  ctx: RequestContext,
  id: string,
): Promise<Response> {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;
  const row = await admin.findLiveRoom(id);
  if (!row) return json({ error: 'room not found' }, 404);
  await admin.markRoomClosed(id, ctx.now);
  // The direct close is best-effort: the row's `closed_at` guarantees the DO
  // drains on its next heartbeat even if this call fails (DO unreachable,
  // misconfigured secret). We never surface the inner error to the client.
  try {
    await rooms.close(id);
  } catch (err) {
    console.error('direct room close failed', err);
  }
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Packets (stubs — see file header)
// ---------------------------------------------------------------------------

async function handleListPackets(
  request: Request,
  authStore: AuthStore,
  packets: PacketStore,
  ctx: RequestContext,
): Promise<Response> {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;
  const entries: PacketListEntry[] = await listPacketsFromStore(
    packets,
    authStore,
  );
  return json({ packets: entries });
}

async function handleRemovePacket(
  request: Request,
  authStore: AuthStore,
  packets: PacketStore,
  ctx: RequestContext,
  id: string,
): Promise<Response> {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;
  const removed = await removePacketFromStore(packets, id);
  if (!removed) return json({ error: 'packet not found' }, 404);
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Protests
// ---------------------------------------------------------------------------

async function deltaForProtest(
  tStore: TournamentStore,
  p: ProtestRow,
): Promise<number | null> {
  if (p.state !== 'accepted') return null;
  const attempt = await tStore.findAttemptForProtest(
    p.tournamentId,
    p.raisedBy,
    p.questionId,
  );
  if (!attempt) return null;
  // The attempt already carries the delta that was written at resolve time;
  // return that directly rather than recomputing, so a later change in the
  // scoring rules does not retroactively rewrite accepted history.
  return attempt.restitutionDelta;
}

async function handleListProtests(
  request: Request,
  authStore: AuthStore,
  admin: AdminStore,
  tStore: TournamentStore,
  ctx: RequestContext,
): Promise<Response> {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;

  const url = new URL(request.url);
  const rawState = url.searchParams.get('state') ?? 'pending';
  const filter: ProtestState | null =
    rawState === 'all' ? null : isProtestState(rawState) ? rawState : 'pending';

  const rows = await admin.listProtests(filter);
  const views: AdminProtestView[] = [];
  for (const p of rows) {
    const tournament = await tStore.findTournament(p.tournamentId);
    const raiser = await authStore.findUserById(p.raisedBy);
    const delta = await deltaForProtest(tStore, p);
    views.push({
      id: p.id,
      tournament_id: p.tournamentId,
      tournament_name: tournament ? tournament.name : '',
      question_id: p.questionId,
      raised_by: p.raisedBy,
      raised_by_username: raiser ? raiser.username : '',
      reason: p.reason,
      given_answer: p.givenAnswer,
      state: p.state,
      created_at: p.createdAt,
      resolved_by: p.resolvedBy,
      resolved_at: p.resolvedAt,
      resolved_note: p.resolvedNote,
      restitution_delta: delta,
    });
  }
  return json({ protests: views });
}

/**
 * Computes the points the player should have had if the protest had been
 * ruled correct from the start. Uses `scoreTossup` for a tossup attempt and
 * `scoreBonusPart` for a bonus part — both are the owned engine functions,
 * imported from src/engine/scoring.ts, so client-side scoring and server-side
 * restitution never drift.
 */
function restitutedPointsFor(attempt: AttemptRow): number {
  if (attempt.questionId.includes('#')) {
    // Bonus part: a flat value stored by the client as `points` for a correct
    // answer. We don't have the per-part `value` on the server, so infer it
    // from the stored row: a correct attempt has points>0; an incorrect one
    // has 0. The value is the max of (recorded points, 10) — 10 is the
    // default-part value in src/engine/scoring.ts and in src/screens/Bonus.tsx.
    const inferredValue = Math.max(attempt.points, 10);
    return scoreBonusPart(true, inferredValue);
  }
  const outcome = scoreTossup({
    buzzWordIndex: attempt.buzzWordIndex,
    powerIndex: attempt.powerWordIndex,
    correct: true,
  });
  return outcome.points;
}

interface ResolveBody {
  decision?: unknown;
  note?: unknown;
}

async function handleResolveProtest(
  request: Request,
  authStore: AuthStore,
  admin: AdminStore,
  tStore: TournamentStore,
  ctx: RequestContext,
  protestId: number,
): Promise<Response> {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;

  const body = await readBody<ResolveBody>(request);
  if (!body) return json({ error: 'invalid body' }, 400);
  if (!isDecision(body.decision)) {
    return json({ error: 'decision must be "accepted" or "rejected"' }, 400);
  }
  const rawNote = typeof body.note === 'string' ? body.note.trim() : '';
  if (rawNote.length > PROTEST_NOTE_MAX) {
    return json(
      { error: `note cannot exceed ${PROTEST_NOTE_MAX} characters` },
      400,
    );
  }
  const note: string | null = rawNote.length > 0 ? rawNote : null;

  const existing = await admin.findProtest(protestId);
  if (!existing) return json({ error: 'protest not found' }, 404);
  if (existing.state !== 'pending') {
    return json({ error: 'protest has already been resolved' }, 400);
  }

  await admin.resolveProtest(
    protestId,
    body.decision,
    me.id,
    ctx.now,
    note,
  );

  // If the admin accepted the protest, write the restitution onto the matching
  // attempt row so the scoreboard reflects the ruling. If the player answered
  // correctly already (points > 0) and the admin still accepts, the delta is
  // 0 and the row is marked restituted for provenance.
  let restitutionDelta: number | null = null;
  if (body.decision === 'accepted') {
    const attempt = await tStore.findAttemptForProtest(
      existing.tournamentId,
      existing.raisedBy,
      existing.questionId,
    );
    if (attempt) {
      const target = restitutedPointsFor(attempt);
      restitutionDelta = target - attempt.points;
      await tStore.applyAttemptRestitution(
        attempt.id,
        restitutionDelta,
        ctx.now,
      );
    }
  }

  const fresh = await admin.findProtest(protestId);
  if (!fresh) return json({ error: 'protest not found' }, 404);
  return json({
    protest: {
      id: fresh.id,
      tournament_id: fresh.tournamentId,
      question_id: fresh.questionId,
      raised_by: fresh.raisedBy,
      reason: fresh.reason,
      given_answer: fresh.givenAnswer,
      state: fresh.state,
      created_at: fresh.createdAt,
      resolved_by: fresh.resolvedBy,
      resolved_at: fresh.resolvedAt,
      resolved_note: fresh.resolvedNote,
      restitution_delta: restitutionDelta,
    },
  });
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
/** No-op `RoomCloser` used when the caller only needs the admin dispatch
 * (for example in tests that never exercise the close path). */
const NOOP_ROOM_CLOSER: RoomCloser = { async close() {} };

/** Empty `PacketStore` used by test callers that never touch the packet
 * routes. A test that does exercise them passes a real memory store instead. */
const EMPTY_PACKET_STORE: PacketStore = {
  async insert() {},
  async list() {
    return [];
  },
  async find() {
    return null;
  },
  async delete() {
    return false;
  },
};

/**
 * Handles an /api/admin/* request. The production worker in `index.ts` passes
 * every store plus a `RoomCloser` and a `RequestContext`. For tests the
 * trailing `rooms` and `packets` can be omitted individually or together: the
 * overloads accept 5 (ctx only), 6 (packets + ctx), or 7 (packets + rooms +
 * ctx) arguments so existing admin tests keep compiling.
 */
export async function handleAdmin(
  request: Request,
  authStore: AuthStore,
  admin: AdminStore,
  tStore: TournamentStore,
  ctx: RequestContext,
): Promise<Response | null>;
export async function handleAdmin(
  request: Request,
  authStore: AuthStore,
  admin: AdminStore,
  tStore: TournamentStore,
  rooms: RoomCloser,
  ctx: RequestContext,
): Promise<Response | null>;
export async function handleAdmin(
  request: Request,
  authStore: AuthStore,
  admin: AdminStore,
  tStore: TournamentStore,
  packets: PacketStore,
  ctx: RequestContext,
): Promise<Response | null>;
export async function handleAdmin(
  request: Request,
  authStore: AuthStore,
  admin: AdminStore,
  tStore: TournamentStore,
  packets: PacketStore,
  rooms: RoomCloser,
  ctx: RequestContext,
): Promise<Response | null>;
export async function handleAdmin(
  request: Request,
  authStore: AuthStore,
  admin: AdminStore,
  tStore: TournamentStore,
  a: RequestContext | PacketStore | RoomCloser,
  b?: RequestContext | RoomCloser,
  c?: RequestContext,
): Promise<Response | null> {
  function isPacketStore(x: unknown): x is PacketStore {
    return (
      !!x && typeof x === 'object' && typeof (x as PacketStore).insert === 'function'
    );
  }
  function isRoomCloser(x: unknown): x is RoomCloser {
    return (
      !!x && typeof x === 'object' && typeof (x as RoomCloser).close === 'function'
    );
  }
  let packets: PacketStore = EMPTY_PACKET_STORE;
  let rooms: RoomCloser = NOOP_ROOM_CLOSER;
  let ctx: RequestContext;
  if (c !== undefined) {
    // 7-arg: packets + rooms + ctx.
    packets = a as PacketStore;
    rooms = b as RoomCloser;
    ctx = c;
  } else if (b !== undefined) {
    // 6-arg: either packets+ctx or rooms+ctx.
    if (isPacketStore(a)) packets = a;
    else if (isRoomCloser(a)) rooms = a;
    ctx = b as RequestContext;
  } else {
    // 5-arg: just the context.
    ctx = a as RequestContext;
  }
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/admin')) return null;

  // Collection paths
  if (path === '/api/admin/users') {
    if (request.method !== 'GET')
      return json({ error: 'method not allowed' }, 405);
    return handleListUsers(request, authStore, admin, ctx);
  }
  if (path === '/api/admin/rooms') {
    if (request.method !== 'GET')
      return json({ error: 'method not allowed' }, 405);
    return handleListRooms(request, authStore, admin, ctx);
  }
  if (path === '/api/admin/packets') {
    if (request.method !== 'GET')
      return json({ error: 'method not allowed' }, 405);
    return handleListPackets(request, authStore, packets, ctx);
  }
  if (path === '/api/admin/protests') {
    if (request.method !== 'GET')
      return json({ error: 'method not allowed' }, 405);
    return handleListProtests(request, authStore, admin, tStore, ctx);
  }

  // Per-user actions: /api/admin/users/:id/{role,ban,unban}
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

  // Per-room actions: /api/admin/rooms/:code/close
  const roomAction = /^\/api\/admin\/rooms\/([A-Za-z0-9]+)\/close$/.exec(path);
  if (roomAction) {
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405);
    const id = (roomAction[1] ?? '').toUpperCase();
    return handleCloseRoom(request, authStore, admin, rooms, ctx, id);
  }

  // Per-packet actions: /api/admin/packets/:id/remove
  const packetAction = /^\/api\/admin\/packets\/([^/]+)\/remove$/.exec(path);
  if (packetAction) {
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405);
    const id = decodeURIComponent(packetAction[1] ?? '');
    return handleRemovePacket(request, authStore, packets, ctx, id);
  }

  // Per-protest actions: /api/admin/protests/:id/resolve
  const protestAction = /^\/api\/admin\/protests\/(\d+)\/resolve$/.exec(path);
  if (protestAction) {
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405);
    const id = parseId(protestAction[1] ?? '');
    if (id === null) return json({ error: 'not found' }, 404);
    return handleResolveProtest(request, authStore, admin, tStore, ctx, id);
  }

  return json({ error: 'not found' }, 404);
}
