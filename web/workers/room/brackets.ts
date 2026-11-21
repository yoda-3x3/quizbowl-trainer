/**
 * Bracket mode: single elimination, TD-configurable seeding and advancement.
 *
 * Purely additive on top of tournaments.ts — a tournament is "bracket mode"
 * simply by having a `tournament_brackets` config row; nothing here touches
 * the existing scoreboard-mode schema or dispatch. index.ts mounts
 * `handleBrackets` ahead of `handleTournaments` so `/api/tournaments/:id/
 * bracket*` is claimed before the generic per-tournament dispatch sees it.
 *
 * An "entrant" is a joined player's team, or the player alone if they joined
 * solo (brief: "solo = team-of-one"); `buildEntrants` groups
 * `tournament_players` rows by their `team` string. Seeding assigns each
 * entrant a seed 1..n; `seedOrder` lays seeds onto bracket positions using
 * the standard recursive scheme (seed 1 plays the lowest seed, seed 2 the
 * second-lowest, etc., balanced across the tree) so upsets stay spread out
 * instead of bunching in one half of the bracket.
 *
 * The actual H2H gameplay (buzzing, scoring a match) is a later build step;
 * until then a match's winner is recorded by the TD (or, once H2H exists, by
 * that module calling `recordBracketMatchResult` directly instead of over
 * HTTP — the function is exported for exactly that reuse).
 */

import { requireUser, type AuthStore, type RequestContext } from './auth';
import {
  type TournamentPlayerRow,
  type TournamentStore,
} from './tournaments';
import {
  ratingOrDefault,
  recordMatchResult,
  type RatingStore,
} from './ratings';
import { makeRoomCode } from './protocol';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type SeedingMode = 'random' | 'elo' | 'manual';
export type AdvanceMode = 'auto' | 'manual';
export type MatchState = 'pending' | 'ready' | 'awaiting_confirm' | 'finished';

export interface BracketConfigRow {
  tournamentId: number;
  seedingMode: SeedingMode;
  advanceMode: AdvanceMode;
  eloMin: number | null;
  eloMax: number | null;
  /** How many tossups an H2H match room plays before reporting a winner. */
  regulationTossups: number;
  createdAt: number;
}

export interface BracketMatchRow {
  id: number;
  tournamentId: number;
  round: number;
  slot: number;
  entrantAKey: string | null;
  entrantALabel: string | null;
  entrantBKey: string | null;
  entrantBLabel: string | null;
  winnerKey: string | null;
  state: MatchState;
  createdAt: number;
  finishedAt: number | null;
  /** Set once "open match room" has allocated a Room DO for this match. */
  roomCode: string | null;
}

export type NewBracketMatch = Omit<BracketMatchRow, 'id'>;

export interface MatchPatch {
  entrantAKey?: string | null;
  entrantALabel?: string | null;
  entrantBKey?: string | null;
  entrantBLabel?: string | null;
  winnerKey?: string | null;
  state?: MatchState;
  finishedAt?: number | null;
  roomCode?: string | null;
}

export const REGULATION_TOSSUPS_DEFAULT = 20;
export const REGULATION_TOSSUPS_MIN = 1;
export const REGULATION_TOSSUPS_MAX = 50;

/**
 * Bridges to the Room DO so this module stays decoupled from Durable Object
 * specifics, the same way admin.ts's `RoomCloser` bridges room closing.
 * index.ts builds the real implementation; tests pass a plain spy.
 */
export interface MatchRoomOpener {
  attach(
    code: string,
    info: {
      tournamentId: number;
      matchId: number;
      entrantAKey: string;
      entrantBKey: string;
      regulationTossups: number;
    },
  ): Promise<void>;
}

/**
 * The storage shape bracket endpoints need. Production is `d1BracketStore()`;
 * tests pass a plain in-memory shim.
 */
export interface BracketStore {
  getConfig(tournamentId: number): Promise<BracketConfigRow | null>;
  createConfig(row: BracketConfigRow): Promise<void>;
  createMatches(rows: ReadonlyArray<NewBracketMatch>): Promise<void>;
  listMatches(tournamentId: number): Promise<BracketMatchRow[]>;
  updateMatch(id: number, patch: MatchPatch): Promise<void>;
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

function seedingModeOf(v: unknown): SeedingMode {
  return v === 'elo' || v === 'manual' ? v : 'random';
}

function advanceModeOf(v: unknown): AdvanceMode {
  return v === 'manual' ? 'manual' : 'auto';
}

function matchStateOf(v: unknown): MatchState {
  return v === 'ready' || v === 'awaiting_confirm' || v === 'finished' ? v : 'pending';
}

function rowToConfig(row: Record<string, unknown>): BracketConfigRow {
  return {
    tournamentId: num(row.tournament_id),
    seedingMode: seedingModeOf(row.seeding_mode),
    advanceMode: advanceModeOf(row.advance_mode),
    eloMin: numOrNull(row.elo_min),
    eloMax: numOrNull(row.elo_max),
    regulationTossups: row.regulation_tossups == null ? REGULATION_TOSSUPS_DEFAULT : num(row.regulation_tossups),
    createdAt: num(row.created_at),
  };
}

function rowToMatch(row: Record<string, unknown>): BracketMatchRow {
  return {
    id: num(row.id),
    tournamentId: num(row.tournament_id),
    round: num(row.round),
    slot: num(row.slot),
    entrantAKey: strOrNull(row.entrant_a_key),
    entrantALabel: strOrNull(row.entrant_a_label),
    entrantBKey: strOrNull(row.entrant_b_key),
    entrantBLabel: strOrNull(row.entrant_b_label),
    winnerKey: strOrNull(row.winner_key),
    state: matchStateOf(row.state),
    createdAt: num(row.created_at),
    finishedAt: numOrNull(row.finished_at),
    roomCode: strOrNull(row.room_code),
  };
}

/** Builds a BracketStore around a Cloudflare D1Database. */
export function d1BracketStore(db: D1Database): BracketStore {
  return {
    async getConfig(tournamentId) {
      const row = await db
        .prepare(
          `SELECT tournament_id, seeding_mode, advance_mode, elo_min, elo_max,
                  regulation_tossups, created_at
             FROM tournament_brackets WHERE tournament_id = ?`,
        )
        .bind(tournamentId)
        .first<Record<string, unknown>>();
      return row ? rowToConfig(row) : null;
    },

    async createConfig(c) {
      await db
        .prepare(
          `INSERT INTO tournament_brackets
             (tournament_id, seeding_mode, advance_mode, elo_min, elo_max, regulation_tossups, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(c.tournamentId, c.seedingMode, c.advanceMode, c.eloMin, c.eloMax, c.regulationTossups, c.createdAt)
        .run();
    },

    async createMatches(rows) {
      for (const r of rows) {
        await db
          .prepare(
            `INSERT INTO bracket_matches
               (tournament_id, round, slot, entrant_a_key, entrant_a_label,
                entrant_b_key, entrant_b_label, winner_key, state, created_at, finished_at, room_code)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            r.tournamentId,
            r.round,
            r.slot,
            r.entrantAKey,
            r.entrantALabel,
            r.entrantBKey,
            r.entrantBLabel,
            r.winnerKey,
            r.state,
            r.createdAt,
            r.finishedAt,
            r.roomCode,
          )
          .run();
      }
    },

    async listMatches(tournamentId) {
      const res = await db
        .prepare(
          `SELECT id, tournament_id, round, slot, entrant_a_key, entrant_a_label,
                  entrant_b_key, entrant_b_label, winner_key, state, created_at, finished_at,
                  room_code
             FROM bracket_matches
             WHERE tournament_id = ?
             ORDER BY round ASC, slot ASC`,
        )
        .bind(tournamentId)
        .all<Record<string, unknown>>();
      const rows = res.results ?? [];
      return rows.map(rowToMatch);
    },

    async updateMatch(id, patch) {
      const sets: string[] = [];
      const values: unknown[] = [];
      if ('entrantAKey' in patch) {
        sets.push('entrant_a_key = ?');
        values.push(patch.entrantAKey ?? null);
      }
      if ('entrantALabel' in patch) {
        sets.push('entrant_a_label = ?');
        values.push(patch.entrantALabel ?? null);
      }
      if ('entrantBKey' in patch) {
        sets.push('entrant_b_key = ?');
        values.push(patch.entrantBKey ?? null);
      }
      if ('entrantBLabel' in patch) {
        sets.push('entrant_b_label = ?');
        values.push(patch.entrantBLabel ?? null);
      }
      if ('winnerKey' in patch) {
        sets.push('winner_key = ?');
        values.push(patch.winnerKey ?? null);
      }
      if ('state' in patch) {
        sets.push('state = ?');
        values.push(patch.state);
      }
      if ('finishedAt' in patch) {
        sets.push('finished_at = ?');
        values.push(patch.finishedAt ?? null);
      }
      if ('roomCode' in patch) {
        sets.push('room_code = ?');
        values.push(patch.roomCode ?? null);
      }
      if (sets.length === 0) return;
      values.push(id);
      await db
        .prepare(`UPDATE bracket_matches SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run();
    },
  };
}

// ---------------------------------------------------------------------------
// Seeding math (pure)
// ---------------------------------------------------------------------------

/** Smallest power of two that is >= n. Callers must pass n >= 1. */
export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * The standard single-elimination seeding order: for a bracket of `size`
 * (a power of two) returns the seed numbers in left-to-right bracket
 * position, so that adjacent pairs — (result[0],result[1]), (result[2],
 * result[3]), ... — are exactly the round-1 matchups. Seed 1 always lands
 * opposite the lowest seed, and upsets stay spread across the tree rather
 * than bunching in one half.
 */
export function seedOrder(size: number): number[] {
  if (size <= 1) return [1];
  const prev = seedOrder(size / 2);
  const out: number[] = [];
  for (const s of prev) {
    out.push(s);
    out.push(size + 1 - s);
  }
  return out;
}

export interface Entrant {
  /** `u:<userId>` for a solo entrant, `t:<team name>` for a team. */
  key: string;
  label: string;
  memberUserIds: number[];
  /** 1 = best. Set by `orderEntrants`; 0 until then. */
  seed: number;
}

/** Groups joined players into entrants by team (empty team = solo). */
export function buildEntrants(
  players: ReadonlyArray<TournamentPlayerRow>,
  usernameOf: (userId: number) => string,
): Entrant[] {
  const byTeam = new Map<string, Entrant>();
  for (const p of players) {
    const key = p.team.trim() ? `t:${p.team.trim()}` : `u:${p.userId}`;
    const existing = byTeam.get(key);
    if (existing) {
      existing.memberUserIds.push(p.userId);
    } else {
      byTeam.set(key, {
        key,
        label: p.team.trim() || usernameOf(p.userId),
        memberUserIds: [p.userId],
        seed: 0,
      });
    }
  }
  return [...byTeam.values()];
}

/**
 * Assigns seed 1..n to each entrant per the tournament's seeding mode.
 * `effectiveElo` only needs entries for 'elo' mode; `manualOrder` (a list of
 * entrant keys, best first) is required for 'manual' mode and must be an
 * exact permutation of the entrants' keys.
 */
export function orderEntrants(
  entrants: ReadonlyArray<Entrant>,
  mode: SeedingMode,
  effectiveElo: ReadonlyMap<string, number>,
  manualOrder: readonly string[] | null,
  rng: () => number = Math.random,
): Entrant[] {
  if (mode === 'manual') {
    if (!manualOrder || manualOrder.length !== entrants.length) {
      throw new Error('manual_seeds must list every entrant exactly once');
    }
    const byKey = new Map(entrants.map((e) => [e.key, e]));
    const ordered: Entrant[] = [];
    for (const key of manualOrder) {
      const e = byKey.get(key);
      if (!e) throw new Error(`manual_seeds references unknown entrant "${key}"`);
      byKey.delete(key);
      ordered.push(e);
    }
    if (byKey.size > 0) {
      throw new Error('manual_seeds must list every entrant exactly once');
    }
    return ordered.map((e, i) => ({ ...e, seed: i + 1 }));
  }

  if (mode === 'elo') {
    const sorted = [...entrants].sort((a, b) => {
      const diff = (effectiveElo.get(b.key) ?? 0) - (effectiveElo.get(a.key) ?? 0);
      return diff !== 0 ? diff : a.key.localeCompare(b.key);
    });
    return sorted.map((e, i) => ({ ...e, seed: i + 1 }));
  }

  // Fisher-Yates with an injectable RNG so tests can make it deterministic.
  const shuffled = [...entrants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = shuffled[i];
    const b = shuffled[j];
    if (a && b) {
      shuffled[i] = b;
      shuffled[j] = a;
    }
  }
  return shuffled.map((e, i) => ({ ...e, seed: i + 1 }));
}

/**
 * The average member ELO for each entrant (teams average their members;
 * a solo entrant is just that player's rating). Used for 'elo' seeding and
 * for the elo_min/elo_max gate. Team ELO itself is not tracked (deferred per
 * the brief) — this is purely a seeding-time snapshot.
 */
export async function effectiveEloFor(
  ratingStore: RatingStore,
  entrants: ReadonlyArray<Entrant>,
  now: number,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const e of entrants) {
    let sum = 0;
    for (const uid of e.memberUserIds) {
      sum += (await ratingOrDefault(ratingStore, uid, now)).elo;
    }
    out.set(e.key, Math.round(sum / e.memberUserIds.length));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bracket generation
// ---------------------------------------------------------------------------

export interface GeneratedBracket {
  matches: NewBracketMatch[];
  totalRounds: number;
}

/**
 * Builds every round's match rows for a seeded entrant list. Round 1 is
 * filled in (with byes for seeds beyond `entrants.length`); rounds 2.. start
 * as empty placeholders that `resolveByesAndPropagate` / match results fill
 * in later. Byes in round 1 are pre-resolved here (winner + state set) so
 * the caller only has to propagate them once the rows have real ids.
 */
export function generateBracket(
  entrants: ReadonlyArray<Entrant>,
  tournamentId: number,
  now: number,
): GeneratedBracket {
  const n = entrants.length;
  const bracketSize = nextPowerOfTwo(n);
  const totalRounds = Math.max(1, Math.round(Math.log2(bracketSize)));
  const bySeed = new Map(entrants.map((e) => [e.seed, e]));
  const order = seedOrder(bracketSize);

  const matches: NewBracketMatch[] = [];

  // Round 1: pair up adjacent entries from the seed order.
  const round1Count = bracketSize / 2;
  for (let slot = 0; slot < round1Count; slot++) {
    const seedA = order[slot * 2];
    const seedB = order[slot * 2 + 1];
    const a = seedA !== undefined ? bySeed.get(seedA) ?? null : null;
    const b = seedB !== undefined ? bySeed.get(seedB) ?? null : null;
    const isBye = a !== null && b === null;
    matches.push({
      tournamentId,
      round: 1,
      slot,
      entrantAKey: a?.key ?? null,
      entrantALabel: a?.label ?? null,
      entrantBKey: b?.key ?? null,
      entrantBLabel: b?.label ?? null,
      winnerKey: isBye ? a.key : null,
      state: isBye ? 'finished' : a && b ? 'ready' : 'pending',
      createdAt: now,
      finishedAt: isBye ? now : null,
      roomCode: null,
    });
  }

  // Rounds 2..totalRounds: empty placeholders, halving each round.
  for (let round = 2; round <= totalRounds; round++) {
    const count = bracketSize / 2 ** round;
    for (let slot = 0; slot < count; slot++) {
      matches.push({
        tournamentId,
        round,
        slot,
        entrantAKey: null,
        entrantALabel: null,
        entrantBKey: null,
        entrantBLabel: null,
        winnerKey: null,
        state: 'pending',
        createdAt: now,
        finishedAt: null,
        roomCode: null,
      });
    }
  }

  return { matches, totalRounds };
}

/**
 * Fills the next round's slot with a match's winner. No-op if `round` is the
 * final round (there is nothing to advance to — the match itself is the
 * champion). Mutates nothing; returns the patch to apply to the next match,
 * or null.
 */
export function nextSlotPatch(
  round: number,
  slot: number,
  totalRounds: number,
  winnerKey: string,
  winnerLabel: string,
  nextMatch: BracketMatchRow,
): MatchPatch | null {
  if (round >= totalRounds) return null;
  const isA = slot % 2 === 0;
  const patch: MatchPatch = isA
    ? { entrantAKey: winnerKey, entrantALabel: winnerLabel }
    : { entrantBKey: winnerKey, entrantBLabel: winnerLabel };
  const otherFilled = isA ? nextMatch.entrantBKey !== null : nextMatch.entrantAKey !== null;
  if (otherFilled) patch.state = 'ready';
  return patch;
}

// ---------------------------------------------------------------------------
// Response shapes & endpoints
// ---------------------------------------------------------------------------

export interface BracketMatchPublic {
  id: number;
  round: number;
  slot: number;
  entrant_a: { key: string; label: string } | null;
  entrant_b: { key: string; label: string } | null;
  winner_key: string | null;
  state: MatchState;
  room_code: string | null;
}

export interface BracketPublic {
  seeding_mode: SeedingMode;
  advance_mode: AdvanceMode;
  elo_min: number | null;
  elo_max: number | null;
  regulation_tossups: number;
  rounds: Array<{ round: number; matches: BracketMatchPublic[] }>;
}

function toMatchPublic(m: BracketMatchRow): BracketMatchPublic {
  return {
    id: m.id,
    round: m.round,
    slot: m.slot,
    entrant_a: m.entrantAKey ? { key: m.entrantAKey, label: m.entrantALabel ?? '' } : null,
    entrant_b: m.entrantBKey ? { key: m.entrantBKey, label: m.entrantBLabel ?? '' } : null,
    winner_key: m.winnerKey,
    state: m.state,
    room_code: m.roomCode,
  };
}

function toBracketPublic(config: BracketConfigRow, matches: BracketMatchRow[]): BracketPublic {
  const byRound = new Map<number, BracketMatchPublic[]>();
  for (const m of matches) {
    const list = byRound.get(m.round) ?? [];
    list.push(toMatchPublic(m));
    byRound.set(m.round, list);
  }
  const rounds = [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, ms]) => ({ round, matches: ms.sort((a, b) => a.slot - b.slot) }));
  return {
    seeding_mode: config.seedingMode,
    advance_mode: config.advanceMode,
    elo_min: config.eloMin,
    elo_max: config.eloMax,
    regulation_tossups: config.regulationTossups,
    rounds,
  };
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

async function canManage(
  authStore: AuthStore,
  request: Request,
  ctx: RequestContext,
  tournamentCreatedBy: number,
): Promise<{ ok: true; userId: number } | { ok: false; response: Response }> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return { ok: false, response: json({ error: 'not signed in' }, 401) };
  if (me.role !== 'admin' && me.id !== tournamentCreatedBy) {
    return { ok: false, response: json({ error: 'only the TD or an admin can manage the bracket' }, 403) };
  }
  return { ok: true, userId: me.id };
}

interface CreateBracketBody {
  seeding_mode?: unknown;
  advance_mode?: unknown;
  elo_min?: unknown;
  elo_max?: unknown;
  manual_seeds?: unknown;
  regulation_tossups?: unknown;
}

async function handleCreateBracket(
  request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  bStore: BracketStore,
  ratingStore: RatingStore,
  ctx: RequestContext,
  tournamentId: number,
): Promise<Response> {
  const t = await tStore.findTournament(tournamentId);
  if (!t) return json({ error: 'not found' }, 404);

  const auth = await canManage(authStore, request, ctx, t.createdBy);
  if (!auth.ok) return auth.response;

  if (t.state !== 'open') {
    return json({ error: 'the bracket can only be seeded while the tournament is open' }, 400);
  }
  const existing = await bStore.getConfig(tournamentId);
  if (existing) return json({ error: 'this tournament already has a bracket' }, 409);

  const body = (await readBody<CreateBracketBody>(request)) ?? {};
  const seedingMode = seedingModeOf(body.seeding_mode);
  const advanceMode = advanceModeOf(body.advance_mode);
  const eloMin = body.elo_min == null || body.elo_min === '' ? null : Number(body.elo_min);
  const eloMax = body.elo_max == null || body.elo_max === '' ? null : Number(body.elo_max);
  if (eloMin !== null && !Number.isFinite(eloMin)) {
    return json({ error: 'elo_min must be a number' }, 400);
  }
  if (eloMax !== null && !Number.isFinite(eloMax)) {
    return json({ error: 'elo_max must be a number' }, 400);
  }
  const rawRegulation = body.regulation_tossups;
  const regulationTossups =
    rawRegulation == null || rawRegulation === '' ? REGULATION_TOSSUPS_DEFAULT : Number(rawRegulation);
  if (
    !Number.isInteger(regulationTossups) ||
    regulationTossups < REGULATION_TOSSUPS_MIN ||
    regulationTossups > REGULATION_TOSSUPS_MAX
  ) {
    return json(
      { error: `regulation_tossups must be an integer from ${REGULATION_TOSSUPS_MIN} to ${REGULATION_TOSSUPS_MAX}` },
      400,
    );
  }

  const players = await tStore.listPlayers(tournamentId);
  const usernames = new Map<number, string>();
  for (const p of players) {
    if (!usernames.has(p.userId)) {
      const u = await authStore.findUserById(p.userId);
      usernames.set(p.userId, u ? u.username : `#${p.userId}`);
    }
  }
  const entrants = buildEntrants(players, (uid) => usernames.get(uid) ?? `#${uid}`);
  if (entrants.length < 2) {
    return json({ error: 'need at least 2 entrants to seed a bracket' }, 400);
  }

  const effectiveElo = await effectiveEloFor(ratingStore, entrants, ctx.now);

  if (eloMin !== null || eloMax !== null) {
    const offenders = entrants.filter((e) => {
      const elo = effectiveElo.get(e.key) ?? 0;
      return (eloMin !== null && elo < eloMin) || (eloMax !== null && elo > eloMax);
    });
    if (offenders.length > 0) {
      return json(
        {
          error: `entrants outside the ELO band: ${offenders.map((o) => o.label).join(', ')}`,
        },
        400,
      );
    }
  }

  let manualOrder: string[] | null = null;
  if (seedingMode === 'manual') {
    if (!Array.isArray(body.manual_seeds)) {
      return json({ error: 'manual_seeds array is required for manual seeding' }, 400);
    }
    manualOrder = body.manual_seeds.filter((k): k is string => typeof k === 'string');
    if (manualOrder.length !== body.manual_seeds.length) {
      return json({ error: 'manual_seeds must be an array of entrant keys' }, 400);
    }
  }

  let seeded: Entrant[];
  try {
    seeded = orderEntrants(entrants, seedingMode, effectiveElo, manualOrder);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'invalid seeding' }, 400);
  }

  const { matches } = generateBracket(seeded, tournamentId, ctx.now);
  await bStore.createConfig({
    tournamentId,
    seedingMode,
    advanceMode,
    eloMin,
    eloMax,
    regulationTossups,
    createdAt: ctx.now,
  });
  await bStore.createMatches(matches);

  // Propagate any round-1 byes now that the rows have real ids.
  const all = await bStore.listMatches(tournamentId);
  const byRoundSlot = new Map(all.map((m) => [`${m.round}:${m.slot}`, m]));
  const { totalRounds } = generateBracket(seeded, tournamentId, ctx.now);
  for (const m of all) {
    if (m.round !== 1 || m.state !== 'finished' || !m.winnerKey) continue;
    const winnerLabel = m.entrantAKey === m.winnerKey ? m.entrantALabel : m.entrantBLabel;
    const nextRound = m.round + 1;
    const nextSlot = Math.floor(m.slot / 2);
    const next = byRoundSlot.get(`${nextRound}:${nextSlot}`);
    if (!next) continue;
    const patch = nextSlotPatch(m.round, m.slot, totalRounds, m.winnerKey, winnerLabel ?? '', next);
    if (patch) {
      await bStore.updateMatch(next.id, patch);
      Object.assign(next, patch);
    }
  }

  const config = await bStore.getConfig(tournamentId);
  const finalMatches = await bStore.listMatches(tournamentId);
  if (!config) return json({ error: 'internal' }, 500);
  return json({ bracket: toBracketPublic(config, finalMatches) }, 200);
}

async function handleGetBracket(
  tStore: TournamentStore,
  bStore: BracketStore,
  tournamentId: number,
): Promise<Response> {
  const t = await tStore.findTournament(tournamentId);
  if (!t) return json({ error: 'not found' }, 404);
  const config = await bStore.getConfig(tournamentId);
  if (!config) return json({ error: 'this tournament has no bracket' }, 404);
  const matches = await bStore.listMatches(tournamentId);
  return json({ bracket: toBracketPublic(config, matches) });
}

/**
 * Records a match's winner and, per `advanceMode`, either propagates it to
 * the next round immediately ('auto') or parks it in 'awaiting_confirm' for
 * the TD to confirm ('manual'). Exported so a future H2H match room can call
 * this directly once a live match resolves, instead of only via HTTP.
 *
 * Rated ELO is only applied for a solo-vs-solo match (both entrants have
 * exactly one member) — team ELO is deferred per the brief, and this is the
 * one place a bracket match result becomes a rated outcome.
 */
export async function recordBracketMatchResult(
  bStore: BracketStore,
  ratingStore: RatingStore,
  tournamentId: number,
  matchId: number,
  winnerKey: string,
  now: number,
): Promise<{ ok: true; match: BracketMatchRow } | { ok: false; error: string }> {
  const matches = await bStore.listMatches(tournamentId);
  const match = matches.find((m) => m.id === matchId);
  if (!match) return { ok: false, error: 'match not found' };
  if (match.state !== 'ready') {
    return { ok: false, error: `match is not ready (state: ${match.state})` };
  }
  if (winnerKey !== match.entrantAKey && winnerKey !== match.entrantBKey) {
    return { ok: false, error: 'winner_key must be one of this match\'s entrants' };
  }

  const config = await bStore.getConfig(tournamentId);
  const advanceMode = config?.advanceMode ?? 'auto';
  const nextState: MatchState = advanceMode === 'manual' ? 'awaiting_confirm' : 'finished';

  await bStore.updateMatch(match.id, { winnerKey, state: nextState, finishedAt: now });
  const updated: BracketMatchRow = { ...match, winnerKey, state: nextState, finishedAt: now };

  if (nextState === 'finished') {
    await propagateAndRate(bStore, ratingStore, matches, updated, now);
  }
  return { ok: true, match: updated };
}

/** Confirms a match parked in 'awaiting_confirm' (manual advance mode). */
export async function confirmBracketMatch(
  bStore: BracketStore,
  ratingStore: RatingStore,
  tournamentId: number,
  matchId: number,
  now: number,
): Promise<{ ok: true; match: BracketMatchRow } | { ok: false; error: string }> {
  const matches = await bStore.listMatches(tournamentId);
  const match = matches.find((m) => m.id === matchId);
  if (!match) return { ok: false, error: 'match not found' };
  if (match.state !== 'awaiting_confirm') {
    return { ok: false, error: `match is not awaiting confirmation (state: ${match.state})` };
  }
  await bStore.updateMatch(match.id, { state: 'finished' });
  const updated: BracketMatchRow = { ...match, state: 'finished' };
  await propagateAndRate(bStore, ratingStore, matches, updated, now);
  return { ok: true, match: updated };
}

async function propagateAndRate(
  bStore: BracketStore,
  ratingStore: RatingStore,
  allMatches: BracketMatchRow[],
  finished: BracketMatchRow,
  now: number,
): Promise<void> {
  if (!finished.winnerKey) return;
  const totalRounds = Math.max(...allMatches.map((m) => m.round));
  const nextRound = finished.round + 1;
  const nextSlot = Math.floor(finished.slot / 2);
  const next = allMatches.find((m) => m.round === nextRound && m.slot === nextSlot);
  const winnerLabel =
    finished.entrantAKey === finished.winnerKey ? finished.entrantALabel : finished.entrantBLabel;
  if (next) {
    const patch = nextSlotPatch(
      finished.round,
      finished.slot,
      totalRounds,
      finished.winnerKey,
      winnerLabel ?? '',
      next,
    );
    if (patch) await bStore.updateMatch(next.id, patch);
  }

  // Rate the match if it was a genuine solo 1v1 — never for a bye (one side
  // null) and never for a team match (team ELO is deferred).
  const aKey = finished.entrantAKey;
  const bKey = finished.entrantBKey;
  if (!aKey || !bKey) return;
  const soloUserId = (key: string): number | null => {
    const m = /^u:(\d+)$/.exec(key);
    return m && m[1] !== undefined ? Number(m[1]) : null;
  };
  const aUser = soloUserId(aKey);
  const bUser = soloUserId(bKey);
  if (aUser === null || bUser === null) return;
  const winnerUser = finished.winnerKey === aKey ? aUser : bUser;
  const loserUser = finished.winnerKey === aKey ? bUser : aUser;
  await recordMatchResult(ratingStore, winnerUser, loserUser, now);
}

interface ResultBody {
  winner_key?: unknown;
}

async function handleRecordResult(
  request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  bStore: BracketStore,
  ratingStore: RatingStore,
  ctx: RequestContext,
  tournamentId: number,
  matchId: number,
): Promise<Response> {
  const t = await tStore.findTournament(tournamentId);
  if (!t) return json({ error: 'not found' }, 404);
  const auth = await canManage(authStore, request, ctx, t.createdBy);
  if (!auth.ok) return auth.response;

  const body = await readBody<ResultBody>(request);
  const winnerKey = typeof body?.winner_key === 'string' ? body.winner_key : '';
  if (!winnerKey) return json({ error: 'winner_key is required' }, 400);

  const result = await recordBracketMatchResult(
    bStore,
    ratingStore,
    tournamentId,
    matchId,
    winnerKey,
    ctx.now,
  );
  if (!result.ok) return json({ error: result.error }, 400);
  return json({ match: toMatchPublic(result.match) }, 200);
}

async function handleConfirm(
  request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  bStore: BracketStore,
  ratingStore: RatingStore,
  ctx: RequestContext,
  tournamentId: number,
  matchId: number,
): Promise<Response> {
  const t = await tStore.findTournament(tournamentId);
  if (!t) return json({ error: 'not found' }, 404);
  const auth = await canManage(authStore, request, ctx, t.createdBy);
  if (!auth.ok) return auth.response;

  const result = await confirmBracketMatch(bStore, ratingStore, tournamentId, matchId, ctx.now);
  if (!result.ok) return json({ error: result.error }, 400);
  return json({ match: toMatchPublic(result.match) }, 200);
}

/**
 * Resolves which side (if any) `userId` plays on for a match's entrant. Solo
 * entrants (`u:<id>`) compare directly; team entrants (`t:<name>`) check
 * current tournament_players rows for that exact team name, mirroring how
 * `buildEntrants` grouped them at seed time.
 */
async function sideFor(
  tStore: TournamentStore,
  tournamentId: number,
  match: BracketMatchRow,
  userId: number,
): Promise<'a' | 'b' | null> {
  const isMember = async (key: string | null): Promise<boolean> => {
    if (!key) return false;
    const solo = /^u:(\d+)$/.exec(key);
    if (solo && solo[1] !== undefined) return Number(solo[1]) === userId;
    const team = /^t:(.+)$/.exec(key);
    if (!team || team[1] === undefined) return false;
    const players = await tStore.listPlayers(tournamentId);
    return players.some((p) => p.userId === userId && p.team.trim() === team[1]);
  };
  if (await isMember(match.entrantAKey)) return 'a';
  if (await isMember(match.entrantBKey)) return 'b';
  return null;
}

interface OpenRoomResult {
  room_code: string;
  side: 'a' | 'b' | null;
}

async function handleOpenMatchRoom(
  request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  bStore: BracketStore,
  opener: MatchRoomOpener,
  ctx: RequestContext,
  tournamentId: number,
  matchId: number,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);

  const t = await tStore.findTournament(tournamentId);
  if (!t) return json({ error: 'not found' }, 404);

  const matches = await bStore.listMatches(tournamentId);
  const match = matches.find((m) => m.id === matchId);
  if (!match) return json({ error: 'match not found' }, 404);

  const side = await sideFor(tStore, tournamentId, match, me.id);
  const isTd = me.role === 'admin' || me.id === t.createdBy;
  if (side === null && !isTd) {
    return json({ error: 'only match participants or the TD can open this room' }, 403);
  }
  if (match.state !== 'ready') {
    return json({ error: `match is not ready to play (state: ${match.state})` }, 400);
  }

  if (match.roomCode) {
    const result: OpenRoomResult = { room_code: match.roomCode, side };
    return json(result, 200);
  }
  if (!match.entrantAKey || !match.entrantBKey) {
    return json({ error: 'match has no entrants yet' }, 400);
  }

  const config = await bStore.getConfig(tournamentId);
  const regulationTossups = config?.regulationTossups ?? REGULATION_TOSSUPS_DEFAULT;
  const code = makeRoomCode();
  await bStore.updateMatch(match.id, { roomCode: code });
  await opener.attach(code, {
    tournamentId,
    matchId,
    entrantAKey: match.entrantAKey,
    entrantBKey: match.entrantBKey,
    regulationTossups,
  });

  const result: OpenRoomResult = { room_code: code, side };
  return json(result, 200);
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
 * Handles /api/tournaments/:id/bracket[...]. Returns null for anything else
 * so the caller falls through — crucially, mounted ahead of
 * handleTournaments, which would otherwise 404 these deeper paths itself.
 */
const NOOP_ROOM_OPENER: MatchRoomOpener = {
  async attach() {
    /* no-op default for callers (mainly tests) that don't need real rooms */
  },
};

export async function handleBrackets(
  request: Request,
  authStore: AuthStore,
  tStore: TournamentStore,
  bStore: BracketStore,
  ratingStore: RatingStore,
  ctx: RequestContext,
  opener: MatchRoomOpener = NOOP_ROOM_OPENER,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/tournaments/')) return null;

  const rest = path.slice('/api/tournaments/'.length);
  const parts = rest.split('/');
  const [idRaw, section, sub, matchIdRaw, action, ...more] = parts;
  if (section !== 'bracket') return null;
  const tournamentId = parseId(idRaw ?? '');
  if (tournamentId === null) return json({ error: 'not found' }, 404);

  if (sub === undefined) {
    if (request.method === 'GET') return handleGetBracket(tStore, bStore, tournamentId);
    if (request.method === 'POST') {
      return handleCreateBracket(request, authStore, tStore, bStore, ratingStore, ctx, tournamentId);
    }
    return json({ error: 'method not allowed' }, 405);
  }

  if (sub === 'matches' && matchIdRaw !== undefined && action !== undefined && more.length === 0) {
    const matchId = parseId(matchIdRaw);
    if (matchId === null) return json({ error: 'not found' }, 404);
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    if (action === 'result') {
      return handleRecordResult(request, authStore, tStore, bStore, ratingStore, ctx, tournamentId, matchId);
    }
    if (action === 'confirm') {
      return handleConfirm(request, authStore, tStore, bStore, ratingStore, ctx, tournamentId, matchId);
    }
    if (action === 'room') {
      return handleOpenMatchRoom(request, authStore, tStore, bStore, opener, ctx, tournamentId, matchId);
    }
  }

  return json({ error: 'not found' }, 404);
}
