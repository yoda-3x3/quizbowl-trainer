/**
 * Tests for the Quick Play module: matchmaking math plus the HTTP endpoints.
 *
 * Mirrors brackets.test.ts: in-memory store shims run the endpoints without
 * a D1 harness.
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
import { type RatingRow, type RatingStore } from '../ratings';
import {
  createPrivateMatch,
  handleQuickPlay,
  isParticipant,
  joinPrivateMatch,
  joinQueue,
  openMatchRoom,
  recordQuickPlayMatchResult,
  sideFor,
  type NewQuickPlayMatch,
  type QuickPlayMatchPatch,
  type QuickPlayMatchRow,
  type QuickPlayRoomOpener,
  type QuickPlayStore,
} from '../quickplay';

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
    for (const u of this.users.values()) if (u.username === username) return { ...u };
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
    return [...this.rows.values()].sort((a, b) => b.elo - a.elo).slice(0, limit).map((r) => ({ ...r }));
  }
}

class MemoryQuickPlayStore implements QuickPlayStore {
  private nextId = 1;
  public queue = new Map<number, number>();
  public matches: QuickPlayMatchRow[] = [];

  async peekQueue(excludingUserId: number) {
    const entries = [...this.queue.entries()]
      .filter(([uid]) => uid !== excludingUserId)
      .sort((a, b) => a[1] - b[1]);
    const first = entries[0];
    return first ? { userId: first[0], joinedAt: first[1] } : null;
  }
  async enqueue(userId: number, joinedAt: number): Promise<void> {
    this.queue.set(userId, joinedAt);
  }
  async dequeue(userId: number): Promise<void> {
    this.queue.delete(userId);
  }
  async isQueued(userId: number): Promise<boolean> {
    return this.queue.has(userId);
  }
  async createMatch(r: NewQuickPlayMatch): Promise<number> {
    const id = this.nextId++;
    this.matches.push({ ...r, id });
    return id;
  }
  async getMatch(id: number): Promise<QuickPlayMatchRow | null> {
    const m = this.matches.find((x) => x.id === id);
    return m ? { ...m } : null;
  }
  async getMatchByInviteCode(code: string): Promise<QuickPlayMatchRow | null> {
    const m = this.matches.find((x) => x.inviteCode === code);
    return m ? { ...m } : null;
  }
  async getActiveMatchFor(userId: number): Promise<QuickPlayMatchRow | null> {
    const found = this.matches
      .filter((m) => (m.entrantAUserId === userId || m.entrantBUserId === userId) && m.state !== 'finished')
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    return found ? { ...found } : null;
  }
  async updateMatch(id: number, patch: QuickPlayMatchPatch): Promise<void> {
    const m = this.matches.find((x) => x.id === id);
    if (!m) return;
    Object.assign(m, patch);
  }
}

class SpyRoomOpener implements QuickPlayRoomOpener {
  public calls: Array<{ code: string; info: unknown }> = [];
  async attach(code: string, info: unknown): Promise<void> {
    this.calls.push({ code, info });
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
  return setCookie ? parseSessionCookie(setCookie) : null;
}

async function signUp(authStore: AuthStore, username: string, now = NOW): Promise<{ id: number; cookie: string }> {
  const res = await handleAuth(
    req('POST', '/api/auth/signup', { username, password: 'password1' }),
    authStore,
    ctx({ now }),
  );
  const cookie = `session=${sessionCookieOf(res as Response) ?? ''}`;
  const u = await authStore.findUserByUsername(username);
  return { id: u?.id ?? 0, cookie };
}

afterEach(() => {
  __resetRateLimit();
});

// ---------------------------------------------------------------------------
// Pure matchmaking logic
// ---------------------------------------------------------------------------

describe('joinQueue', () => {
  it('queues the first caller and matches the second', async () => {
    const store = new MemoryQuickPlayStore();
    const first = await joinQueue(store, 1, NOW);
    expect(first).toEqual({ status: 'queued' });
    expect(await store.isQueued(1)).toBe(true);

    const second = await joinQueue(store, 2, NOW + 1000);
    expect(second.status).toBe('matched');
    if (second.status !== 'matched') throw new Error('unreachable');
    expect(second.match.entrantAUserId).toBe(1);
    expect(second.match.entrantBUserId).toBe(2);
    expect(second.match.kind).toBe('public');
    expect(second.match.rated).toBe(true);
    expect(second.match.state).toBe('ready');
    // Both are now matched, not queued.
    expect(await store.isQueued(1)).toBe(false);
    expect(await store.isQueued(2)).toBe(false);
  });

  it('never matches a user against themself', async () => {
    const store = new MemoryQuickPlayStore();
    await joinQueue(store, 1, NOW);
    const again = await joinQueue(store, 1, NOW + 1000);
    expect(again).toEqual({ status: 'queued' });
  });
});

describe('createPrivateMatch / joinPrivateMatch', () => {
  it('creates an unrated pending match with a 6-char invite code', async () => {
    const store = new MemoryQuickPlayStore();
    const match = await createPrivateMatch(store, 1, NOW);
    expect(match.kind).toBe('private');
    expect(match.rated).toBe(false);
    expect(match.state).toBe('pending');
    expect(match.inviteCode).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('lets a second user redeem the code and marks the match ready', async () => {
    const store = new MemoryQuickPlayStore();
    const match = await createPrivateMatch(store, 1, NOW);
    const result = await joinPrivateMatch(store, match.inviteCode ?? '', 2);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.match.entrantBUserId).toBe(2);
    expect(result.match.state).toBe('ready');
  });

  it('refuses the host joining their own game', async () => {
    const store = new MemoryQuickPlayStore();
    const match = await createPrivateMatch(store, 1, NOW);
    const result = await joinPrivateMatch(store, match.inviteCode ?? '', 1);
    expect(result).toEqual({ ok: false, error: 'cannot join your own private game' });
  });

  it('refuses a third user once the invite is used', async () => {
    const store = new MemoryQuickPlayStore();
    const match = await createPrivateMatch(store, 1, NOW);
    await joinPrivateMatch(store, match.inviteCode ?? '', 2);
    const result = await joinPrivateMatch(store, match.inviteCode ?? '', 3);
    expect(result).toEqual({ ok: false, error: 'this invite has already been used' });
  });

  it('is idempotent for the same second user rejoining', async () => {
    const store = new MemoryQuickPlayStore();
    const match = await createPrivateMatch(store, 1, NOW);
    await joinPrivateMatch(store, match.inviteCode ?? '', 2);
    const again = await joinPrivateMatch(store, match.inviteCode ?? '', 2);
    expect(again.ok).toBe(true);
  });

  it('reports not found for an unknown code', async () => {
    const store = new MemoryQuickPlayStore();
    const result = await joinPrivateMatch(store, 'ZZZZZZ', 1);
    expect(result).toEqual({ ok: false, error: 'invite code not found' });
  });
});

describe('sideFor / isParticipant', () => {
  it('resolves sides and participation', async () => {
    const store = new MemoryQuickPlayStore();
    const match = await createPrivateMatch(store, 1, NOW);
    const joined = await joinPrivateMatch(store, match.inviteCode ?? '', 2);
    if (!joined.ok) throw new Error('unreachable');
    expect(sideFor(joined.match, 1)).toBe('a');
    expect(sideFor(joined.match, 2)).toBe('b');
    expect(sideFor(joined.match, 3)).toBeNull();
    expect(isParticipant(joined.match, 1)).toBe(true);
    expect(isParticipant(joined.match, 3)).toBe(false);
  });
});

describe('openMatchRoom', () => {
  it('allocates a room code once and reuses it on a second call', async () => {
    const store = new MemoryQuickPlayStore();
    const opener = new SpyRoomOpener();
    const match = await createPrivateMatch(store, 1, NOW);
    const joined = await joinPrivateMatch(store, match.inviteCode ?? '', 2);
    if (!joined.ok) throw new Error('unreachable');

    const code = await openMatchRoom(store, opener, joined.match);
    expect(code).toMatch(/^[A-Z0-9]{4}$/);
    expect(opener.calls).toHaveLength(1);
    expect(opener.calls[0]?.info).toEqual({
      matchId: joined.match.id,
      entrantAKey: 'u:1',
      entrantBKey: 'u:2',
      regulationTossups: 20,
    });

    const refetched = await store.getMatch(joined.match.id);
    const again = await openMatchRoom(store, opener, refetched!);
    expect(again).toBe(code);
    expect(opener.calls).toHaveLength(1); // not called again
  });

  it('refuses to open a room for a match with no second entrant', async () => {
    const store = new MemoryQuickPlayStore();
    const opener = new SpyRoomOpener();
    const match = await createPrivateMatch(store, 1, NOW);
    await expect(openMatchRoom(store, opener, match)).rejects.toThrow('match is not ready to play');
  });
});

describe('recordQuickPlayMatchResult', () => {
  it('rates a public win and marks the match finished', async () => {
    const store = new MemoryQuickPlayStore();
    const ratingStore = new MemoryRatingStore();
    const matched = await joinQueue(store, 1, NOW);
    expect(matched).toEqual({ status: 'queued' });
    const second = await joinQueue(store, 2, NOW + 1);
    if (second.status !== 'matched') throw new Error('unreachable');

    const result = await recordQuickPlayMatchResult(store, ratingStore, second.match.id, 1, NOW + 2);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.match.state).toBe('finished');
    expect(result.match.winnerUserId).toBe(1);

    const winner = await ratingStore.getRating(1);
    const loser = await ratingStore.getRating(2);
    expect(winner?.wins).toBe(1);
    expect(loser?.losses).toBe(1);
  });

  it('does not rate a private match', async () => {
    const store = new MemoryQuickPlayStore();
    const ratingStore = new MemoryRatingStore();
    const match = await createPrivateMatch(store, 1, NOW);
    const joined = await joinPrivateMatch(store, match.inviteCode ?? '', 2);
    if (!joined.ok) throw new Error('unreachable');

    await recordQuickPlayMatchResult(store, ratingStore, joined.match.id, 1, NOW + 1);
    expect(await ratingStore.getRating(1)).toBeNull();
    expect(await ratingStore.getRating(2)).toBeNull();
  });

  it('finishes a tie with no winner and no rating change', async () => {
    const store = new MemoryQuickPlayStore();
    const ratingStore = new MemoryRatingStore();
    await joinQueue(store, 1, NOW);
    const second = await joinQueue(store, 2, NOW + 1);
    if (second.status !== 'matched') throw new Error('unreachable');

    const result = await recordQuickPlayMatchResult(store, ratingStore, second.match.id, null, NOW + 2);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.match.state).toBe('finished');
    expect(result.match.winnerUserId).toBeNull();
    expect(await ratingStore.getRating(1)).toBeNull();
  });

  it('refuses a match that is not ready', async () => {
    const store = new MemoryQuickPlayStore();
    const ratingStore = new MemoryRatingStore();
    const match = await createPrivateMatch(store, 1, NOW);
    const result = await recordQuickPlayMatchResult(store, ratingStore, match.id, 1, NOW + 1);
    expect(result).toEqual({ ok: false, error: 'match is not ready (state: pending)' });
  });

  it('refuses a winner who is not an entrant', async () => {
    const store = new MemoryQuickPlayStore();
    const ratingStore = new MemoryRatingStore();
    await joinQueue(store, 1, NOW);
    const second = await joinQueue(store, 2, NOW + 1);
    if (second.status !== 'matched') throw new Error('unreachable');
    const result = await recordQuickPlayMatchResult(store, ratingStore, second.match.id, 99, NOW + 2);
    expect(result).toEqual({ ok: false, error: "winner must be one of this match's entrants" });
  });
});

// ---------------------------------------------------------------------------
// HTTP endpoints
// ---------------------------------------------------------------------------

describe('handleQuickPlay', () => {
  it('returns null for unrelated paths', async () => {
    const authStore = new MemoryAuthStore();
    const store = new MemoryQuickPlayStore();
    const response = await handleQuickPlay(req('GET', '/api/other'), authStore, store, ctx());
    expect(response).toBeNull();
  });

  it('queue join requires sign-in', async () => {
    const authStore = new MemoryAuthStore();
    const store = new MemoryQuickPlayStore();
    const response = await handleQuickPlay(req('POST', '/api/quickplay/queue'), authStore, store, ctx());
    expect(response?.status).toBe(401);
  });

  it('queues then matches two signed-in users and opens a room', async () => {
    const authStore = new MemoryAuthStore();
    const store = new MemoryQuickPlayStore();
    const opener = new SpyRoomOpener();
    const alice = await signUp(authStore, 'alice');
    const bob = await signUp(authStore, 'bob');

    const first = await handleQuickPlay(
      req('POST', '/api/quickplay/queue', undefined, alice.cookie),
      authStore,
      store,
      ctx(),
      opener,
    );
    expect(await first?.json()).toEqual({ status: 'queued' });

    const second = await handleQuickPlay(
      req('POST', '/api/quickplay/queue', undefined, bob.cookie),
      authStore,
      store,
      ctx({ now: NOW + 1000 }),
      opener,
    );
    const body = (await second?.json()) as { status: string; match: { room_code: string; rated: boolean } };
    expect(body.status).toBe('matched');
    expect(body.match.rated).toBe(true);
    expect(body.match.room_code).toMatch(/^[A-Z0-9]{4}$/);
    expect(opener.calls).toHaveLength(1);
  });

  it('leave removes the caller from the queue', async () => {
    const authStore = new MemoryAuthStore();
    const store = new MemoryQuickPlayStore();
    const alice = await signUp(authStore, 'alice');
    await handleQuickPlay(req('POST', '/api/quickplay/queue', undefined, alice.cookie), authStore, store, ctx());
    expect(await store.isQueued(alice.id)).toBe(true);

    await handleQuickPlay(req('POST', '/api/quickplay/queue/leave', undefined, alice.cookie), authStore, store, ctx());
    expect(await store.isQueued(alice.id)).toBe(false);
  });

  it('status reflects whether the caller is queued', async () => {
    const authStore = new MemoryAuthStore();
    const store = new MemoryQuickPlayStore();
    const alice = await signUp(authStore, 'alice');
    const before = await handleQuickPlay(
      req('GET', '/api/quickplay/queue/status', undefined, alice.cookie),
      authStore,
      store,
      ctx(),
    );
    expect(await before?.json()).toEqual({ queued: false, match: null });

    await handleQuickPlay(req('POST', '/api/quickplay/queue', undefined, alice.cookie), authStore, store, ctx());
    const after = await handleQuickPlay(
      req('GET', '/api/quickplay/queue/status', undefined, alice.cookie),
      authStore,
      store,
      ctx(),
    );
    expect(await after?.json()).toEqual({ queued: true, match: null });
  });

  it('status resolves the active match once a waiting user gets matched', async () => {
    const authStore = new MemoryAuthStore();
    const store = new MemoryQuickPlayStore();
    const opener = new SpyRoomOpener();
    const alice = await signUp(authStore, 'alice');
    const bob = await signUp(authStore, 'bob');

    await handleQuickPlay(req('POST', '/api/quickplay/queue', undefined, alice.cookie), authStore, store, ctx(), opener);
    await handleQuickPlay(
      req('POST', '/api/quickplay/queue', undefined, bob.cookie),
      authStore,
      store,
      ctx({ now: NOW + 1000 }),
      opener,
    );

    const status = await handleQuickPlay(
      req('GET', '/api/quickplay/queue/status', undefined, alice.cookie),
      authStore,
      store,
      ctx(),
      opener,
    );
    const body = (await status?.json()) as { queued: boolean; match: { room_code: string; side: string } | null };
    expect(body.queued).toBe(false);
    expect(body.match?.side).toBe('a');
    expect(body.match?.room_code).toMatch(/^[A-Z0-9]{4}$/);
  });

  it('status resolves a private host once the invite is redeemed', async () => {
    const authStore = new MemoryAuthStore();
    const store = new MemoryQuickPlayStore();
    const opener = new SpyRoomOpener();
    const alice = await signUp(authStore, 'alice');
    const bob = await signUp(authStore, 'bob');

    const createRes = await handleQuickPlay(
      req('POST', '/api/quickplay/private', undefined, alice.cookie),
      authStore,
      store,
      ctx(),
      opener,
    );
    const { invite_code } = (await createRes?.json()) as { invite_code: string };
    await handleQuickPlay(
      req('POST', `/api/quickplay/private/${invite_code}/join`, undefined, bob.cookie),
      authStore,
      store,
      ctx(),
      opener,
    );

    const status = await handleQuickPlay(
      req('GET', '/api/quickplay/queue/status', undefined, alice.cookie),
      authStore,
      store,
      ctx(),
      opener,
    );
    const body = (await status?.json()) as { queued: boolean; match: { room_code: string; side: string } | null };
    expect(body.match?.side).toBe('a');
    expect(body.match?.room_code).toMatch(/^[A-Z0-9]{4}$/);
  });

  it('creates and redeems a private game end to end', async () => {
    const authStore = new MemoryAuthStore();
    const store = new MemoryQuickPlayStore();
    const opener = new SpyRoomOpener();
    const alice = await signUp(authStore, 'alice');
    const bob = await signUp(authStore, 'bob');

    const createRes = await handleQuickPlay(
      req('POST', '/api/quickplay/private', undefined, alice.cookie),
      authStore,
      store,
      ctx(),
      opener,
    );
    const { invite_code } = (await createRes?.json()) as { invite_code: string };
    expect(invite_code).toMatch(/^[A-Z0-9]{6}$/);

    const joinRes = await handleQuickPlay(
      req('POST', `/api/quickplay/private/${invite_code}/join`, undefined, bob.cookie),
      authStore,
      store,
      ctx(),
      opener,
    );
    const joinBody = (await joinRes?.json()) as { match: { room_code: string; rated: boolean; side: string } };
    expect(joinBody.match.rated).toBe(false);
    expect(joinBody.match.side).toBe('b');
    expect(joinBody.match.room_code).toMatch(/^[A-Z0-9]{4}$/);
  });

  it('matches endpoint is 403 for a non-participant', async () => {
    const authStore = new MemoryAuthStore();
    const store = new MemoryQuickPlayStore();
    const alice = await signUp(authStore, 'alice');
    const bob = await signUp(authStore, 'bob');
    const match = await createPrivateMatch(store, alice.id, NOW);

    const response = await handleQuickPlay(
      req('GET', `/api/quickplay/matches/${match.id}`, undefined, bob.cookie),
      authStore,
      store,
      ctx(),
    );
    expect(response?.status).toBe(403);
  });
});
