/**
 * Individual ELO ratings and the feudal rank system built on top of them.
 *
 * One shared ELO pool covers public Quick Play and official tournaments (see
 * the Tournaments v2 grill brief); team ELO is deferred. A user with no
 * `player_ratings` row is simply unrated at the start value — the row is
 * created lazily by `recordMatchResult` the first time they finish a rated
 * match, so browsing profiles never writes rows for people who never play.
 *
 * Rank tiers are a pure function of ELO (`tierForElo`), except for the God
 * rank, which is positional: whoever sits at #1 on the leaderboard wears it,
 * no matter their tier underneath. That is why `toRankInfo` needs to know
 * whether its subject is currently #1 rather than being derivable from ELO
 * alone.
 */

import { requireUser, type AuthStore, type RequestContext } from './auth';

// ---------------------------------------------------------------------------
// ELO
// ---------------------------------------------------------------------------

export const ELO_START = 400;
export const ELO_K = 53;
export const ELO_FLOOR = 100;

export interface RatingRow {
  userId: number;
  elo: number;
  wins: number;
  losses: number;
  updatedAt: number;
}

/**
 * The storage shape the ratings endpoints need. The production implementation
 * is built from a D1Database with `d1RatingStore()`; tests pass a plain
 * in-memory map.
 */
export interface RatingStore {
  getRating(userId: number): Promise<RatingRow | null>;
  upsertRating(row: RatingRow): Promise<void>;
  /** Top N by ELO descending, for the leaderboard and the God check. */
  listTop(limit: number): Promise<RatingRow[]>;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowToRating(row: Record<string, unknown>): RatingRow {
  return {
    userId: num(row.user_id),
    elo: num(row.elo),
    wins: num(row.wins),
    losses: num(row.losses),
    updatedAt: num(row.updated_at),
  };
}

/** Builds a RatingStore around a Cloudflare D1Database. */
export function d1RatingStore(db: D1Database): RatingStore {
  return {
    async getRating(userId) {
      const row = await db
        .prepare(
          `SELECT user_id, elo, wins, losses, updated_at
             FROM player_ratings WHERE user_id = ?`,
        )
        .bind(userId)
        .first<Record<string, unknown>>();
      return row ? rowToRating(row) : null;
    },

    async upsertRating(r) {
      await db
        .prepare(
          `INSERT INTO player_ratings (user_id, elo, wins, losses, updated_at)
             VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET
             elo = excluded.elo,
             wins = excluded.wins,
             losses = excluded.losses,
             updated_at = excluded.updated_at`,
        )
        .bind(r.userId, r.elo, r.wins, r.losses, r.updatedAt)
        .run();
    },

    async listTop(limit) {
      const res = await db
        .prepare(
          `SELECT user_id, elo, wins, losses, updated_at
             FROM player_ratings
             ORDER BY elo DESC, user_id ASC
             LIMIT ?`,
        )
        .bind(limit)
        .all<Record<string, unknown>>();
      const rows = res.results ?? [];
      return rows.map(rowToRating);
    },
  };
}

function defaultRating(userId: number, now: number): RatingRow {
  return { userId, elo: ELO_START, wins: 0, losses: 0, updatedAt: now };
}

/** The rating to show for a user who may never have played a rated match. */
export async function ratingOrDefault(
  store: RatingStore,
  userId: number,
  now: number,
): Promise<RatingRow> {
  const row = await store.getRating(userId);
  return row ?? defaultRating(userId, now);
}

/**
 * One rated result between two individuals: `winnerId` beat `loserId`
 * (draws are not modelled — quizbowl matches always resolve to a winner).
 * Both rows are created on first use at ELO_START. Returns the updated rows
 * so the caller (a future H2H match room / Quick Play endpoint) can report
 * the delta to both players.
 */
export async function recordMatchResult(
  store: RatingStore,
  winnerId: number,
  loserId: number,
  now: number,
): Promise<{ winner: RatingRow; loser: RatingRow }> {
  const winnerBefore = await ratingOrDefault(store, winnerId, now);
  const loserBefore = await ratingOrDefault(store, loserId, now);

  const expectedWinner =
    1 / (1 + 10 ** ((loserBefore.elo - winnerBefore.elo) / 400));
  const expectedLoser = 1 - expectedWinner;

  const winnerElo = Math.max(
    ELO_FLOOR,
    Math.round(winnerBefore.elo + ELO_K * (1 - expectedWinner)),
  );
  const loserElo = Math.max(
    ELO_FLOOR,
    Math.round(loserBefore.elo + ELO_K * (0 - expectedLoser)),
  );

  const winner: RatingRow = {
    userId: winnerId,
    elo: winnerElo,
    wins: winnerBefore.wins + 1,
    losses: winnerBefore.losses,
    updatedAt: now,
  };
  const loser: RatingRow = {
    userId: loserId,
    elo: loserElo,
    wins: loserBefore.wins,
    losses: loserBefore.losses + 1,
    updatedAt: now,
  };

  await store.upsertRating(winner);
  await store.upsertRating(loser);
  return { winner, loser };
}

// ---------------------------------------------------------------------------
// Rank tiers
// ---------------------------------------------------------------------------

/** Lowest to highest. Index doubles as the tier's ELO band number. */
export const RANK_TIERS = [
  'Serf',
  'Peasant',
  'Squire',
  'Knight',
  'Baron',
  'Duke',
  'King',
] as const;
export type RankTier = (typeof RANK_TIERS)[number];

/** Each tier spans 500 ELO, split into 5 sub-ranks of 100 ELO each (5 = entry, 1 = best). */
export const TIER_WIDTH = 500;
export const SUBRANK_WIDTH = 100;
export const SUBRANKS_PER_TIER = TIER_WIDTH / SUBRANK_WIDTH;

export interface RankInfo {
  /** 'God' only for the #1 leaderboard spot; otherwise one of RANK_TIERS. */
  tier: RankTier | 'God';
  /** Sub-rank 5 (entry) to 1 (best) within the tier. Omitted for God. */
  subrank: number | null;
  /** e.g. "Knight 3", or "God" at the top. */
  label: string;
  isGod: boolean;
}

/** Pure ELO -> tier/sub-rank mapping. King has no ceiling; anything past its
 *  floor stays King 1 rather than inventing an eighth tier. */
export function tierForElo(eloRaw: number): { tier: RankTier; subrank: number } {
  const elo = Math.max(ELO_FLOOR, Math.floor(eloRaw));
  const offset = elo - ELO_FLOOR;
  const rawTierIndex = Math.floor(offset / TIER_WIDTH);
  const tierIndex = Math.min(rawTierIndex, RANK_TIERS.length - 1);
  const tierFloor = ELO_FLOOR + tierIndex * TIER_WIDTH;
  const withinTier = elo - tierFloor;
  const rawSubrank = SUBRANKS_PER_TIER - Math.floor(withinTier / SUBRANK_WIDTH);
  const subrank = Math.min(SUBRANKS_PER_TIER, Math.max(1, rawSubrank));
  const tier = RANK_TIERS[tierIndex] as RankTier;
  return { tier, subrank };
}

/** `isTopRank` is true for exactly one player: whoever is #1 on the leaderboard. */
export function toRankInfo(elo: number, isTopRank: boolean): RankInfo {
  if (isTopRank) {
    return { tier: 'God', subrank: null, label: 'God', isGod: true };
  }
  const { tier, subrank } = tierForElo(elo);
  return { tier, subrank, label: `${tier} ${subrank}`, isGod: false };
}

// ---------------------------------------------------------------------------
// Response shapes & endpoints
// ---------------------------------------------------------------------------

export interface RatingPublic {
  user_id: number;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  rank: {
    tier: string;
    subrank: number | null;
    label: string;
    is_god: boolean;
  };
}

async function usernameOf(authStore: AuthStore, id: number): Promise<string> {
  const u = await authStore.findUserById(id);
  return u ? u.username : '';
}

async function toPublic(
  authStore: AuthStore,
  row: RatingRow,
  isTopRank: boolean,
): Promise<RatingPublic> {
  const info = toRankInfo(row.elo, isTopRank);
  return {
    user_id: row.userId,
    username: await usernameOf(authStore, row.userId),
    elo: row.elo,
    wins: row.wins,
    losses: row.losses,
    rank: {
      tier: info.tier,
      subrank: info.subrank,
      label: info.label,
      is_god: info.isGod,
    },
  };
}

/** True if `userId` currently holds the single #1 leaderboard spot. */
async function isTopRankHolder(store: RatingStore, userId: number): Promise<boolean> {
  const top = await store.listTop(1);
  return top.length > 0 && top[0]?.userId === userId;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function handleMe(
  request: Request,
  authStore: AuthStore,
  store: RatingStore,
  ctx: RequestContext,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);
  const row = await ratingOrDefault(store, me.id, ctx.now);
  const isTop = await isTopRankHolder(store, me.id);
  return json({ rating: await toPublic(authStore, row, isTop) });
}

async function handleGetOne(
  authStore: AuthStore,
  store: RatingStore,
  ctx: RequestContext,
  userId: number,
): Promise<Response> {
  const row = await ratingOrDefault(store, userId, ctx.now);
  const isTop = await isTopRankHolder(store, userId);
  return json({ rating: await toPublic(authStore, row, isTop) });
}

export const LEADERBOARD_LIMIT_DEFAULT = 50;
export const LEADERBOARD_LIMIT_MAX = 200;

async function handleLeaderboard(
  request: Request,
  authStore: AuthStore,
  store: RatingStore,
): Promise<Response> {
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get('limit'));
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, LEADERBOARD_LIMIT_MAX)
      : LEADERBOARD_LIMIT_DEFAULT;
  const rows = await store.listTop(limit);
  const entries = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    entries.push({ ...(await toPublic(authStore, r, i === 0)), position: i + 1 });
  }
  return json({ leaderboard: entries });
}

function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Handles /api/ratings[/...] and /api/leaderboard. Returns null for anything
 * else so the caller falls through to its other routes.
 */
export async function handleRatings(
  request: Request,
  authStore: AuthStore,
  store: RatingStore,
  ctx: RequestContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/leaderboard') {
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
    return handleLeaderboard(request, authStore, store);
  }

  if (!path.startsWith('/api/ratings')) return null;

  if (path === '/api/ratings/me') {
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
    return handleMe(request, authStore, store, ctx);
  }

  const rest = path.slice('/api/ratings/'.length);
  const id = parseId(rest);
  if (id === null) return json({ error: 'not found' }, 404);
  if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
  return handleGetOne(authStore, store, ctx, id);
}
