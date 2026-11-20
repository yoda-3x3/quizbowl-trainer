/**
 * Tests for ELO math, rank-tier boundaries, and the ratings endpoints.
 *
 * Mirrors tournaments.test.ts: an in-memory AuthStore/RatingStore pair runs
 * the endpoints without a D1 harness, since the D1 adapter is a thin SQL
 * wrapper that only runs against the real binding.
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
import {
  ELO_FLOOR,
  ELO_START,
  RANK_TIERS,
  SUBRANK_WIDTH,
  TIER_WIDTH,
  handleRatings,
  recordMatchResult,
  tierForElo,
  type RatingRow,
  type RatingStore,
} from '../ratings';

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

class MemoryAuthStore implements AuthStore {
  private nextId = 1;
  public users = new Map<number, StoredUser>();
  private sessionsByToken = new Map<string, { userId: number; createdAt: number; expiresAt: number }>();

  async countUsers(): Promise<number> {
    return this.users.size;
  }

  async findUserByUsername(username: string): Promise<StoredUser | null> {
    for (const u of this.users.values()) {
      if (u.username === username) return { ...u };
    }
    return null;
  }

  async findUserById(id: number): Promise<StoredUser | null> {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  async createUser(username: string, pwHash: string, role: Role, createdAt: number): Promise<number> {
    const id = this.nextId++;
    this.users.set(id, { id, username, pwHash, role, createdAt, bannedAt: null });
    return id;
  }

  async createSession(token: string, userId: number, createdAt: number, expiresAt: number): Promise<void> {
    this.sessionsByToken.set(token, { userId, createdAt, expiresAt });
  }

  async findSession(token: string) {
    const s = this.sessionsByToken.get(token);
    return s ? { userId: s.userId, expiresAt: s.expiresAt } : null;
  }

  async deleteSession(token: string): Promise<void> {
    this.sessionsByToken.delete(token);
  }
}

class MemoryRatingStore implements RatingStore {
  public rows = new Map<number, RatingRow>();

  async getRating(userId: number): Promise<RatingRow | null> {
    const r = this.rows.get(userId);
    return r ? { ...r } : null;
  }

  async upsertRating(row: RatingRow): Promise<void> {
    this.rows.set(row.userId, { ...row });
  }

  async listTop(limit: number): Promise<RatingRow[]> {
    return [...this.rows.values()]
      .sort((a, b) => (b.elo - a.elo) || (a.userId - b.userId))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = 1_700_000_000_000;

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return { ip: '203.0.113.1', colo: 'ORD', now: NOW, ...overrides };
}

function req(method: string, path: string, body?: unknown, cookies?: string): Request {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookies) headers['cookie'] = cookies;
  return new Request(`https://x.example${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function sessionCookieOf(response: Response): string | null {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return null;
  return parseSessionCookie(setCookie);
}

interface Seeded {
  authStore: MemoryAuthStore;
  ratingStore: MemoryRatingStore;
  aliceId: number;
  bobId: number;
  aliceCookie: string;
  bobCookie: string;
}

async function seed(now: number = NOW): Promise<Seeded> {
  const authStore = new MemoryAuthStore();
  const ratingStore = new MemoryRatingStore();

  const aRes = await handleAuth(
    req('POST', '/api/auth/signup', { username: 'alice', password: 'password1' }),
    authStore,
    ctx({ now }),
  );
  const aliceCookie = `session=${sessionCookieOf(aRes as Response) ?? ''}`;
  const alice = await authStore.findUserByUsername('alice');

  const bRes = await handleAuth(
    req('POST', '/api/auth/signup', { username: 'bob', password: 'password1' }),
    authStore,
    ctx({ now }),
  );
  const bobCookie = `session=${sessionCookieOf(bRes as Response) ?? ''}`;
  const bob = await authStore.findUserByUsername('bob');

  return {
    authStore,
    ratingStore,
    aliceId: alice?.id ?? 0,
    bobId: bob?.id ?? 0,
    aliceCookie,
    bobCookie,
  };
}

afterEach(() => {
  __resetRateLimit();
});

// ---------------------------------------------------------------------------
// ELO math
// ---------------------------------------------------------------------------

describe('recordMatchResult', () => {
  it('creates both rows at ELO_START on first match and moves the winner up', async () => {
    const store = new MemoryRatingStore();
    const { winner, loser } = await recordMatchResult(store, 1, 2, NOW);

    expect(winner.elo).toBeGreaterThan(ELO_START);
    expect(loser.elo).toBeLessThan(ELO_START);
    expect(winner.wins).toBe(1);
    expect(winner.losses).toBe(0);
    expect(loser.wins).toBe(0);
    expect(loser.losses).toBe(1);

    // Equal starting ELO means a K/2 split either way, modulo JS's
    // round-half-to-+Infinity making the two sides differ by at most 1.
    expect(Math.abs((winner.elo - ELO_START) - (ELO_START - loser.elo))).toBeLessThanOrEqual(1);
  });

  it('gives a big underdog win a larger ELO swing than a expected win', async () => {
    const store = new MemoryRatingStore();
    // Seed a lopsided starting gap.
    await store.upsertRating({ userId: 1, elo: 1000, wins: 0, losses: 0, updatedAt: NOW });
    await store.upsertRating({ userId: 2, elo: 400, wins: 0, losses: 0, updatedAt: NOW });

    // Underdog (2) beats favorite (1): big gain.
    const upset = await recordMatchResult(store, 2, 1, NOW);
    const upsetGain = upset.winner.elo - 400;

    // Reset and have the favorite win as expected: small gain.
    const store2 = new MemoryRatingStore();
    await store2.upsertRating({ userId: 1, elo: 1000, wins: 0, losses: 0, updatedAt: NOW });
    await store2.upsertRating({ userId: 2, elo: 400, wins: 0, losses: 0, updatedAt: NOW });
    const expected = await recordMatchResult(store2, 1, 2, NOW);
    const expectedGain = expected.winner.elo - 1000;

    expect(upsetGain).toBeGreaterThan(expectedGain);
  });

  it('never drops a rating below ELO_FLOOR', async () => {
    const store = new MemoryRatingStore();
    await store.upsertRating({ userId: 1, elo: ELO_FLOOR, wins: 0, losses: 50, updatedAt: NOW });
    await store.upsertRating({ userId: 2, elo: ELO_FLOOR + 2000, wins: 50, losses: 0, updatedAt: NOW });

    const { loser } = await recordMatchResult(store, 2, 1, NOW);
    expect(loser.elo).toBe(ELO_FLOOR);
  });
});

// ---------------------------------------------------------------------------
// Rank tiers
// ---------------------------------------------------------------------------

describe('tierForElo', () => {
  it('starts a fresh player in the second tier band', () => {
    // ELO_START=400 sits in Serf's upper half (floor 100, width 500).
    const info = tierForElo(ELO_START);
    expect(info.tier).toBe('Serf');
  });

  it('places the floor at the lowest tier, worst sub-rank', () => {
    const info = tierForElo(ELO_FLOOR);
    expect(info.tier).toBe(RANK_TIERS[0]);
    expect(info.subrank).toBe(5);
  });

  it('crosses a tier boundary exactly at TIER_WIDTH', () => {
    const justBelow = tierForElo(ELO_FLOOR + TIER_WIDTH - 1);
    const atBoundary = tierForElo(ELO_FLOOR + TIER_WIDTH);
    expect(justBelow.tier).toBe('Serf');
    expect(atBoundary.tier).toBe('Peasant');
    expect(atBoundary.subrank).toBe(5);
  });

  it('improves sub-rank as ELO climbs within a tier', () => {
    const low = tierForElo(ELO_FLOOR);
    const mid = tierForElo(ELO_FLOOR + SUBRANK_WIDTH);
    expect(mid.subrank).toBeLessThan(low.subrank);
  });

  it('caps at King with no eighth tier for very high ELO', () => {
    const info = tierForElo(ELO_FLOOR + TIER_WIDTH * 50);
    expect(info.tier).toBe('King');
    expect(info.subrank).toBe(1);
  });

  it('clamps anything below the floor to the floor band', () => {
    const info = tierForElo(0);
    expect(info.tier).toBe(RANK_TIERS[0]);
    expect(info.subrank).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

describe('handleRatings', () => {
  it('GET /api/ratings/me requires sign-in', async () => {
    const { ratingStore } = await seed();
    const res = await handleRatings(
      req('GET', '/api/ratings/me'),
      new MemoryAuthStore(),
      ratingStore,
      ctx(),
    );
    expect(res?.status).toBe(401);
  });

  it('GET /api/ratings/me returns the default unrated rating with no row written', async () => {
    const { authStore, ratingStore, aliceCookie } = await seed();
    const res = await handleRatings(
      req('GET', '/api/ratings/me', undefined, aliceCookie),
      authStore,
      ratingStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await res?.json()) as { rating: { elo: number; rank: { label: string; is_god: boolean } } };
    expect(body.rating.elo).toBe(ELO_START);
    expect(body.rating.rank.is_god).toBe(false);
    expect(ratingStore.rows.size).toBe(0);
  });

  it('GET /api/ratings/:id works for any user without sign-in', async () => {
    const { authStore, ratingStore, aliceId } = await seed();
    const res = await handleRatings(
      req('GET', `/api/ratings/${aliceId}`),
      authStore,
      ratingStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
  });

  it('GET /api/leaderboard flags the #1 player as God', async () => {
    const { authStore, ratingStore, aliceId, bobId } = await seed();
    await recordMatchResult(ratingStore, aliceId, bobId, NOW);

    const res = await handleRatings(req('GET', '/api/leaderboard'), authStore, ratingStore, ctx());
    expect(res?.status).toBe(200);
    const body = (await res?.json()) as {
      leaderboard: Array<{ user_id: number; position: number; rank: { is_god: boolean; label: string } }>;
    };
    expect(body.leaderboard[0]?.user_id).toBe(aliceId);
    expect(body.leaderboard[0]?.rank.is_god).toBe(true);
    expect(body.leaderboard[0]?.rank.label).toBe('God');
    expect(body.leaderboard[1]?.rank.is_god).toBe(false);
  });

  it('returns null for unrelated paths', async () => {
    const { authStore, ratingStore } = await seed();
    const res = await handleRatings(req('GET', '/api/tournaments'), authStore, ratingStore, ctx());
    expect(res).toBeNull();
  });
});
