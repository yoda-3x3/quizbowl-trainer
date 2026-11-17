/**
 * Tournament endpoints for the Rooms Worker.
 *
 * Signed-in users host and play tournaments; anonymous users can list and view
 * them but never join or protest. Like `auth.ts`, this file wraps D1 behind a
 * small TournamentStore interface so the endpoints run against an in-memory
 * shim in tests without pulling in a Workers test harness.
 *
 * The question picker lives in the client (TossupQueue has the filters and the
 * prefetch pool), so `/start` takes the already-chosen question ids rather than
 * duplicating that logic here. The worker just pins the sequence.
 */

import {
  rateLimit,
  requireUser,
  type AuthStore,
  type RequestContext,
} from './auth';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type TournamentFormat = 'tossups' | 'tossups_bonuses';
export type TournamentState = 'open' | 'running' | 'finished' | 'cancelled';
export type QuestionKind = 'tossup' | 'bonus';
export type ProtestState = 'pending' | 'accepted' | 'rejected';

export interface TournamentRow {
  id: number;
  name: string;
  format: TournamentFormat;
  nTossups: number;
  nBonuses: number;
  createdBy: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  state: TournamentState;
}

export interface TournamentPlayerRow {
  tournamentId: number;
  userId: number;
  team: string;
  joinedAt: number;
}

export interface TournamentQuestionRow {
  tournamentId: number;
  seq: number;
  questionId: string;
  questionKind: QuestionKind;
}

export interface ProtestRow {
  id: number;
  tournamentId: number;
  questionId: string;
  raisedBy: number;
  reason: string;
  givenAnswer: string;
  state: ProtestState;
  createdAt: number;
  resolvedBy: number | null;
  resolvedAt: number | null;
  resolvedNote: string | null;
}

/**
 * The storage shape the tournament endpoints need. The production
 * implementation is built from a D1Database with `d1TournamentStore()`; tests
 * pass a plain in-memory map.
 */
export interface TournamentStore {
  createTournament(t: Omit<TournamentRow, 'id'>): Promise<number>;
  findTournament(id: number): Promise<TournamentRow | null>;
  /** Everything except state='finished'. Ordered newest first. */
  listUnfinished(): Promise<TournamentRow[]>;
  setTournamentState(
    id: number,
    state: TournamentState,
    startedAt: number | null,
    finishedAt: number | null,
  ): Promise<void>;

  addPlayer(p: TournamentPlayerRow): Promise<void>;
  findPlayer(tournamentId: number, userId: number): Promise<TournamentPlayerRow | null>;
  listPlayers(tournamentId: number): Promise<TournamentPlayerRow[]>;

  addQuestions(tournamentId: number, qs: ReadonlyArray<Omit<TournamentQuestionRow, 'tournamentId'>>): Promise<void>;
  listQuestions(tournamentId: number): Promise<TournamentQuestionRow[]>;

  createProtest(p: Omit<ProtestRow, 'id'>): Promise<number>;
  listProtestsForUser(tournamentId: number, userId: number): Promise<ProtestRow[]>;
  listProtestsForTournament(tournamentId: number): Promise<ProtestRow[]>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const TOURNAMENT_NAME_MIN = 1;
export const TOURNAMENT_NAME_MAX = 60;
export const TOURNAMENT_TOSSUPS_MIN = 1;
export const TOURNAMENT_TOSSUPS_MAX = 50;
export const TOURNAMENT_BONUSES_MAX = 50;
export const PROTEST_REASON_MIN = 10;
export const PROTEST_REASON_MAX = 1000;
export const TEAM_MAX = 40;

export const PROTEST_RATE_LIMIT_MAX = 5;

function isFormat(v: unknown): v is TournamentFormat {
  return v === 'tossups' || v === 'tossups_bonuses';
}

function isKind(v: unknown): v is QuestionKind {
  return v === 'tossup' || v === 'bonus';
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

function stateOf(v: unknown): TournamentState {
  return v === 'running' || v === 'finished' || v === 'cancelled' ? v : 'open';
}

function protestStateOf(v: unknown): ProtestState {
  return v === 'accepted' || v === 'rejected' ? v : 'pending';
}

function formatOf(v: unknown): TournamentFormat {
  return v === 'tossups_bonuses' ? 'tossups_bonuses' : 'tossups';
}

function kindOf(v: unknown): QuestionKind {
  return v === 'bonus' ? 'bonus' : 'tossup';
}

function rowToTournament(row: Record<string, unknown>): TournamentRow {
  return {
    id: num(row.id),
    name: String(row.name ?? ''),
    format: formatOf(row.format),
    nTossups: num(row.n_tossups),
    nBonuses: num(row.n_bonuses),
    createdBy: num(row.created_by),
    createdAt: num(row.created_at),
    startedAt: numOrNull(row.started_at),
    finishedAt: numOrNull(row.finished_at),
    state: stateOf(row.state),
  };
}

function rowToPlayer(row: Record<string, unknown>): TournamentPlayerRow {
  return {
    tournamentId: num(row.tournament_id),
    userId: num(row.user_id),
    team: String(row.team ?? ''),
    joinedAt: num(row.joined_at),
  };
}

function rowToQuestion(row: Record<string, unknown>): TournamentQuestionRow {
  return {
    tournamentId: num(row.tournament_id),
    seq: num(row.seq),
    questionId: String(row.question_id ?? ''),
    questionKind: kindOf(row.question_kind),
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

/** Builds a TournamentStore around a Cloudflare D1Database. */
export function d1TournamentStore(db: D1Database): TournamentStore {
  return {
    async createTournament(t) {
      const res = await db
        .prepare(
          `INSERT INTO tournaments
             (name, format, n_tossups, n_bonuses, created_by, created_at,
              started_at, finished_at, state)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          t.name,
          t.format,
          t.nTossups,
          t.nBonuses,
          t.createdBy,
          t.createdAt,
          t.startedAt,
          t.finishedAt,
          t.state,
        )
        .run();
      const meta = (res as { meta?: { last_row_id?: number } }).meta;
      return num(meta?.last_row_id);
    },

    async findTournament(id) {
      const row = await db
        .prepare(
          `SELECT id, name, format, n_tossups, n_bonuses, created_by,
                  created_at, started_at, finished_at, state
             FROM tournaments WHERE id = ?`,
        )
        .bind(id)
        .first<Record<string, unknown>>();
      return row ? rowToTournament(row) : null;
    },

    async listUnfinished() {
      const res = await db
        .prepare(
          `SELECT id, name, format, n_tossups, n_bonuses, created_by,
                  created_at, started_at, finished_at, state
             FROM tournaments
             WHERE state != 'finished'
             ORDER BY created_at DESC`,
        )
        .all<Record<string, unknown>>();
      const rows = res.results ?? [];
      return rows.map(rowToTournament);
    },

    async setTournamentState(id, state, startedAt, finishedAt) {
      await db
        .prepare(
          `UPDATE tournaments SET state = ?, started_at = ?, finished_at = ?
             WHERE id = ?`,
        )
        .bind(state, startedAt, finishedAt, id)
        .run();
    },

    async addPlayer(p) {
      await db
        .prepare(
          `INSERT INTO tournament_players (tournament_id, user_id, team, joined_at)
             VALUES (?, ?, ?, ?)`,
        )
        .bind(p.tournamentId, p.userId, p.team, p.joinedAt)
        .run();
    },

    async findPlayer(tournamentId, userId) {
      const row = await db
        .prepare(
          `SELECT tournament_id, user_id, team, joined_at
             FROM tournament_players
             WHERE tournament_id = ? AND user_id = ?`,
        )
        .bind(tournamentId, userId)
        .first<Record<string, unknown>>();
      return row ? rowToPlayer(row) : null;
    },

    async listPlayers(tournamentId) {
      const res = await db
        .prepare(
          `SELECT tournament_id, user_id, team, joined_at
             FROM tournament_players
             WHERE tournament_id = ?
             ORDER BY joined_at ASC`,
        )
        .bind(tournamentId)
        .all<Record<string, unknown>>();
      const rows = res.results ?? [];
      return rows.map(rowToPlayer);
    },

    async addQuestions(tournamentId, qs) {
      for (const q of qs) {
        await db
          .prepare(
            `INSERT INTO tournament_questions
               (tournament_id, seq, question_id, question_kind)
               VALUES (?, ?, ?, ?)`,
          )
          .bind(tournamentId, q.seq, q.questionId, q.questionKind)
          .run();
      }
    },

    async listQuestions(tournamentId) {
      const res = await db
        .prepare(
          `SELECT tournament_id, seq, question_id, question_kind
             FROM tournament_questions
             WHERE tournament_id = ?
             ORDER BY seq ASC`,
        )
        .bind(tournamentId)
        .all<Record<string, unknown>>();
      const rows = res.results ?? [];
      return rows.map(rowToQuestion);
    },

    async createProtest(p) {
      const res = await db
        .prepare(
          `INSERT INTO protests
             (tournament_id, question_id, raised_by, reason, given_answer,
              state, created_at, resolved_by, resolved_at, resolved_note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          p.tournamentId,
          p.questionId,
          p.raisedBy,
          p.reason,
          p.givenAnswer,
          p.state,
          p.createdAt,
          p.resolvedBy,
          p.resolvedAt,
          p.resolvedNote,
        )
        .run();
      const meta = (res as { meta?: { last_row_id?: number } }).meta;
      return num(meta?.last_row_id);
    },

    async listProtestsForUser(tournamentId, userId) {
      const res = await db
        .prepare(
          `SELECT id, tournament_id, question_id, raised_by, reason, given_answer,
                  state, created_at, resolved_by, resolved_at, resolved_note
             FROM protests
             WHERE tournament_id = ? AND raised_by = ?
             ORDER BY created_at DESC`,
        )
        .bind(tournamentId, userId)
        .all<Record<string, unknown>>();
      const rows = res.results ?? [];
      return rows.map(rowToProtest);
    },

    async listProtestsForTournament(tournamentId) {
      const res = await db
        .prepare(
          `SELECT id, tournament_id, question_id, raised_by, reason, given_answer,
                  state, created_at, resolved_by, resolved_at, resolved_note
             FROM protests
             WHERE tournament_id = ?
             ORDER BY created_at DESC`,
        )
        .bind(tournamentId)
        .all<Record<string, unknown>>();
      const rows = res.results ?? [];
      return rows.map(rowToProtest);
    },
  };
}

// ---------------------------------------------------------------------------
// Response shapes & helpers
// ---------------------------------------------------------------------------

export interface PlayerPublic {
  user_id: number;
  username: string;
  team: string;
  joined_at: number;
}

export interface TournamentPublic {
  id: number;
  name: string;
  format: TournamentFormat;
  n_tossups: number;
  n_bonuses: number;
  created_by: number;
  creator_username: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  state: TournamentState;
  player_count: number;
}

export interface TournamentDetailPublic extends TournamentPublic {
  players: PlayerPublic[];
  questions: Array<{ seq: number; question_id: string; question_kind: QuestionKind }>;
}

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

async function usernameOf(authStore: AuthStore, id: number): Promise<string> {
  const u = await authStore.findUserById(id);
  return u ? u.username : '';
}

async function toTournamentPublic(
  authStore: AuthStore,
  tStore: TournamentStore,
  t: TournamentRow,
): Promise<TournamentPublic> {
  const players = await tStore.listPlayers(t.id);
  const creatorUsername = await usernameOf(authStore, t.createdBy);
  return {
    id: t.id,
    name: t.name,
    format: t.format,
    n_tossups: t.nTossups,
    n_bonuses: t.nBonuses,
    created_by: t.createdBy,
    creator_username: creatorUsername,
    created_at: t.createdAt,
    started_at: t.startedAt,
    finished_at: t.finishedAt,
    state: t.state,
    player_count: players.length,
  };
}

async function toTournamentDetail(
  authStore: AuthStore,
  tStore: TournamentStore,
  t: TournamentRow,
): Promise<TournamentDetailPublic> {
  const players = await tStore.listPlayers(t.id);
  const questions = await tStore.listQuestions(t.id);
  const base = await toTournamentPublic(authStore, tStore, t);
  const playersPublic: PlayerPublic[] = [];
  for (const p of players) {
    const username = await usernameOf(authStore, p.userId);
    playersPublic.push({
      user_id: p.userId,
      username,
      team: p.team,
      joined_at: p.joinedAt,
    });
  }
  return {
    ...base,
    players: playersPublic,
    questions: questions.map((q) => ({
      seq: q.seq,
      question_id: q.questionId,
      question_kind: q.questionKind,
    })),
  };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

interface CreateBody {
  name?: unknown;
  format?: unknown;
  n_tossups?: unknown;
  n_bonuses?: unknown;
  team?: unknown;
}

async function handleCreate(
  request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  ctx: RequestContext,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);

  const body = await readBody<CreateBody>(request);
  if (!body) return json({ error: 'invalid body' }, 400);

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < TOURNAMENT_NAME_MIN || name.length > TOURNAMENT_NAME_MAX) {
    return json(
      { error: `name must be 1 to ${TOURNAMENT_NAME_MAX} characters` },
      400,
    );
  }
  if (!isFormat(body.format)) {
    return json({ error: 'format must be tossups or tossups_bonuses' }, 400);
  }
  const nTossups = Number(body.n_tossups);
  if (
    !Number.isInteger(nTossups) ||
    nTossups < TOURNAMENT_TOSSUPS_MIN ||
    nTossups > TOURNAMENT_TOSSUPS_MAX
  ) {
    return json(
      {
        error: `n_tossups must be an integer from ${TOURNAMENT_TOSSUPS_MIN} to ${TOURNAMENT_TOSSUPS_MAX}`,
      },
      400,
    );
  }
  const rawBonuses = body.n_bonuses;
  const nBonuses =
    rawBonuses == null || rawBonuses === ''
      ? 0
      : Number(rawBonuses);
  if (
    !Number.isInteger(nBonuses) ||
    nBonuses < 0 ||
    nBonuses > TOURNAMENT_BONUSES_MAX
  ) {
    return json(
      { error: `n_bonuses must be 0 to ${TOURNAMENT_BONUSES_MAX}` },
      400,
    );
  }
  const team = typeof body.team === 'string' ? body.team.slice(0, TEAM_MAX).trim() : '';

  const id = await tStore.createTournament({
    name,
    format: body.format,
    nTossups,
    nBonuses,
    createdBy: me.id,
    createdAt: ctx.now,
    startedAt: null,
    finishedAt: null,
    state: 'open',
  });

  await tStore.addPlayer({
    tournamentId: id,
    userId: me.id,
    team,
    joinedAt: ctx.now,
  });

  const tournament = await tStore.findTournament(id);
  if (!tournament) return json({ error: 'internal' }, 500);
  const detail = await toTournamentDetail(authStore, tStore, tournament);
  return json({ tournament: detail }, 200);
}

async function handleList(
  _request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
): Promise<Response> {
  const rows = await tStore.listUnfinished();
  const tournaments: TournamentPublic[] = [];
  for (const r of rows) {
    tournaments.push(await toTournamentPublic(authStore, tStore, r));
  }
  return json({ tournaments });
}

async function handleGet(
  _request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  id: number,
): Promise<Response> {
  const t = await tStore.findTournament(id);
  if (!t) return json({ error: 'not found' }, 404);
  return json({ tournament: await toTournamentDetail(authStore, tStore, t) });
}

interface JoinBody {
  team?: unknown;
}

async function handleJoin(
  request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  ctx: RequestContext,
  id: number,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);

  const t = await tStore.findTournament(id);
  if (!t) return json({ error: 'not found' }, 404);
  if (t.state !== 'open') {
    return json({ error: 'tournament is not open' }, 400);
  }

  const existing = await tStore.findPlayer(id, me.id);
  if (existing) return json({ error: 'already joined' }, 409);

  const body = (await readBody<JoinBody>(request)) ?? {};
  const team = typeof body.team === 'string' ? body.team.slice(0, TEAM_MAX).trim() : '';

  await tStore.addPlayer({
    tournamentId: id,
    userId: me.id,
    team,
    joinedAt: ctx.now,
  });

  const fresh = await tStore.findTournament(id);
  if (!fresh) return json({ error: 'internal' }, 500);
  return json({ tournament: await toTournamentDetail(authStore, tStore, fresh) }, 200);
}

interface StartBody {
  questions?: unknown;
}

async function handleStart(
  request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  ctx: RequestContext,
  id: number,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);

  const t = await tStore.findTournament(id);
  if (!t) return json({ error: 'not found' }, 404);
  if (t.createdBy !== me.id) {
    return json({ error: 'only the creator can start the tournament' }, 403);
  }
  if (t.state !== 'open') {
    return json({ error: 'tournament is not open' }, 400);
  }

  const body = await readBody<StartBody>(request);
  if (!body || !Array.isArray(body.questions)) {
    return json({ error: 'questions array required' }, 400);
  }
  const expected = t.nTossups + t.nBonuses;
  if (body.questions.length !== expected) {
    return json(
      { error: `expected ${expected} questions, got ${body.questions.length}` },
      400,
    );
  }
  const parsed: Array<Omit<TournamentQuestionRow, 'tournamentId'>> = [];
  for (let i = 0; i < body.questions.length; i++) {
    const q = body.questions[i] as Record<string, unknown> | null | undefined;
    if (!q || typeof q !== 'object') {
      return json({ error: `question at index ${i} is malformed` }, 400);
    }
    const seq = Number(q.seq);
    const questionId = typeof q.question_id === 'string' ? q.question_id : '';
    if (!Number.isInteger(seq) || seq < 0) {
      return json({ error: `question at index ${i} has invalid seq` }, 400);
    }
    if (!questionId) {
      return json({ error: `question at index ${i} has empty question_id` }, 400);
    }
    if (!isKind(q.question_kind)) {
      return json({ error: `question at index ${i} has invalid question_kind` }, 400);
    }
    parsed.push({ seq, questionId, questionKind: q.question_kind });
  }

  await tStore.addQuestions(id, parsed);
  await tStore.setTournamentState(id, 'running', ctx.now, null);

  const fresh = await tStore.findTournament(id);
  if (!fresh) return json({ error: 'internal' }, 500);
  return json({ tournament: await toTournamentDetail(authStore, tStore, fresh) }, 200);
}

interface ProtestBody {
  question_id?: unknown;
  reason?: unknown;
  given_answer?: unknown;
}

async function handleProtest(
  request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  ctx: RequestContext,
  id: number,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);

  const t = await tStore.findTournament(id);
  if (!t) return json({ error: 'not found' }, 404);

  const player = await tStore.findPlayer(id, me.id);
  if (!player) {
    return json({ error: 'only tournament players can file a protest' }, 403);
  }

  const rateKey = `protest:${me.id}`;
  if (!rateLimit(rateKey, ctx.now, PROTEST_RATE_LIMIT_MAX)) {
    return json({ error: 'too many protests, try again later' }, 429);
  }

  const body = await readBody<ProtestBody>(request);
  if (!body) return json({ error: 'invalid body' }, 400);

  const questionId = typeof body.question_id === 'string' ? body.question_id : '';
  if (!questionId) {
    return json({ error: 'question_id is required' }, 400);
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < PROTEST_REASON_MIN) {
    return json(
      { error: `reason must be at least ${PROTEST_REASON_MIN} characters` },
      400,
    );
  }
  if (reason.length > PROTEST_REASON_MAX) {
    return json(
      { error: `reason cannot exceed ${PROTEST_REASON_MAX} characters` },
      400,
    );
  }
  const givenAnswer =
    typeof body.given_answer === 'string' ? body.given_answer.slice(0, 500) : '';

  const protestId = await tStore.createProtest({
    tournamentId: id,
    questionId,
    raisedBy: me.id,
    reason,
    givenAnswer,
    state: 'pending',
    createdAt: ctx.now,
    resolvedBy: null,
    resolvedAt: null,
    resolvedNote: null,
  });

  return json({ id: protestId, state: 'pending' }, 200);
}

async function handleListProtests(
  request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  ctx: RequestContext,
  id: number,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);

  const t = await tStore.findTournament(id);
  if (!t) return json({ error: 'not found' }, 404);

  const rows =
    me.role === 'admin'
      ? await tStore.listProtestsForTournament(id)
      : await tStore.listProtestsForUser(id, me.id);

  return json({
    protests: rows.map((p) => ({
      id: p.id,
      tournament_id: p.tournamentId,
      question_id: p.questionId,
      raised_by: p.raisedBy,
      reason: p.reason,
      given_answer: p.givenAnswer,
      state: p.state,
      created_at: p.createdAt,
      resolved_by: p.resolvedBy,
      resolved_at: p.resolvedAt,
      resolved_note: p.resolvedNote,
    })),
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
 * Handles an /api/tournaments[/...] request. Returns null for anything that is
 * not a tournaments path so the caller can fall through to its other routes.
 *
 * TODO(admin): /api/admin/protests/:id/resolve lands in the next task.
 */
export async function handleTournaments(
  request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  ctx: RequestContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!path.startsWith('/api/tournaments')) return null;

  // Collection endpoints.
  if (path === '/api/tournaments') {
    if (request.method === 'GET') return handleList(request, authStore, tStore);
    if (request.method === 'POST') return handleCreate(request, authStore, tStore, ctx);
    return json({ error: 'method not allowed' }, 405);
  }

  // Per-tournament endpoints: /api/tournaments/:id[/action].
  const rest = path.slice('/api/tournaments/'.length);
  if (rest.length === 0) return json({ error: 'not found' }, 404);
  const [idRaw, action, ...more] = rest.split('/');
  if (more.length > 0) return json({ error: 'not found' }, 404);
  const id = parseId(idRaw ?? '');
  if (id === null) return json({ error: 'not found' }, 404);

  if (action === undefined) {
    if (request.method !== 'GET')
      return json({ error: 'method not allowed' }, 405);
    return handleGet(request, authStore, tStore, id);
  }
  if (action === 'join') {
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405);
    return handleJoin(request, authStore, tStore, ctx, id);
  }
  if (action === 'start') {
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405);
    return handleStart(request, authStore, tStore, ctx, id);
  }
  if (action === 'protest') {
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405);
    return handleProtest(request, authStore, tStore, ctx, id);
  }
  if (action === 'protests') {
    if (request.method !== 'GET')
      return json({ error: 'method not allowed' }, 405);
    return handleListProtests(request, authStore, tStore, ctx, id);
  }
  return json({ error: 'not found' }, 404);
}
