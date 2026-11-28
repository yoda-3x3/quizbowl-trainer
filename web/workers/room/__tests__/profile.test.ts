/**
 * Tests for per-category stats, category tags and the public profile.
 *
 * Mirrors ratings.test.ts: in-memory stores run the endpoints without a D1
 * harness. The in-memory ProfileStore follows the D1 adapter's contract
 * (dedupe on (user, client id), aggregates recomputed from stored rows).
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetRateLimit,
  handleAuth,
  type AuthStore,
  type RequestContext,
  type Role,
  type StoredUser,
} from '../auth';
import { parseSessionCookie } from '../session';
import type { RatingRow, RatingStore } from '../ratings';
import {
  CATEGORY_TAGS,
  POLYMATH_MIN_CATEGORIES,
  SYNC_BATCH_MAX,
  TAG_MIN_HEARD,
  computeTags,
  handleProfiles,
  metricsFor,
  qualifies,
  toStatAttempt,
  topPerCategory,
  type CategoryStatsRow,
  type ProfileStore,
  type RecentAttempt,
  type RecentMatch,
  type StatAttemptRow,
} from '../profile';
import { join, createRoom, snapshot } from '../engine';

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

class MemoryAuthStore implements AuthStore {
  private nextId = 1;
  public users = new Map<number, StoredUser>();
  private sessionsByToken = new Map<string, { userId: number; expiresAt: number }>();
  async countUsers() {
    return this.users.size;
  }
  async findUserByUsername(username: string) {
    for (const u of this.users.values()) if (u.username === username) return { ...u };
    return null;
  }
  async findUserById(id: number) {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }
  async createUser(username: string, pwHash: string, role: Role, createdAt: number) {
    const id = this.nextId++;
    this.users.set(id, { id, username, pwHash, role, createdAt, bannedAt: null });
    return id;
  }
  async createSession(token: string, userId: number, _createdAt: number, expiresAt: number) {
    this.sessionsByToken.set(token, { userId, expiresAt });
  }
  async findSession(token: string) {
    return this.sessionsByToken.get(token) ?? null;
  }
  async deleteSession(token: string) {
    this.sessionsByToken.delete(token);
  }
}

class MemoryRatingStore implements RatingStore {
  public rows = new Map<number, RatingRow>();
  async getRating(userId: number) {
    const r = this.rows.get(userId);
    return r ? { ...r } : null;
  }
  async upsertRating(row: RatingRow) {
    this.rows.set(row.userId, { ...row });
  }
  async listTop(limit: number) {
    return [...this.rows.values()]
      .sort((a, b) => b.elo - a.elo || a.userId - b.userId)
      .slice(0, limit);
  }
}

class MemoryProfileStore implements ProfileStore {
  public attempts: Array<StatAttemptRow & { userId: number }> = [];
  public stats = new Map<string, CategoryStatsRow>();
  public matches: Array<RecentMatch & { userId: number }> = [];
  constructor(private readonly auth: MemoryAuthStore) {}

  async recordAttempts(userId: number, rows: StatAttemptRow[], now: number) {
    let inserted = 0;
    for (const r of rows) {
      if (this.attempts.some((a) => a.userId === userId && a.clientId === r.clientId)) continue;
      this.attempts.push({ ...r, userId });
      inserted++;
    }
    for (const cat of new Set(rows.map((r) => r.category))) {
      const mine = this.attempts.filter((a) => a.userId === userId && a.category === cat);
      const buzzes = mine.filter((a) => a.buzzPermille !== null);
      this.stats.set(`${userId}:${cat}`, {
        userId,
        category: cat,
        heard: mine.length,
        correct: mine.filter((a) => a.correct).length,
        tossups: mine.filter((a) => a.isTossup).length,
        powers: mine.filter((a) => a.powered).length,
        negs: mine.filter((a) => a.neg).length,
        buzzSum: buzzes.reduce((s, a) => s + (a.buzzPermille ?? 0), 0),
        buzzN: buzzes.length,
        updatedAt: now,
      });
    }
    return inserted;
  }
  async categoryStats(userId: number) {
    return [...this.stats.values()].filter((s) => s.userId === userId);
  }
  async categoryStatsFor(ids: number[]) {
    return [...this.stats.values()].filter((s) => ids.includes(s.userId));
  }
  async contenders(minHeard: number) {
    return [...this.stats.values()].filter(
      (s) => s.heard >= minHeard && this.auth.users.get(s.userId)?.bannedAt == null,
    );
  }
  async recentAttempts(userId: number, limit: number): Promise<RecentAttempt[]> {
    return this.attempts
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map((a) => ({
        at: a.at,
        mode: a.mode,
        category: a.category,
        correct: a.correct,
        powered: a.powered,
        neg: a.neg,
        points: a.points,
      }));
  }
  async recentMatches(userId: number, limit: number) {
    return this.matches.filter((m) => m.userId === userId).slice(0, limit);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = 1_700_000_000_000;

function ctx(): RequestContext {
  return { ip: '203.0.113.9', colo: 'ORD', now: NOW };
}

function req(method: string, path: string, body?: unknown, cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  return new Request(`https://x.example${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function signup(auth: MemoryAuthStore, username: string) {
  const res = (await handleAuth(
    req('POST', '/api/auth/signup', { username, password: 'password1' }),
    auth,
    ctx(),
  )) as Response;
  const token = parseSessionCookie(res.headers.get('set-cookie') ?? '') ?? '';
  const user = await auth.findUserByUsername(username);
  return { id: user?.id ?? 0, cookie: `session=${token}` };
}

async function setup() {
  const auth = new MemoryAuthStore();
  const ratings = new MemoryRatingStore();
  const profiles = new MemoryProfileStore(auth);
  const alice = await signup(auth, 'alice');
  const bob = await signup(auth, 'bob');
  const call = (r: Request) => handleProfiles(r, auth, ratings, profiles, ctx());
  return { auth, ratings, profiles, alice, bob, call };
}

let seq = 0;
/** A tossup AttemptEvent as src/screens/Tossup.tsx logs it. */
function tossupEvent(
  category: string,
  outcome: 'power' | 'ten' | 'neg' | 'dead',
  extra: Record<string, unknown> = {},
) {
  seq++;
  const correct = outcome === 'power' || outcome === 'ten';
  return {
    id: `ev-${seq}`,
    at: NOW - 1000 * seq,
    mode: 'tossup',
    questionId: `q${seq}`,
    category,
    subcategory: category,
    difficulty: 3,
    buzzWordIndex: outcome === 'dead' ? null : outcome === 'power' ? 30 : 80,
    totalWords: 100,
    powerWordIndex: 50,
    givenAnswer: 'secret answer text',
    directive: correct ? 'accept' : outcome === 'neg' ? 'reject' : null,
    points: outcome === 'power' ? 15 : outcome === 'ten' ? 10 : outcome === 'neg' ? -5 : 0,
    msToAnswer: 1200,
    ...extra,
  };
}

function events(category: string, counts: Partial<Record<'power' | 'ten' | 'neg' | 'dead', number>>) {
  const out = [];
  for (const k of ['power', 'ten', 'neg', 'dead'] as const) {
    for (let i = 0; i < (counts[k] ?? 0); i++) out.push(tossupEvent(category, k));
  }
  return out;
}

async function upload(call: (r: Request) => Promise<Response | null>, cookie: string, evs: unknown[]) {
  const res = (await call(req('POST', '/api/stats/attempts', { events: evs }, cookie))) as Response;
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function statsRow(userId: number, category: string, p: Partial<CategoryStatsRow>): CategoryStatsRow {
  return {
    userId,
    category,
    heard: 0,
    correct: 0,
    tossups: 0,
    powers: 0,
    negs: 0,
    buzzSum: 0,
    buzzN: 0,
    updatedAt: NOW,
    ...p,
  };
}

afterEach(() => __resetRateLimit());

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

describe('toStatAttempt', () => {
  it('derives correct/power/neg/buzz point and drops answer text', () => {
    const p = toStatAttempt(tossupEvent('Literature', 'power'), NOW);
    expect(p).toMatchObject({ correct: true, powered: true, neg: false, isTossup: true, buzzPermille: 310 });
    expect(JSON.stringify(p)).not.toContain('secret');
    expect(toStatAttempt(tossupEvent('Literature', 'ten'), NOW)).toMatchObject({ powered: false, buzzPermille: 810 });
    expect(toStatAttempt(tossupEvent('Literature', 'neg'), NOW)).toMatchObject({ correct: false, neg: true, buzzPermille: null });
    expect(toStatAttempt(tossupEvent('Literature', 'dead'), NOW)).toMatchObject({ correct: false, neg: false });
  });

  it('treats bonus parts as heard but never as tossups or powers', () => {
    const b = toStatAttempt({ ...tossupEvent('History', 'power'), mode: 'bonus' }, NOW);
    expect(b).toMatchObject({ isTossup: false, powered: false, correct: true, buzzPermille: null });
  });

  it('rejects unknown categories, modes, ids and future/ancient clocks', () => {
    expect(toStatAttempt({ ...tossupEvent('Literature', 'ten'), category: 'literature' }, NOW)).toBeNull();
    expect(toStatAttempt({ ...tossupEvent('Literature', 'ten'), mode: 'cheat' }, NOW)).toBeNull();
    expect(toStatAttempt({ ...tossupEvent('Literature', 'ten'), id: '' }, NOW)).toBeNull();
    expect(toStatAttempt({ ...tossupEvent('Literature', 'ten'), at: NOW + 3_600_000 }, NOW)).toBeNull();
    expect(toStatAttempt({ ...tossupEvent('Literature', 'ten'), at: 0 }, NOW)).toBeNull();
    expect(toStatAttempt(null, NOW)).toBeNull();
  });
});

describe('qualifies', () => {
  it('needs the minimum sample before anything counts', () => {
    expect(qualifies(statsRow(1, 'Science', { heard: TAG_MIN_HEARD - 1, correct: TAG_MIN_HEARD - 1 }))).toBe(false);
    expect(qualifies(statsRow(1, 'Science', { heard: TAG_MIN_HEARD, correct: 12 }))).toBe(true);
  });
  it('accepts a high power rate even with modest accuracy', () => {
    expect(qualifies(statsRow(1, 'Science', { heard: 30, tossups: 30, correct: 10, powers: 6 }))).toBe(true);
    expect(qualifies(statsRow(1, 'Science', { heard: 30, tossups: 30, correct: 10, powers: 5 }))).toBe(false);
  });
});

describe('computeTags', () => {
  const strong = (c: string) => statsRow(1, c, { heard: 25, correct: 20, tossups: 25 });
  const weak = (c: string) => statsRow(1, c, { heard: 25, correct: 5, tossups: 25 });

  it('Philosopher needs BOTH Fine Arts and Philosophy', () => {
    const only = computeTags(1, [strong('Fine Arts'), weak('Philosophy')], new Map());
    expect(only.map((t) => t.id)).not.toContain('philosopher');
    const both = computeTags(1, [strong('Fine Arts'), strong('Philosophy')], new Map());
    expect(both.find((t) => t.id === 'philosopher')).toMatchObject({
      label: 'Philosopher',
      kind: 'category',
      categories: ['Fine Arts', 'Philosophy'],
    });
  });

  it('awards single-category tags and Polymath at the documented count', () => {
    const cats = ['Literature', 'History', 'Science', 'Mythology'];
    const four = computeTags(1, cats.map(strong), new Map());
    expect(four.map((t) => t.label)).toEqual(['Bard', 'Chronicler', 'Alchemist', 'Oracle']);
    expect(POLYMATH_MIN_CATEGORIES).toBe(5);
    const five = computeTags(1, [...cats, 'Geography'].map(strong), new Map());
    expect(five.map((t) => t.id)).toContain('polymath');
  });

  it('puts #1 tags first', () => {
    const tags = computeTags(1, [strong('Literature')], new Map([['Literature', 1], ['Science', 2]]));
    expect(tags[0]).toMatchObject({ id: 'top:Literature', label: '#1 in Literature', kind: 'top' });
    expect(tags.map((t) => t.id)).not.toContain('top:Science');
  });

  it('every catalogue category is a real category', () => {
    for (const def of CATEGORY_TAGS) expect(def.categories.length).toBeGreaterThan(0);
  });
});

describe('topPerCategory', () => {
  it('picks one player per category by accuracy + power rate, ties by volume then id', () => {
    const tops = topPerCategory([
      statsRow(1, 'History', { heard: 20, correct: 15, tossups: 20, powers: 2 }),
      statsRow(2, 'History', { heard: 40, correct: 30, tossups: 40, powers: 4 }), // same score, more heard
      statsRow(3, 'History', { heard: 10, correct: 10, tossups: 10, powers: 10 }), // below minimum
      statsRow(4, 'Science', { heard: 20, correct: 10, tossups: 20 }),
      statsRow(5, 'Science', { heard: 20, correct: 10, tossups: 20 }),
    ]);
    expect(tops.get('History')).toBe(2);
    expect(tops.get('Science')).toBe(4);
    expect(tops.has('Literature')).toBe(false);
  });
});

describe('metricsFor', () => {
  it('reports rates and the mean buzz point as fractions', () => {
    const m = metricsFor(statsRow(1, 'Science', { heard: 10, correct: 5, tossups: 8, powers: 2, negs: 1, buzzSum: 1200, buzzN: 2 }));
    expect(m).toMatchObject({ accuracy: 0.5, power_rate: 0.25, neg_rate: 0.125, avg_buzz: 0.6 });
    expect(metricsFor(statsRow(1, 'Science', {})).avg_buzz).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

describe('POST /api/stats/attempts', () => {
  it('requires sign-in', async () => {
    const { call } = await setup();
    const res = (await call(req('POST', '/api/stats/attempts', { events: [] }))) as Response;
    expect(res.status).toBe(401);
  });

  it('stores events once, ignores re-sends and rejects junk', async () => {
    const { call, alice, profiles } = await setup();
    const evs = events('Literature', { power: 2, ten: 1, neg: 1 });
    const first = await upload(call, alice.cookie, [...evs, { id: 'junk' }]);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ accepted: 4, inserted: 4, rejected: 1 });
    const again = await upload(call, alice.cookie, evs);
    expect(again.body).toMatchObject({ accepted: 4, inserted: 0 });
    const [row] = await profiles.categoryStats(alice.id);
    expect(row).toMatchObject({ heard: 4, correct: 3, powers: 2, negs: 1, tossups: 4 });
  });

  it('caps the batch size', async () => {
    const { call, alice } = await setup();
    const evs = Array.from({ length: SYNC_BATCH_MAX + 1 }, () => tossupEvent('Science', 'ten'));
    expect((await upload(call, alice.cookie, evs)).status).toBe(400);
  });

  it('rejects a non-array body and other methods', async () => {
    const { call, alice } = await setup();
    expect((await upload(call, alice.cookie, 'nope' as unknown as unknown[])).status).toBe(400);
    const get = (await call(req('GET', '/api/stats/attempts', undefined, alice.cookie))) as Response;
    expect(get.status).toBe(405);
  });
});

describe('GET /api/tags', () => {
  it('returns earned tags keyed by user id, with the single #1 per category', async () => {
    const { call, alice, bob } = await setup();
    await upload(call, alice.cookie, [
      ...events('Fine Arts', { power: 10, ten: 8, dead: 4 }),
      ...events('Philosophy', { ten: 16, dead: 6 }),
    ]);
    await upload(call, bob.cookie, events('Philosophy', { ten: 13, dead: 9 }));

    const res = (await call(req('GET', `/api/tags?ids=${alice.id},${bob.id},999,abc`))) as Response;
    expect(res.status).toBe(200);
    const { tags } = (await res.json()) as { tags: Record<string, Array<{ id: string }>> };
    const a = tags[String(alice.id)]?.map((t) => t.id) ?? [];
    expect(a).toEqual(['top:Fine Arts', 'top:Philosophy', 'philosopher']);
    // Bob is under the accuracy bar in Philosophy and is not #1 there.
    expect(tags[String(bob.id)]).toEqual([]);
    expect(tags['999']).toEqual([]);
    expect(Object.keys(tags)).toHaveLength(3);
  });

  it('drops a banned player from the #1 race', async () => {
    const { call, auth, alice, bob } = await setup();
    await upload(call, alice.cookie, events('Science', { ten: 20 }));
    await upload(call, bob.cookie, events('Science', { ten: 15, dead: 5 }));
    const u = auth.users.get(alice.id);
    if (u) u.bannedAt = NOW;
    const res = (await call(req('GET', `/api/tags?ids=${bob.id}`))) as Response;
    const { tags } = (await res.json()) as { tags: Record<string, Array<{ id: string }>> };
    expect(tags[String(bob.id)]?.map((t) => t.id)).toEqual(['top:Science', 'alchemist']);
  });

  it('limits how many ids one call may ask for', async () => {
    const { call } = await setup();
    const ids = Array.from({ length: 101 }, (_, i) => i + 1).join(',');
    expect(((await call(req('GET', `/api/tags?ids=${ids}`))) as Response).status).toBe(400);
  });
});

describe('GET /api/profile/:userId', () => {
  it('exposes nickname, rank, tags, category stats and recent activity, and nothing sensitive', async () => {
    const { call, alice, ratings, profiles } = await setup();
    await ratings.upsertRating({ userId: alice.id, elo: 900, wins: 3, losses: 1, updatedAt: NOW });
    await upload(call, alice.cookie, events('Literature', { power: 5, ten: 12, neg: 2, dead: 1 }));
    profiles.matches.push({ userId: alice.id, id: 7, finished_at: NOW, won: true, rated: true, opponent_id: 2, opponent: 'bob' });

    const res = (await call(req('GET', `/api/profile/${alice.id}`))) as Response;
    expect(res.status).toBe(200);
    const { profile } = (await res.json()) as { profile: Record<string, any> };
    expect(profile.username).toBe('alice');
    expect(profile.rating).toMatchObject({ elo: 900, wins: 3, losses: 1, rank: { is_god: true, label: 'God' } });
    expect(profile.tags.map((t: { id: string }) => t.id)).toEqual(['top:Literature', 'bard']);
    expect(profile.categories).toHaveLength(1);
    expect(profile.categories[0]).toMatchObject({ category: 'Literature', heard: 20, correct: 17, powers: 5, negs: 2 });
    expect(profile.categories[0].avg_buzz).toBeGreaterThan(0);
    expect(profile.recent_attempts).toHaveLength(20);
    expect(profile.recent_matches[0]).toMatchObject({ won: true, opponent: 'bob' });
    expect(profile.url).toBe(`/#/u/${alice.id}`);

    const raw = JSON.stringify(profile);
    for (const secret of ['pw', 'pbkdf2', 'role', 'banned', 'session', 'secret answer text', 'givenAnswer']) {
      expect(raw).not.toContain(secret);
    }
  });

  it('works signed out, shows an unrated default, and 404s unknown or banned users', async () => {
    const { call, auth, bob } = await setup();
    const res = (await call(req('GET', `/api/profile/${bob.id}`))) as Response;
    const { profile } = (await res.json()) as { profile: Record<string, any> };
    expect(profile.rating.elo).toBe(400);
    expect(profile.tags).toEqual([]);
    expect(profile.categories).toEqual([]);

    expect(((await call(req('GET', '/api/profile/999'))) as Response).status).toBe(404);
    expect(((await call(req('GET', '/api/profile/abc'))) as Response).status).toBe(404);
    const u = auth.users.get(bob.id);
    if (u) u.bannedAt = NOW;
    expect(((await call(req('GET', `/api/profile/${bob.id}`))) as Response).status).toBe(404);
  });

  it('falls through for unrelated paths', async () => {
    const { call } = await setup();
    expect(await call(req('GET', '/api/leaderboard'))).toBeNull();
  });
});

describe('room players carry their account id', () => {
  it('join() records userId and the snapshot exposes it; guests have none', () => {
    const room = createRoom('ABCD');
    join(room, 'p1', 'alice', NOW, undefined, 42);
    join(room, 'p2', 'guest', NOW);
    const snap = snapshot(room, NOW);
    expect(snap.players.find((p) => p.id === 'p1')?.userId).toBe(42);
    expect(snap.players.find((p) => p.id === 'p2')).not.toHaveProperty('userId');
  });
});
