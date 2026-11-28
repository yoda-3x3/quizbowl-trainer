/**
 * Per-category stats, category tags and the public profile.
 *
 * Stats come from the AttemptEvent log every practice mode already writes on
 * the client (src/engine/log.ts). A signed-in client uploads those events to
 * `POST /api/stats/attempts`; the server keeps one compact row per event in
 * `stat_attempts` (deduplicated on the event id) and recomputes the
 * per-(user, category) aggregate in `user_category_stats`. Tags are derived
 * from those aggregates here, on the server, so every client shows the same
 * tags and none can award itself one by editing local code.
 *
 * Routes (all mounted from index.ts):
 *   POST /api/stats/attempts   -> upload a batch of AttemptEvents (signed-in only)
 *   GET  /api/tags?ids=1,2,3    -> earned tags for up to 100 users (public)
 *   GET  /api/profile/:userId   -> public profile: nickname, rank, tags, category stats, recent activity
 *
 * ## Tag rules (documented in web/NOTES.md as well)
 *
 * A player "qualifies" in a category once they have heard at least
 * `TAG_MIN_HEARD` questions in it (tossups + bonus parts) AND either their
 * accuracy is at least `TAG_MIN_ACCURACY` or, over at least `TAG_MIN_HEARD`
 * tossups, their power rate (powers / tossups heard) is at least
 * `TAG_MIN_POWER_RATE`. Each tag in `CATEGORY_TAGS` lists the categories a
 * player must qualify in — "Philosopher" needs BOTH Fine Arts and Philosophy.
 * "Polymath" is earned by qualifying in `POLYMATH_MIN_CATEGORIES` or more.
 *
 * "#1 in <category>" goes to exactly one player per category: the
 * non-banned player with at least `TAG_MIN_HEARD` heard in it whose
 * `categoryScore` (accuracy + power rate) is highest; ties go to whoever has
 * heard more, then the lower user id. Nobody holds it until someone reaches
 * the minimum.
 */

import { requireUser, type AuthStore, type RequestContext } from './auth';
import { ratingOrDefault, toRankInfo, type RatingStore } from './ratings';
import { CATEGORIES, type Category } from '../../src/types';

// ---------------------------------------------------------------------------
// Thresholds and tag catalogue
// ---------------------------------------------------------------------------

export const TAG_MIN_HEARD = 20;
export const TAG_MIN_ACCURACY = 0.6;
export const TAG_MIN_POWER_RATE = 0.2;
export const POLYMATH_MIN_CATEGORIES = 5;

export interface CategoryTagDef {
  id: string;
  label: string;
  /** The player must qualify in EVERY category listed. */
  categories: Category[];
  description: string;
}

export const CATEGORY_TAGS: readonly CategoryTagDef[] = [
  {
    id: 'philosopher',
    label: 'Philosopher',
    categories: ['Fine Arts', 'Philosophy'],
    description: 'Strong in both Fine Arts and Philosophy',
  },
  { id: 'bard', label: 'Bard', categories: ['Literature'], description: 'Strong in Literature' },
  { id: 'chronicler', label: 'Chronicler', categories: ['History'], description: 'Strong in History' },
  { id: 'alchemist', label: 'Alchemist', categories: ['Science'], description: 'Strong in Science' },
  { id: 'oracle', label: 'Oracle', categories: ['Mythology'], description: 'Strong in Mythology' },
  { id: 'theologian', label: 'Theologian', categories: ['Religion'], description: 'Strong in Religion' },
  { id: 'cartographer', label: 'Cartographer', categories: ['Geography'], description: 'Strong in Geography' },
  { id: 'analyst', label: 'Analyst', categories: ['Social Science'], description: 'Strong in Social Science' },
  { id: 'herald', label: 'Herald', categories: ['Current Events'], description: 'Strong in Current Events' },
  { id: 'savant', label: 'Savant', categories: ['Other Academic'], description: 'Strong in Other Academic' },
  { id: 'trendsetter', label: 'Trendsetter', categories: ['Pop Culture'], description: 'Strong in Pop Culture' },
];

export type TagKind = 'category' | 'top' | 'meta';

export interface Tag {
  id: string;
  label: string;
  kind: TagKind;
  description: string;
  /** The categories the tag was earned in (one for `top`, none for `meta`). */
  categories: string[];
}

// ---------------------------------------------------------------------------
// Stats rows and derived metrics
// ---------------------------------------------------------------------------

export interface CategoryStatsRow {
  userId: number;
  category: string;
  heard: number;
  correct: number;
  tossups: number;
  powers: number;
  negs: number;
  buzzSum: number;
  buzzN: number;
  updatedAt: number;
}

export interface CategoryMetrics {
  category: string;
  heard: number;
  correct: number;
  tossups: number;
  powers: number;
  negs: number;
  /** correct / heard, 0..1. */
  accuracy: number;
  /** powers / tossups heard, 0..1. */
  power_rate: number;
  /** negs / tossups heard, 0..1. */
  neg_rate: number;
  /** Mean fraction of the question read at a correct tossup buzz, 0..1 (lower is earlier). Null with no correct buzzes. */
  avg_buzz: number | null;
}

function ratio(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export function metricsFor(row: CategoryStatsRow): CategoryMetrics {
  return {
    category: row.category,
    heard: row.heard,
    correct: row.correct,
    tossups: row.tossups,
    powers: row.powers,
    negs: row.negs,
    accuracy: round3(ratio(row.correct, row.heard)),
    power_rate: round3(ratio(row.powers, row.tossups)),
    neg_rate: round3(ratio(row.negs, row.tossups)),
    avg_buzz: row.buzzN > 0 ? round3(row.buzzSum / row.buzzN / 1000) : null,
  };
}

/** True when `row` clears the documented "strong in this category" bar. */
export function qualifies(row: CategoryStatsRow): boolean {
  if (row.heard < TAG_MIN_HEARD) return false;
  if (ratio(row.correct, row.heard) >= TAG_MIN_ACCURACY) return true;
  return row.tossups >= TAG_MIN_HEARD && ratio(row.powers, row.tossups) >= TAG_MIN_POWER_RATE;
}

/** Ranking score for "#1 in <category>": accuracy + power rate. */
export function categoryScore(row: CategoryStatsRow): number {
  return ratio(row.correct, row.heard) + ratio(row.powers, row.tossups);
}

/**
 * The single top player per category among `rows` (every user's aggregates).
 * Only rows with at least TAG_MIN_HEARD heard compete. Returns category ->
 * user id.
 */
export function topPerCategory(rows: CategoryStatsRow[]): Map<string, number> {
  const best = new Map<string, CategoryStatsRow>();
  for (const r of rows) {
    if (r.heard < TAG_MIN_HEARD) continue;
    const cur = best.get(r.category);
    if (!cur || beats(r, cur)) best.set(r.category, r);
  }
  const out = new Map<string, number>();
  for (const [cat, r] of best) out.set(cat, r.userId);
  return out;
}

function beats(a: CategoryStatsRow, b: CategoryStatsRow): boolean {
  const sa = categoryScore(a);
  const sb = categoryScore(b);
  if (sa !== sb) return sa > sb;
  if (a.heard !== b.heard) return a.heard > b.heard;
  return a.userId < b.userId;
}

/**
 * Tags for one user, given their own aggregates and the category -> #1 map.
 * Order: #1 tags first (rarest), then category tags in catalogue order, then
 * Polymath.
 */
export function computeTags(
  userId: number,
  own: CategoryStatsRow[],
  tops: Map<string, number>,
): Tag[] {
  const tags: Tag[] = [];
  for (const cat of CATEGORIES) {
    if (tops.get(cat) === userId) {
      tags.push({
        id: `top:${cat}`,
        label: `#1 in ${cat}`,
        kind: 'top',
        description: `Top player in ${cat}`,
        categories: [cat],
      });
    }
  }
  const strong = new Set(own.filter(qualifies).map((r) => r.category));
  for (const def of CATEGORY_TAGS) {
    if (def.categories.every((c) => strong.has(c))) {
      tags.push({
        id: def.id,
        label: def.label,
        kind: 'category',
        description: def.description,
        categories: [...def.categories],
      });
    }
  }
  if (strong.size >= POLYMATH_MIN_CATEGORIES) {
    tags.push({
      id: 'polymath',
      label: 'Polymath',
      kind: 'meta',
      description: `Strong in ${POLYMATH_MIN_CATEGORIES}+ categories`,
      categories: [],
    });
  }
  return tags;
}

// ---------------------------------------------------------------------------
// Uploaded attempts
// ---------------------------------------------------------------------------

export const SYNC_BATCH_MAX = 200;
/** Attempts dated further back than this are rejected as nonsense clocks. */
const MAX_AGE_MS = 5 * 365 * 24 * 60 * 60 * 1000;
const MODES = new Set(['tossup', 'bonus', 'oac', 'ear']);
const CATEGORY_SET = new Set<string>(CATEGORIES);

export interface StatAttemptRow {
  clientId: string;
  at: number;
  mode: string;
  category: string;
  correct: boolean;
  neg: boolean;
  powered: boolean;
  isTossup: boolean;
  buzzPermille: number | null;
  points: number;
}

function intOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

/**
 * Validates one uploaded AttemptEvent and reduces it to the compact row the
 * server keeps. Returns null for anything malformed. Answer and question text
 * are dropped on purpose: the server never needs them.
 */
export function toStatAttempt(raw: unknown, now: number): StatAttemptRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const clientId = typeof e.id === 'string' ? e.id.trim() : '';
  if (clientId.length === 0 || clientId.length > 80) return null;
  const mode = typeof e.mode === 'string' ? e.mode : '';
  if (!MODES.has(mode)) return null;
  const category = typeof e.category === 'string' ? e.category : '';
  if (!CATEGORY_SET.has(category)) return null;
  const at = typeof e.at === 'number' && Number.isFinite(e.at) ? Math.floor(e.at) : NaN;
  if (!Number.isFinite(at) || at > now + 60_000 || at < now - MAX_AGE_MS) return null;
  const points = intOrNull(e.points) ?? 0;
  const directive = e.directive;
  const correct = directive === 'accept' || (directive == null && points > 0);

  const isTossup = mode !== 'bonus';
  const totalWords = intOrNull(e.totalWords);
  const buzz = intOrNull(e.buzzWordIndex);
  const power = intOrNull(e.powerWordIndex);
  const neg = isTossup && !correct && points < 0;
  const powered =
    isTossup && correct && buzz !== null && power !== null && buzz >= 0 && buzz <= power;
  let buzzPermille: number | null = null;
  if (isTossup && correct && buzz !== null && totalWords !== null && totalWords > 0) {
    buzzPermille = Math.max(0, Math.min(1000, Math.round(((buzz + 1) / totalWords) * 1000)));
  }
  return {
    clientId,
    at: Math.min(at, now),
    mode,
    category,
    correct,
    neg,
    powered,
    isTossup,
    buzzPermille,
    points: Math.max(-1000, Math.min(1000, points)),
  };
}

export interface RecentAttempt {
  at: number;
  mode: string;
  category: string;
  correct: boolean;
  powered: boolean;
  neg: boolean;
  points: number;
}

export interface RecentMatch {
  id: number;
  finished_at: number;
  won: boolean;
  rated: boolean;
  opponent_id: number | null;
  opponent: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface ProfileStore {
  /** Inserts rows not already stored for this user, then refreshes the aggregates they touch. Returns how many were new. */
  recordAttempts(userId: number, rows: StatAttemptRow[], now: number): Promise<number>;
  categoryStats(userId: number): Promise<CategoryStatsRow[]>;
  categoryStatsFor(userIds: number[]): Promise<CategoryStatsRow[]>;
  /** Every non-banned user's aggregates with at least `minHeard` heard, for the #1 tags. */
  contenders(minHeard: number): Promise<CategoryStatsRow[]>;
  recentAttempts(userId: number, limit: number): Promise<RecentAttempt[]>;
  recentMatches(userId: number, limit: number): Promise<RecentMatch[]>;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowToStats(r: Record<string, unknown>): CategoryStatsRow {
  return {
    userId: num(r.user_id),
    category: String(r.category ?? ''),
    heard: num(r.heard),
    correct: num(r.correct),
    tossups: num(r.tossups),
    powers: num(r.powers),
    negs: num(r.negs),
    buzzSum: num(r.buzz_sum),
    buzzN: num(r.buzz_n),
    updatedAt: num(r.updated_at),
  };
}

const STATS_COLS =
  'user_id, category, heard, correct, tossups, powers, negs, buzz_sum, buzz_n, updated_at';

/** Builds a ProfileStore around a Cloudflare D1Database. */
export function d1ProfileStore(db: D1Database): ProfileStore {
  return {
    async recordAttempts(userId, rows, now) {
      if (rows.length === 0) return 0;
      // The whole batch goes in as one JSON parameter expanded by json_each,
      // so an upload costs two D1 queries however many events it carries
      // (D1's free plan caps queries per Worker invocation).
      const payload = JSON.stringify(
        rows.map((r) => [
          r.clientId,
          r.at,
          r.mode,
          r.category,
          r.correct ? 1 : 0,
          r.neg ? 1 : 0,
          r.powered ? 1 : 0,
          r.isTossup ? 1 : 0,
          r.buzzPermille,
          r.points,
        ]),
      );
      const categories = JSON.stringify([...new Set(rows.map((r) => r.category))]);
      const [ins] = await db.batch([
        db
          .prepare(
            `INSERT OR IGNORE INTO stat_attempts
               (user_id, client_id, at, mode, category, correct, neg, powered,
                is_tossup, buzz_permille, points, created_at)
             SELECT ?1, json_extract(value, '$[0]'), json_extract(value, '$[1]'),
                    json_extract(value, '$[2]'), json_extract(value, '$[3]'),
                    json_extract(value, '$[4]'), json_extract(value, '$[5]'),
                    json_extract(value, '$[6]'), json_extract(value, '$[7]'),
                    json_extract(value, '$[8]'), json_extract(value, '$[9]'), ?2
               FROM json_each(?3)`,
          )
          .bind(userId, now, payload),
        // Recompute (rather than increment) each touched category's aggregate
        // from the rows themselves, so the summary can never drift from what
        // is stored. A re-sent batch recomputes to the same numbers.
        db
          .prepare(
            `INSERT INTO user_category_stats (${STATS_COLS})
             SELECT user_id, category, COUNT(*), SUM(correct), SUM(is_tossup),
                    SUM(powered), SUM(neg),
                    COALESCE(SUM(buzz_permille), 0), COUNT(buzz_permille), ?1
               FROM stat_attempts
              WHERE user_id = ?2 AND category IN (SELECT value FROM json_each(?3))
              GROUP BY user_id, category
             ON CONFLICT (user_id, category) DO UPDATE SET
               heard = excluded.heard, correct = excluded.correct,
               tossups = excluded.tossups, powers = excluded.powers,
               negs = excluded.negs, buzz_sum = excluded.buzz_sum,
               buzz_n = excluded.buzz_n, updated_at = excluded.updated_at`,
          )
          .bind(now, userId, categories),
      ]);
      return num(ins?.meta?.changes);
    },

    async categoryStats(userId) {
      const res = await db
        .prepare(`SELECT ${STATS_COLS} FROM user_category_stats WHERE user_id = ?`)
        .bind(userId)
        .all<Record<string, unknown>>();
      return (res.results ?? []).map(rowToStats);
    },

    async categoryStatsFor(userIds) {
      if (userIds.length === 0) return [];
      const marks = userIds.map(() => '?').join(',');
      const res = await db
        .prepare(`SELECT ${STATS_COLS} FROM user_category_stats WHERE user_id IN (${marks})`)
        .bind(...userIds)
        .all<Record<string, unknown>>();
      return (res.results ?? []).map(rowToStats);
    },

    async contenders(minHeard) {
      const res = await db
        .prepare(
          `SELECT s.user_id, s.category, s.heard, s.correct, s.tossups, s.powers,
                  s.negs, s.buzz_sum, s.buzz_n, s.updated_at
             FROM user_category_stats s JOIN users u ON u.id = s.user_id
            WHERE s.heard >= ? AND u.banned_at IS NULL`,
        )
        .bind(minHeard)
        .all<Record<string, unknown>>();
      return (res.results ?? []).map(rowToStats);
    },

    async recentAttempts(userId, limit) {
      const res = await db
        .prepare(
          `SELECT at, mode, category, correct, powered, neg, points
             FROM stat_attempts WHERE user_id = ?
            ORDER BY at DESC, id DESC LIMIT ?`,
        )
        .bind(userId, limit)
        .all<Record<string, unknown>>();
      return (res.results ?? []).map((r) => ({
        at: num(r.at),
        mode: String(r.mode ?? ''),
        category: String(r.category ?? ''),
        correct: num(r.correct) === 1,
        powered: num(r.powered) === 1,
        neg: num(r.neg) === 1,
        points: num(r.points),
      }));
    },

    async recentMatches(userId, limit) {
      const res = await db
        .prepare(
          `SELECT m.id, m.finished_at, m.rated, m.winner_user_id,
                  CASE WHEN m.entrant_a_user_id = ? THEN m.entrant_b_user_id
                       ELSE m.entrant_a_user_id END AS opponent_id,
                  o.username AS opponent
             FROM quickplay_matches m
             LEFT JOIN users o ON o.id = CASE WHEN m.entrant_a_user_id = ?
                                              THEN m.entrant_b_user_id
                                              ELSE m.entrant_a_user_id END
            WHERE m.state = 'finished'
              AND (m.entrant_a_user_id = ? OR m.entrant_b_user_id = ?)
            ORDER BY m.finished_at DESC LIMIT ?`,
        )
        .bind(userId, userId, userId, userId, limit)
        .all<Record<string, unknown>>();
      return (res.results ?? []).map((r) => ({
        id: num(r.id),
        finished_at: num(r.finished_at),
        won: num(r.winner_user_id) === userId,
        rated: num(r.rated) === 1,
        opponent_id: r.opponent_id == null ? null : num(r.opponent_id),
        opponent: typeof r.opponent === 'string' ? r.opponent : '',
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function tagsByUser(
  store: ProfileStore,
  userIds: number[],
): Promise<Map<number, Tag[]>> {
  const [own, contenders] = await Promise.all([
    store.categoryStatsFor(userIds),
    store.contenders(TAG_MIN_HEARD),
  ]);
  const tops = topPerCategory(contenders);
  const byUser = new Map<number, CategoryStatsRow[]>();
  for (const r of own) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }
  const out = new Map<number, Tag[]>();
  for (const id of userIds) out.set(id, computeTags(id, byUser.get(id) ?? [], tops));
  return out;
}

async function handleUpload(
  request: Request,
  authStore: AuthStore,
  store: ProfileStore,
  ctx: RequestContext,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);
  let body: { events?: unknown } | null;
  try {
    body = (await request.json()) as { events?: unknown };
  } catch {
    body = null;
  }
  if (!body || !Array.isArray(body.events)) {
    return json({ error: 'events must be an array' }, 400);
  }
  if (body.events.length > SYNC_BATCH_MAX) {
    return json({ error: `at most ${SYNC_BATCH_MAX} events per request` }, 400);
  }
  const rows: StatAttemptRow[] = [];
  const seen = new Set<string>();
  for (const raw of body.events) {
    const row = toStatAttempt(raw, ctx.now);
    if (!row || seen.has(row.clientId)) continue;
    seen.add(row.clientId);
    rows.push(row);
  }
  const inserted = await store.recordAttempts(me.id, rows, ctx.now);
  return json({ accepted: rows.length, inserted, rejected: body.events.length - rows.length });
}

export const TAGS_IDS_MAX = 100;

async function handleTags(request: Request, store: ProfileStore): Promise<Response> {
  const url = new URL(request.url);
  const raw = (url.searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ids = [...new Set(raw.map(parseId).filter((n): n is number => n !== null))];
  if (ids.length > TAGS_IDS_MAX) return json({ error: `at most ${TAGS_IDS_MAX} ids` }, 400);
  const map = await tagsByUser(store, ids);
  const tags: Record<string, Tag[]> = {};
  for (const [id, list] of map) tags[String(id)] = list;
  return json({ tags });
}

export const PROFILE_RECENT_ATTEMPTS = 20;
export const PROFILE_RECENT_MATCHES = 10;

/**
 * Public profile. Exposes ONLY: id, nickname (username), join date, ELO/rank
 * with wins/losses, tags, per-category aggregates and recent activity
 * (category + outcome, never answer or question text). No role, no ban
 * state, no session or credential data. Banned users 404.
 */
async function handleProfile(
  authStore: AuthStore,
  ratingStore: RatingStore,
  store: ProfileStore,
  ctx: RequestContext,
  userId: number,
): Promise<Response> {
  const user = await authStore.findUserById(userId);
  if (!user || user.bannedAt != null) return json({ error: 'user not found' }, 404);

  const [rating, top, stats, contenders, recent, matches] = await Promise.all([
    ratingOrDefault(ratingStore, userId, ctx.now),
    ratingStore.listTop(1),
    store.categoryStats(userId),
    store.contenders(TAG_MIN_HEARD),
    store.recentAttempts(userId, PROFILE_RECENT_ATTEMPTS),
    store.recentMatches(userId, PROFILE_RECENT_MATCHES),
  ]);
  const isTop = top.length > 0 && top[0]?.userId === userId;
  const info = toRankInfo(rating.elo, isTop);
  const tags = computeTags(userId, stats, topPerCategory(contenders));

  const order = new Map<string, number>(CATEGORIES.map((c, i) => [c, i]));
  const categories = stats
    .map(metricsFor)
    .sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99));
  const totals = stats.reduce(
    (t, r) => ({
      heard: t.heard + r.heard,
      correct: t.correct + r.correct,
      tossups: t.tossups + r.tossups,
      powers: t.powers + r.powers,
    }),
    { heard: 0, correct: 0, tossups: 0, powers: 0 },
  );

  return json({
    profile: {
      user_id: user.id,
      username: user.username,
      joined_at: user.createdAt,
      rating: {
        elo: rating.elo,
        wins: rating.wins,
        losses: rating.losses,
        rank: { tier: info.tier, subrank: info.subrank, label: info.label, is_god: info.isGod },
      },
      tags,
      totals: {
        ...totals,
        accuracy: round3(ratio(totals.correct, totals.heard)),
        power_rate: round3(ratio(totals.powers, totals.tossups)),
      },
      categories,
      recent_attempts: recent,
      recent_matches: matches,
      // Stable public URL for this profile, for links from elsewhere (a
      // future forum, shared links). The SPA resolves it in App.tsx.
      url: `/#/u/${user.id}`,
    },
  });
}

/**
 * Handles /api/stats/*, /api/tags and /api/profile/*. Returns null for
 * anything else so the caller falls through to its other routes.
 */
export async function handleProfiles(
  request: Request,
  authStore: AuthStore,
  ratingStore: RatingStore,
  store: ProfileStore,
  ctx: RequestContext,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;

  if (path === '/api/stats/attempts') {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    return handleUpload(request, authStore, store, ctx);
  }

  if (path === '/api/tags') {
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
    return handleTags(request, store);
  }

  const m = /^\/api\/profile\/([^/]+)$/.exec(path);
  if (m) {
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
    const id = parseId(m[1] ?? '');
    if (id === null) return json({ error: 'user not found' }, 404);
    return handleProfile(authStore, ratingStore, store, ctx, id);
  }

  return null;
}
