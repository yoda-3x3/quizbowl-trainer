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

export type AttemptDirective = 'accept' | 'prompt' | 'reject';

/**
 * One resolved tossup or bonus part in a tournament. The server is the source
 * of truth for scoreboard totals, and a protest restitutes points by writing
 * a `restitutionDelta` onto the matching row (see admin.ts).
 *
 * For a bonus part the client's `questionId` is `<bonusId>#<partIndex>`,
 * matching how Bonus.tsx already shapes `AttemptEvent.questionId`.
 */
export interface AttemptRow {
  id: number;
  tournamentId: number;
  userId: number;
  seq: number;
  questionId: string;
  givenAnswer: string;
  directive: AttemptDirective;
  points: number;
  powered: boolean;
  buzzWordIndex: number | null;
  totalWords: number;
  powerWordIndex: number | null;
  msToAnswer: number | null;
  createdAt: number;
  restitutedAt: number | null;
  restitutionDelta: number;
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

  createAttempt(a: Omit<AttemptRow, 'id'>): Promise<number>;
  listAttempts(tournamentId: number): Promise<AttemptRow[]>;
  findAttemptForProtest(
    tournamentId: number,
    userId: number,
    questionId: string,
  ): Promise<AttemptRow | null>;
  applyAttemptRestitution(
    attemptId: number,
    delta: number,
    restitutedAt: number,
  ): Promise<void>;
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
export const ATTEMPT_RATE_LIMIT_MAX = 200;
export const ATTEMPT_ANSWER_MAX = 500;

function isFormat(v: unknown): v is TournamentFormat {
  return v === 'tossups' || v === 'tossups_bonuses';
}

function isKind(v: unknown): v is QuestionKind {
  return v === 'tossup' || v === 'bonus';
}

function isDirective(v: unknown): v is AttemptDirective {
  return v === 'accept' || v === 'prompt' || v === 'reject';
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

function directiveOf(v: unknown): AttemptDirective {
  return v === 'accept' || v === 'prompt' || v === 'reject' ? v : 'reject';
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

function rowToAttempt(row: Record<string, unknown>): AttemptRow {
  return {
    id: num(row.id),
    tournamentId: num(row.tournament_id),
    userId: num(row.user_id),
    seq: num(row.seq),
    questionId: String(row.question_id ?? ''),
    givenAnswer: String(row.given_answer ?? ''),
    directive: directiveOf(row.directive),
    points: num(row.points),
    powered: num(row.powered) === 1,
    buzzWordIndex: numOrNull(row.buzz_word_index),
    totalWords: num(row.total_words),
    powerWordIndex: numOrNull(row.power_word_index),
    msToAnswer: numOrNull(row.ms_to_answer),
    createdAt: num(row.created_at),
    restitutedAt: numOrNull(row.restituted_at),
    restitutionDelta: num(row.restitution_delta),
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

    async createAttempt(a) {
      const res = await db
        .prepare(
          `INSERT INTO tournament_attempts
             (tournament_id, user_id, seq, question_id, given_answer, directive,
              points, powered, buzz_word_index, total_words, power_word_index,
              ms_to_answer, created_at, restituted_at, restitution_delta)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          a.tournamentId,
          a.userId,
          a.seq,
          a.questionId,
          a.givenAnswer,
          a.directive,
          a.points,
          a.powered ? 1 : 0,
          a.buzzWordIndex,
          a.totalWords,
          a.powerWordIndex,
          a.msToAnswer,
          a.createdAt,
          a.restitutedAt,
          a.restitutionDelta,
        )
        .run();
      const meta = (res as { meta?: { last_row_id?: number } }).meta;
      return num(meta?.last_row_id);
    },

    async listAttempts(tournamentId) {
      const res = await db
        .prepare(
          `SELECT id, tournament_id, user_id, seq, question_id, given_answer,
                  directive, points, powered, buzz_word_index, total_words,
                  power_word_index, ms_to_answer, created_at, restituted_at,
                  restitution_delta
             FROM tournament_attempts
             WHERE tournament_id = ?
             ORDER BY created_at ASC`,
        )
        .bind(tournamentId)
        .all<Record<string, unknown>>();
      const rows = res.results ?? [];
      return rows.map(rowToAttempt);
    },

    async findAttemptForProtest(tournamentId, userId, questionId) {
      // A protest cites a tournament question id; for bonuses the client's
      // attempt rows use `<bonusId>#<partIndex>`, so match both the exact id
      // and any bonus-part suffix. Most recent wins, since a player cannot
      // see the same tossup twice in one tournament but a stale attempt from
      // another match should not block a new protest.
      const row = await db
        .prepare(
          `SELECT id, tournament_id, user_id, seq, question_id, given_answer,
                  directive, points, powered, buzz_word_index, total_words,
                  power_word_index, ms_to_answer, created_at, restituted_at,
                  restitution_delta
             FROM tournament_attempts
             WHERE tournament_id = ? AND user_id = ?
               AND (question_id = ? OR question_id LIKE ?)
             ORDER BY created_at DESC
             LIMIT 1`,
        )
        .bind(tournamentId, userId, questionId, `${questionId}#%`)
        .first<Record<string, unknown>>();
      return row ? rowToAttempt(row) : null;
    },

    async applyAttemptRestitution(attemptId, delta, restitutedAt) {
      await db
        .prepare(
          `UPDATE tournament_attempts
             SET restitution_delta = ?, restituted_at = ?
             WHERE id = ?`,
        )
        .bind(delta, restitutedAt, attemptId)
        .run();
    },
  };
}

// ---------------------------------------------------------------------------
// Question fetcher (for the seq-driven reader) and its LRU cache
// ---------------------------------------------------------------------------

export interface PublicTossup {
  id: string;
  question: string;
  question_sanitized: string;
  answer: string;
  answer_sanitized: string;
  category: string;
  subcategory: string;
  difficulty: number;
  set_name: string;
  set_year: number;
  packet_number: number;
  question_number: number;
}

export interface PublicBonus {
  id: string;
  leadin: string;
  leadin_sanitized: string;
  parts: string[];
  parts_sanitized: string[];
  answers: string[];
  answers_sanitized: string[];
  values: number[] | null;
  category: string;
  subcategory: string;
  difficulty: number;
  set_name: string;
}

/**
 * Backend that resolves a pinned `question_id` into the shape the client needs
 * to drive the reader. Production builds `qbReaderQuestionFetcher()`, which
 * talks to QB Reader over HTTPS; tests pass a fake with an in-memory map so
 * the dispatch logic runs without the network.
 */
export interface QuestionFetcher {
  fetchTossup(id: string): Promise<PublicTossup | null>;
  fetchBonus(id: string): Promise<PublicBonus | null>;
}

const QB_BASE = 'https://www.qbreader.org/api';

/**
 * QB Reader-backed fetcher. The upstream rows carry `_id`, which the client
 * saved at Start, so `tossup-by-id?id=<_id>` is the right lookup. Transient
 * network errors return null and the endpoint reports a 502; the client can
 * retry a stuck question without losing the whole sequence.
 */
export function qbReaderQuestionFetcher(): QuestionFetcher {
  return {
    async fetchTossup(id) {
      try {
        const res = await fetch(`${QB_BASE}/tossup-by-id?id=${encodeURIComponent(id)}`);
        if (!res.ok) return null;
        const body = (await res.json()) as { tossup?: Record<string, unknown> };
        return body.tossup ? rawToPublicTossup(body.tossup) : null;
      } catch {
        return null;
      }
    },
    async fetchBonus(id) {
      try {
        const res = await fetch(`${QB_BASE}/bonus-by-id?id=${encodeURIComponent(id)}`);
        if (!res.ok) return null;
        const body = (await res.json()) as { bonus?: Record<string, unknown> };
        return body.bonus ? rawToPublicBonus(body.bonus) : null;
      } catch {
        return null;
      }
    },
  };
}

function stripTagsSafe(html: unknown): string {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function rawToPublicTossup(raw: Record<string, unknown>): PublicTossup {
  const set = (raw.set ?? {}) as Record<string, unknown>;
  const packet = (raw.packet ?? {}) as Record<string, unknown>;
  const question = typeof raw.question === 'string' ? raw.question : '';
  const answer = typeof raw.answer === 'string' ? raw.answer : '';
  return {
    id: String(raw._id ?? ''),
    question,
    question_sanitized:
      typeof raw.question_sanitized === 'string'
        ? raw.question_sanitized
        : stripTagsSafe(question),
    answer,
    answer_sanitized:
      typeof raw.answer_sanitized === 'string'
        ? raw.answer_sanitized
        : stripTagsSafe(answer),
    category: typeof raw.category === 'string' ? raw.category : 'Other Academic',
    subcategory:
      typeof raw.subcategory === 'string'
        ? raw.subcategory
        : typeof raw.category === 'string'
          ? raw.category
          : 'Other Academic',
    difficulty: typeof raw.difficulty === 'number' ? raw.difficulty : 3,
    set_name: typeof set.name === 'string' ? set.name : 'unknown set',
    set_year: typeof set.year === 'number' ? set.year : 0,
    packet_number: typeof packet.number === 'number' ? packet.number : 0,
    question_number: typeof raw.number === 'number' ? raw.number : 0,
  };
}

function rawToPublicBonus(raw: Record<string, unknown>): PublicBonus {
  const set = (raw.set ?? {}) as Record<string, unknown>;
  const parts = Array.isArray(raw.parts) ? (raw.parts as string[]) : [];
  const answers = Array.isArray(raw.answers)
    ? (raw.answers as string[])
    : Array.isArray(raw.answers_sanitized)
      ? (raw.answers_sanitized as string[])
      : [];
  const n = Math.min(parts.length, answers.length);
  const partsSanitized = Array.isArray(raw.parts_sanitized)
    ? (raw.parts_sanitized as string[])
    : parts;
  const answersSanitized = Array.isArray(raw.answers_sanitized)
    ? (raw.answers_sanitized as string[])
    : answers.map(stripTagsSafe);
  const values = Array.isArray(raw.values) ? (raw.values as number[]) : null;
  return {
    id: String(raw._id ?? ''),
    leadin: typeof raw.leadin === 'string' ? raw.leadin : '',
    leadin_sanitized:
      typeof raw.leadin_sanitized === 'string'
        ? raw.leadin_sanitized
        : stripTagsSafe(raw.leadin),
    parts: parts.slice(0, n),
    parts_sanitized: partsSanitized.slice(0, n),
    answers: answers.slice(0, n),
    answers_sanitized: answersSanitized.slice(0, n),
    values: values ? values.slice(0, n) : null,
    category: typeof raw.category === 'string' ? raw.category : 'Other Academic',
    subcategory:
      typeof raw.subcategory === 'string'
        ? raw.subcategory
        : typeof raw.category === 'string'
          ? raw.category
          : 'Other Academic',
    difficulty: typeof raw.difficulty === 'number' ? raw.difficulty : 3,
    set_name: typeof set.name === 'string' ? set.name : 'unknown set',
  };
}

/**
 * Small LRU cache for resolved questions. Each Worker isolate carries its own
 * copy; a cold start resets it, which is fine. The key is the question id
 * plus kind to avoid collisions in the unlikely case both endpoints return a
 * row for the same id.
 */
const QUESTION_CACHE_MAX = 500;
const questionCache = new Map<string, PublicTossup | PublicBonus>();

function cacheKey(kind: QuestionKind, id: string): string {
  return `${kind}:${id}`;
}

function cacheGet(kind: QuestionKind, id: string): PublicTossup | PublicBonus | null {
  const key = cacheKey(kind, id);
  const v = questionCache.get(key);
  if (!v) return null;
  // Touch for LRU: delete + reinsert.
  questionCache.delete(key);
  questionCache.set(key, v);
  return v;
}

function cacheSet(kind: QuestionKind, id: string, v: PublicTossup | PublicBonus): void {
  const key = cacheKey(kind, id);
  if (questionCache.has(key)) questionCache.delete(key);
  questionCache.set(key, v);
  while (questionCache.size > QUESTION_CACHE_MAX) {
    const oldest = questionCache.keys().next().value;
    if (oldest === undefined) break;
    questionCache.delete(oldest);
  }
}

/** For tests. */
export function __resetQuestionCache(): void {
  questionCache.clear();
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

async function handleGetQuestion(
  _request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  ctx: RequestContext,
  fetcher: QuestionFetcher,
  tournamentId: number,
  seq: number,
): Promise<Response> {
  // Players, the creator and admins see the pinned question. Non-players get
  // 403: the point of the pin is to keep every player on the same question,
  // not to let anyone scrape the whole set.
  // Unsigned-in callers are 401 so the client can distinguish "no session"
  // from "wrong account".
  const t = await tStore.findTournament(tournamentId);
  if (!t) return json({ error: 'not found' }, 404);

  // requireUser double-handles no-cookie callers; call it after the existence
  // check so a bad id stays a 404 rather than leaking "would be allowed".
  const me = await requireUser(_request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);
  if (me.role !== 'admin' && t.createdBy !== me.id) {
    const player = await tStore.findPlayer(tournamentId, me.id);
    if (!player) return json({ error: 'not a player in this tournament' }, 403);
  }

  const questions = await tStore.listQuestions(tournamentId);
  const pinned = questions.find((q) => q.seq === seq);
  if (!pinned) return json({ error: 'seq out of range' }, 404);

  const cached = cacheGet(pinned.questionKind, pinned.questionId);
  if (cached) {
    return json({
      seq: pinned.seq,
      question_id: pinned.questionId,
      question_kind: pinned.questionKind,
      total: questions.length,
      ...(pinned.questionKind === 'tossup'
        ? { tossup: cached as PublicTossup }
        : { bonus: cached as PublicBonus }),
    });
  }

  const resolved =
    pinned.questionKind === 'tossup'
      ? await fetcher.fetchTossup(pinned.questionId)
      : await fetcher.fetchBonus(pinned.questionId);
  if (!resolved) {
    return json(
      { error: `upstream could not resolve ${pinned.questionKind} ${pinned.questionId}` },
      502,
    );
  }
  cacheSet(pinned.questionKind, pinned.questionId, resolved);
  return json({
    seq: pinned.seq,
    question_id: pinned.questionId,
    question_kind: pinned.questionKind,
    total: questions.length,
    ...(pinned.questionKind === 'tossup'
      ? { tossup: resolved as PublicTossup }
      : { bonus: resolved as PublicBonus }),
  });
}

interface AttemptBody {
  seq?: unknown;
  question_id?: unknown;
  given_answer?: unknown;
  directive?: unknown;
  points?: unknown;
  powered?: unknown;
  buzz_word_index?: unknown;
  total_words?: unknown;
  power_word_index?: unknown;
  ms_to_answer?: unknown;
}

async function handleRecordAttempt(
  request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  ctx: RequestContext,
  tournamentId: number,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);

  const t = await tStore.findTournament(tournamentId);
  if (!t) return json({ error: 'not found' }, 404);

  const player = await tStore.findPlayer(tournamentId, me.id);
  if (!player) return json({ error: 'only players can record attempts' }, 403);

  if (!rateLimit(`attempt:${me.id}`, ctx.now, ATTEMPT_RATE_LIMIT_MAX)) {
    return json({ error: 'too many attempts, try again later' }, 429);
  }

  const body = await readBody<AttemptBody>(request);
  if (!body) return json({ error: 'invalid body' }, 400);

  const seq = Number(body.seq);
  if (!Number.isInteger(seq) || seq < 0) {
    return json({ error: 'seq must be a non-negative integer' }, 400);
  }
  const questionId = typeof body.question_id === 'string' ? body.question_id : '';
  if (!questionId) return json({ error: 'question_id is required' }, 400);
  if (!isDirective(body.directive)) {
    return json({ error: 'directive must be accept, prompt or reject' }, 400);
  }
  const points = Number(body.points);
  if (!Number.isFinite(points) || !Number.isInteger(points)) {
    return json({ error: 'points must be an integer' }, 400);
  }
  const totalWords = Number(body.total_words);
  if (!Number.isInteger(totalWords) || totalWords < 0) {
    return json({ error: 'total_words must be a non-negative integer' }, 400);
  }
  const buzzWordIndex =
    body.buzz_word_index == null || body.buzz_word_index === ''
      ? null
      : Number(body.buzz_word_index);
  if (buzzWordIndex !== null && (!Number.isInteger(buzzWordIndex) || buzzWordIndex < 0)) {
    return json({ error: 'buzz_word_index must be a non-negative integer or null' }, 400);
  }
  const powerWordIndex =
    body.power_word_index == null || body.power_word_index === ''
      ? null
      : Number(body.power_word_index);
  if (powerWordIndex !== null && (!Number.isInteger(powerWordIndex) || powerWordIndex < 0)) {
    return json({ error: 'power_word_index must be a non-negative integer or null' }, 400);
  }
  const msToAnswer =
    body.ms_to_answer == null || body.ms_to_answer === ''
      ? null
      : Number(body.ms_to_answer);
  if (msToAnswer !== null && (!Number.isFinite(msToAnswer) || msToAnswer < 0)) {
    return json({ error: 'ms_to_answer must be a non-negative number or null' }, 400);
  }
  const givenAnswer =
    typeof body.given_answer === 'string'
      ? body.given_answer.slice(0, ATTEMPT_ANSWER_MAX)
      : '';
  const powered = body.powered === true || body.powered === 1 || body.powered === '1';

  const id = await tStore.createAttempt({
    tournamentId,
    userId: me.id,
    seq,
    questionId,
    givenAnswer,
    directive: body.directive,
    points,
    powered,
    buzzWordIndex,
    totalWords,
    powerWordIndex,
    msToAnswer,
    createdAt: ctx.now,
    restitutedAt: null,
    restitutionDelta: 0,
  });

  return json({ id, recorded_at: ctx.now }, 200);
}

export interface ScoreboardEntry {
  user_id: number;
  username: string;
  team: string;
  base_points: number;
  restitution_delta: number;
  points: number;
}

/** Sums attempts and restitution deltas per player. Exported for admin.ts. */
export async function computeScoreboard(
  authStore: AuthStore,
  tStore: TournamentStore,
  tournamentId: number,
): Promise<ScoreboardEntry[]> {
  const players = await tStore.listPlayers(tournamentId);
  const attempts = await tStore.listAttempts(tournamentId);
  const byUser = new Map<number, { base: number; delta: number }>();
  for (const p of players) byUser.set(p.userId, { base: 0, delta: 0 });
  for (const a of attempts) {
    const bucket = byUser.get(a.userId) ?? { base: 0, delta: 0 };
    bucket.base += a.points;
    bucket.delta += a.restitutionDelta;
    byUser.set(a.userId, bucket);
  }
  const entries: ScoreboardEntry[] = [];
  for (const p of players) {
    const b = byUser.get(p.userId) ?? { base: 0, delta: 0 };
    const username = await usernameOf(authStore, p.userId);
    entries.push({
      user_id: p.userId,
      username,
      team: p.team,
      base_points: b.base,
      restitution_delta: b.delta,
      points: b.base + b.delta,
    });
  }
  entries.sort((a, b) => b.points - a.points);
  return entries;
}

async function handleScoreboard(
  _request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  tournamentId: number,
): Promise<Response> {
  const t = await tStore.findTournament(tournamentId);
  if (!t) return json({ error: 'not found' }, 404);
  const scoreboard = await computeScoreboard(authStore, tStore, tournamentId);
  return json({ scoreboard });
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
 * The question fetcher is injectable so tests avoid the live QB Reader API.
 */
export async function handleTournaments(
  request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  ctx: RequestContext,
  fetcher: QuestionFetcher = qbReaderQuestionFetcher(),
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

  // Per-tournament endpoints: /api/tournaments/:id[/action[/arg]].
  const rest = path.slice('/api/tournaments/'.length);
  if (rest.length === 0) return json({ error: 'not found' }, 404);
  const parts = rest.split('/');
  const [idRaw, action, arg, ...more] = parts;
  if (more.length > 0) return json({ error: 'not found' }, 404);
  const id = parseId(idRaw ?? '');
  if (id === null) return json({ error: 'not found' }, 404);

  if (action === undefined) {
    if (request.method !== 'GET')
      return json({ error: 'method not allowed' }, 405);
    return handleGet(request, authStore, tStore, id);
  }
  if (action === 'join' && arg === undefined) {
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405);
    return handleJoin(request, authStore, tStore, ctx, id);
  }
  if (action === 'start' && arg === undefined) {
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405);
    return handleStart(request, authStore, tStore, ctx, id);
  }
  if (action === 'protest' && arg === undefined) {
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405);
    return handleProtest(request, authStore, tStore, ctx, id);
  }
  if (action === 'protests' && arg === undefined) {
    if (request.method !== 'GET')
      return json({ error: 'method not allowed' }, 405);
    return handleListProtests(request, authStore, tStore, ctx, id);
  }
  if (action === 'attempts' && arg === undefined) {
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405);
    return handleRecordAttempt(request, authStore, tStore, ctx, id);
  }
  if (action === 'scoreboard' && arg === undefined) {
    if (request.method !== 'GET')
      return json({ error: 'method not allowed' }, 405);
    return handleScoreboard(request, authStore, tStore, id);
  }
  if (action === 'questions' && arg !== undefined) {
    if (request.method !== 'GET')
      return json({ error: 'method not allowed' }, 405);
    const seq = Number(arg);
    if (!Number.isInteger(seq) || seq < 0) {
      return json({ error: 'seq must be a non-negative integer' }, 400);
    }
    return handleGetQuestion(request, authStore, tStore, ctx, fetcher, id, seq);
  }
  return json({ error: 'not found' }, 404);
}
