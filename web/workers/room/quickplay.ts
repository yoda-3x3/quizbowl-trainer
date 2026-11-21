/**
 * Quick Play (Tournaments v2 step 5): public matchmaking that affects ELO,
 * plus a private invite-code game that doesn't. Both reuse the same Room DO
 * + match-reporting pattern H2H bracket rooms use (see brackets.ts and
 * room.ts's reportMatchResultIfOver) rather than a second buzz engine, but
 * the match itself stands alone — no tournament, no bracket, no teams.
 *
 * Matchmaking is deliberately simple: `joinQueue` pairs the caller with the
 * single other waiting user (if any) FIFO, with no ELO banding. A richer
 * matchmaker (banded by rating, timeouts, etc.) is a natural follow-up once
 * there's enough concurrent traffic to need one.
 *
 * A player who is still waiting — in the public queue, or as a private
 * game's host — has no way to learn they were matched from their own
 * response (the match row is created by whoever joins *second*). They poll
 * `/api/quickplay/queue/status` instead, which also resolves their current
 * active match via `getActiveMatchFor` once one exists.
 */

import { requireUser, type AuthStore, type RequestContext } from './auth';
import { recordMatchResult, type RatingStore } from './ratings';
import { makeRoomCode } from './protocol';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type QuickPlayKind = 'public' | 'private';
export type QuickPlayState = 'pending' | 'ready' | 'finished';

export interface QuickPlayMatchRow {
  id: number;
  kind: QuickPlayKind;
  rated: boolean;
  inviteCode: string | null;
  entrantAUserId: number;
  entrantBUserId: number | null;
  winnerUserId: number | null;
  state: QuickPlayState;
  regulationTossups: number;
  roomCode: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export type NewQuickPlayMatch = Omit<QuickPlayMatchRow, 'id'>;

export interface QuickPlayMatchPatch {
  entrantBUserId?: number | null;
  winnerUserId?: number | null;
  state?: QuickPlayState;
  roomCode?: string | null;
  finishedAt?: number | null;
}

export const REGULATION_TOSSUPS_DEFAULT = 20;

/**
 * The storage shape Quick Play endpoints need. Production is
 * `d1QuickPlayStore()`; tests pass a plain in-memory shim.
 */
export interface QuickPlayStore {
  /** Oldest queued user other than `excludingUserId`, if any. */
  peekQueue(excludingUserId: number): Promise<{ userId: number; joinedAt: number } | null>;
  enqueue(userId: number, joinedAt: number): Promise<void>;
  dequeue(userId: number): Promise<void>;
  isQueued(userId: number): Promise<boolean>;
  createMatch(row: NewQuickPlayMatch): Promise<number>;
  getMatch(id: number): Promise<QuickPlayMatchRow | null>;
  getMatchByInviteCode(code: string): Promise<QuickPlayMatchRow | null>;
  updateMatch(id: number, patch: QuickPlayMatchPatch): Promise<void>;
  /**
   * The caller's most recent not-yet-finished match (pending or ready),
   * regardless of whether they're entrant A or B. Lets a client that is
   * waiting — either in the public queue, or as a private game's host
   * waiting for someone to redeem the invite — poll for "did I get
   * matched?" without needing to know a match id up front.
   */
  getActiveMatchFor(userId: number): Promise<QuickPlayMatchRow | null>;
}

/**
 * Bridges to the Room DO, the same way brackets.ts's MatchRoomOpener does.
 * index.ts builds the real implementation; tests pass a plain spy.
 */
export interface QuickPlayRoomOpener {
  attach(
    code: string,
    info: {
      matchId: number;
      entrantAKey: string;
      entrantBKey: string;
      regulationTossups: number;
    },
  ): Promise<void>;
}

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

function stateOf(v: unknown): QuickPlayState {
  return v === 'ready' || v === 'finished' ? v : 'pending';
}

function kindOf(v: unknown): QuickPlayKind {
  return v === 'private' ? 'private' : 'public';
}

function rowToMatch(row: Record<string, unknown>): QuickPlayMatchRow {
  return {
    id: num(row.id),
    kind: kindOf(row.kind),
    rated: num(row.rated) === 1,
    inviteCode: strOrNull(row.invite_code),
    entrantAUserId: num(row.entrant_a_user_id),
    entrantBUserId: numOrNull(row.entrant_b_user_id),
    winnerUserId: numOrNull(row.winner_user_id),
    state: stateOf(row.state),
    regulationTossups: row.regulation_tossups == null ? REGULATION_TOSSUPS_DEFAULT : num(row.regulation_tossups),
    roomCode: strOrNull(row.room_code),
    createdAt: num(row.created_at),
    finishedAt: numOrNull(row.finished_at),
  };
}

/** Builds a QuickPlayStore around a Cloudflare D1Database. */
export function d1QuickPlayStore(db: D1Database): QuickPlayStore {
  return {
    async peekQueue(excludingUserId) {
      const row = await db
        .prepare(
          `SELECT user_id, joined_at FROM quickplay_queue
             WHERE user_id != ?
             ORDER BY joined_at ASC
             LIMIT 1`,
        )
        .bind(excludingUserId)
        .first<{ user_id: number; joined_at: number }>();
      return row ? { userId: row.user_id, joinedAt: row.joined_at } : null;
    },

    async enqueue(userId, joinedAt) {
      await db
        .prepare(
          `INSERT INTO quickplay_queue (user_id, joined_at) VALUES (?, ?)
             ON CONFLICT(user_id) DO UPDATE SET joined_at = excluded.joined_at`,
        )
        .bind(userId, joinedAt)
        .run();
    },

    async dequeue(userId) {
      await db.prepare('DELETE FROM quickplay_queue WHERE user_id = ?').bind(userId).run();
    },

    async isQueued(userId) {
      const row = await db
        .prepare('SELECT 1 FROM quickplay_queue WHERE user_id = ?')
        .bind(userId)
        .first();
      return row !== null;
    },

    async createMatch(r) {
      const res = await db
        .prepare(
          `INSERT INTO quickplay_matches
             (kind, rated, invite_code, entrant_a_user_id, entrant_b_user_id,
              winner_user_id, state, regulation_tossups, room_code, created_at, finished_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING id`,
        )
        .bind(
          r.kind,
          r.rated ? 1 : 0,
          r.inviteCode,
          r.entrantAUserId,
          r.entrantBUserId,
          r.winnerUserId,
          r.state,
          r.regulationTossups,
          r.roomCode,
          r.createdAt,
          r.finishedAt,
        )
        .first<{ id: number }>();
      return res?.id ?? 0;
    },

    async getMatch(id) {
      const row = await db
        .prepare(
          `SELECT id, kind, rated, invite_code, entrant_a_user_id, entrant_b_user_id,
                  winner_user_id, state, regulation_tossups, room_code, created_at, finished_at
             FROM quickplay_matches WHERE id = ?`,
        )
        .bind(id)
        .first<Record<string, unknown>>();
      return row ? rowToMatch(row) : null;
    },

    async getMatchByInviteCode(code) {
      const row = await db
        .prepare(
          `SELECT id, kind, rated, invite_code, entrant_a_user_id, entrant_b_user_id,
                  winner_user_id, state, regulation_tossups, room_code, created_at, finished_at
             FROM quickplay_matches WHERE invite_code = ?`,
        )
        .bind(code)
        .first<Record<string, unknown>>();
      return row ? rowToMatch(row) : null;
    },

    async getActiveMatchFor(userId) {
      const row = await db
        .prepare(
          `SELECT id, kind, rated, invite_code, entrant_a_user_id, entrant_b_user_id,
                  winner_user_id, state, regulation_tossups, room_code, created_at, finished_at
             FROM quickplay_matches
             WHERE (entrant_a_user_id = ? OR entrant_b_user_id = ?) AND state != 'finished'
             ORDER BY created_at DESC
             LIMIT 1`,
        )
        .bind(userId, userId)
        .first<Record<string, unknown>>();
      return row ? rowToMatch(row) : null;
    },

    async updateMatch(id, patch) {
      const sets: string[] = [];
      const values: unknown[] = [];
      if ('entrantBUserId' in patch) {
        sets.push('entrant_b_user_id = ?');
        values.push(patch.entrantBUserId ?? null);
      }
      if ('winnerUserId' in patch) {
        sets.push('winner_user_id = ?');
        values.push(patch.winnerUserId ?? null);
      }
      if ('state' in patch) {
        sets.push('state = ?');
        values.push(patch.state);
      }
      if ('roomCode' in patch) {
        sets.push('room_code = ?');
        values.push(patch.roomCode ?? null);
      }
      if ('finishedAt' in patch) {
        sets.push('finished_at = ?');
        values.push(patch.finishedAt ?? null);
      }
      if (sets.length === 0) return;
      values.push(id);
      await db
        .prepare(`UPDATE quickplay_matches SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run();
    },
  };
}

// ---------------------------------------------------------------------------
// Matchmaking + match lifecycle (pure-ish; D1 access only through the store)
// ---------------------------------------------------------------------------

function entrantKey(userId: number): string {
  return `u:${userId}`;
}

/**
 * Joins the public queue. If another user is already waiting, pairs with
 * them immediately (removing both from the queue) and creates a rated
 * 'ready' match; otherwise enqueues the caller and the client polls
 * `queueStatus` until someone else joins.
 */
export async function joinQueue(
  store: QuickPlayStore,
  userId: number,
  now: number,
): Promise<{ status: 'queued' } | { status: 'matched'; match: QuickPlayMatchRow }> {
  const waiting = await store.peekQueue(userId);
  if (!waiting) {
    await store.enqueue(userId, now);
    return { status: 'queued' };
  }
  await store.dequeue(waiting.userId);
  await store.dequeue(userId);
  const id = await store.createMatch({
    kind: 'public',
    rated: true,
    inviteCode: null,
    entrantAUserId: waiting.userId,
    entrantBUserId: userId,
    winnerUserId: null,
    state: 'ready',
    regulationTossups: REGULATION_TOSSUPS_DEFAULT,
    roomCode: null,
    createdAt: now,
    finishedAt: null,
  });
  const match = await store.getMatch(id);
  if (!match) throw new Error('match create failed');
  return { status: 'matched', match };
}

/** True if `userId` is a participant in `match` (either entrant). */
export function isParticipant(match: QuickPlayMatchRow, userId: number): boolean {
  return match.entrantAUserId === userId || match.entrantBUserId === userId;
}

/** Which side (for the Room DO join message) `userId` plays in `match`. */
export function sideFor(match: QuickPlayMatchRow, userId: number): 'a' | 'b' | null {
  if (match.entrantAUserId === userId) return 'a';
  if (match.entrantBUserId === userId) return 'b';
  return null;
}

function randomInviteCode(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(random() * alphabet.length)] ?? 'A';
  return out;
}

/** Creates a pending private match with a fresh invite code. */
export async function createPrivateMatch(
  store: QuickPlayStore,
  hostUserId: number,
  now: number,
): Promise<QuickPlayMatchRow> {
  let code = randomInviteCode();
  // Collisions are astronomically unlikely (33^6) but cheap to guard anyway.
  for (let i = 0; i < 5 && (await store.getMatchByInviteCode(code)); i++) {
    code = randomInviteCode();
  }
  const id = await store.createMatch({
    kind: 'private',
    rated: false,
    inviteCode: code,
    entrantAUserId: hostUserId,
    entrantBUserId: null,
    winnerUserId: null,
    state: 'pending',
    regulationTossups: REGULATION_TOSSUPS_DEFAULT,
    roomCode: null,
    createdAt: now,
    finishedAt: null,
  });
  const match = await store.getMatch(id);
  if (!match) throw new Error('match create failed');
  return match;
}

/** A second user redeems a private match's invite code. */
export async function joinPrivateMatch(
  store: QuickPlayStore,
  code: string,
  userId: number,
): Promise<{ ok: true; match: QuickPlayMatchRow } | { ok: false; error: string }> {
  const match = await store.getMatchByInviteCode(code.toUpperCase());
  if (!match) return { ok: false, error: 'invite code not found' };
  if (match.entrantAUserId === userId) {
    return { ok: false, error: 'cannot join your own private game' };
  }
  if (match.state !== 'pending') {
    if (match.entrantBUserId === userId) return { ok: true, match };
    return { ok: false, error: 'this invite has already been used' };
  }
  await store.updateMatch(match.id, { entrantBUserId: userId, state: 'ready' });
  const updated: QuickPlayMatchRow = { ...match, entrantBUserId: userId, state: 'ready' };
  return { ok: true, match: updated };
}

/** Allocates (or returns the existing) Room DO for a 'ready' match. */
export async function openMatchRoom(
  store: QuickPlayStore,
  opener: QuickPlayRoomOpener,
  match: QuickPlayMatchRow,
): Promise<string> {
  if (match.roomCode) return match.roomCode;
  if (match.state !== 'ready' || match.entrantBUserId === null) {
    throw new Error('match is not ready to play');
  }
  const code = makeRoomCode();
  await store.updateMatch(match.id, { roomCode: code });
  await opener.attach(code, {
    matchId: match.id,
    entrantAKey: entrantKey(match.entrantAUserId),
    entrantBKey: entrantKey(match.entrantBUserId),
    regulationTossups: match.regulationTossups,
  });
  return code;
}

/**
 * Records a Quick Play match's winner. Exported so room.ts's
 * reportMatchResultIfOver can call this directly once a live match resolves,
 * the same way it calls recordBracketMatchResult for bracket matches. Rating
 * is only applied when the match is `rated` (always true for 'public', always
 * false for 'private') — a tie reports a finished match with no winner and no
 * rating change, since recordMatchResult doesn't model draws.
 */
export async function recordQuickPlayMatchResult(
  store: QuickPlayStore,
  ratingStore: RatingStore,
  matchId: number,
  winnerUserId: number | null,
  now: number,
): Promise<{ ok: true; match: QuickPlayMatchRow } | { ok: false; error: string }> {
  const match = await store.getMatch(matchId);
  if (!match) return { ok: false, error: 'match not found' };
  if (match.state !== 'ready') {
    return { ok: false, error: `match is not ready (state: ${match.state})` };
  }
  if (
    winnerUserId !== null &&
    winnerUserId !== match.entrantAUserId &&
    winnerUserId !== match.entrantBUserId
  ) {
    return { ok: false, error: 'winner must be one of this match\'s entrants' };
  }

  await store.updateMatch(match.id, { winnerUserId, state: 'finished', finishedAt: now });
  const updated: QuickPlayMatchRow = { ...match, winnerUserId, state: 'finished', finishedAt: now };

  if (match.rated && winnerUserId !== null && match.entrantBUserId !== null) {
    const loserUserId = winnerUserId === match.entrantAUserId ? match.entrantBUserId : match.entrantAUserId;
    await recordMatchResult(ratingStore, winnerUserId, loserUserId, now);
  }
  return { ok: true, match: updated };
}

// ---------------------------------------------------------------------------
// Response shapes & endpoints
// ---------------------------------------------------------------------------

export interface QuickPlayMatchPublic {
  id: number;
  kind: QuickPlayKind;
  rated: boolean;
  state: QuickPlayState;
  regulation_tossups: number;
  room_code: string | null;
  side: 'a' | 'b' | null;
}

function toMatchPublic(match: QuickPlayMatchRow, userId: number): QuickPlayMatchPublic {
  return {
    id: match.id,
    kind: match.kind,
    rated: match.rated,
    state: match.state,
    regulation_tossups: match.regulationTossups,
    room_code: match.roomCode,
    side: sideFor(match, userId),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function handleQueueJoin(
  request: Request,
  authStore: AuthStore,
  store: QuickPlayStore,
  opener: QuickPlayRoomOpener,
  ctx: RequestContext,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);
  const result = await joinQueue(store, me.id, ctx.now);
  if (result.status === 'queued') return json({ status: 'queued' });
  const roomCode = await openMatchRoom(store, opener, result.match);
  return json({
    status: 'matched',
    match: toMatchPublic({ ...result.match, roomCode }, me.id),
  });
}

async function handleQueueLeave(
  request: Request,
  authStore: AuthStore,
  store: QuickPlayStore,
  ctx: RequestContext,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);
  await store.dequeue(me.id);
  return json({ ok: true });
}

async function handleQueueStatus(
  request: Request,
  authStore: AuthStore,
  store: QuickPlayStore,
  opener: QuickPlayRoomOpener,
  ctx: RequestContext,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);
  const queued = await store.isQueued(me.id);
  if (queued) return json({ queued, match: null });

  // Not queued — either never queued, or just got matched by someone else's
  // join. Either way, surface the active match (if any) so the waiting
  // client discovers it without needing the match id up front. Same lookup
  // also serves a private game's host waiting for their invite to be
  // redeemed.
  const match = await store.getActiveMatchFor(me.id);
  if (!match || match.state !== 'ready') return json({ queued, match: null });
  const roomCode = await openMatchRoom(store, opener, match);
  return json({ queued, match: toMatchPublic({ ...match, roomCode }, me.id) });
}

async function handleCreatePrivate(
  request: Request,
  authStore: AuthStore,
  store: QuickPlayStore,
  ctx: RequestContext,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);
  const match = await createPrivateMatch(store, me.id, ctx.now);
  return json({ invite_code: match.inviteCode, match: toMatchPublic(match, me.id) });
}

async function handleJoinPrivate(
  request: Request,
  authStore: AuthStore,
  store: QuickPlayStore,
  opener: QuickPlayRoomOpener,
  ctx: RequestContext,
  code: string,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);
  const result = await joinPrivateMatch(store, code, me.id);
  if (!result.ok) return json({ error: result.error }, 400);
  const roomCode = await openMatchRoom(store, opener, result.match);
  return json({ match: toMatchPublic({ ...result.match, roomCode }, me.id) });
}

async function handleGetMatch(
  request: Request,
  authStore: AuthStore,
  store: QuickPlayStore,
  ctx: RequestContext,
  id: number,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);
  const match = await store.getMatch(id);
  if (!match) return json({ error: 'not found' }, 404);
  if (!isParticipant(match, me.id)) return json({ error: 'forbidden' }, 403);
  return json({ match: toMatchPublic(match, me.id) });
}

function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const NOOP_ROOM_OPENER: QuickPlayRoomOpener = {
  async attach() {
    /* no-op default for callers (mainly tests) that don't need real rooms */
  },
};

/**
 * Handles /api/quickplay/*. Returns null for anything else so the caller
 * falls through to its other routes.
 */
export async function handleQuickPlay(
  request: Request,
  authStore: AuthStore,
  store: QuickPlayStore,
  ctx: RequestContext,
  opener: QuickPlayRoomOpener = NOOP_ROOM_OPENER,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/quickplay/')) return null;

  const rest = path.slice('/api/quickplay/'.length);
  const parts = rest.split('/');
  const [section, sub, sub2] = parts;

  if (section === 'queue' && sub === undefined) {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    return handleQueueJoin(request, authStore, store, opener, ctx);
  }
  if (section === 'queue' && sub === 'leave' && parts.length === 2) {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    return handleQueueLeave(request, authStore, store, ctx);
  }
  if (section === 'queue' && sub === 'status' && parts.length === 2) {
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
    return handleQueueStatus(request, authStore, store, opener, ctx);
  }
  if (section === 'private' && sub === undefined) {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    return handleCreatePrivate(request, authStore, store, ctx);
  }
  if (section === 'private' && sub !== undefined && sub2 === 'join' && parts.length === 3) {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    return handleJoinPrivate(request, authStore, store, opener, ctx, sub);
  }
  if (section === 'matches' && sub !== undefined && parts.length === 2) {
    const id = parseId(sub);
    if (id === null) return json({ error: 'not found' }, 404);
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
    return handleGetMatch(request, authStore, store, ctx, id);
  }

  return json({ error: 'not found' }, 404);
}
