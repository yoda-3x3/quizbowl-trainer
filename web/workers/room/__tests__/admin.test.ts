/**
 * Endpoint tests for the admin module.
 *
 * Mirrors auth/tournaments: in-memory shims for AuthStore, TournamentStore and
 * AdminStore so the dispatch logic runs without a D1 harness. The admin store
 * is deliberately independent from the other two so the shims here do not
 * perturb the ones used by the other test files.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  handleTournaments,
  type AttemptRow,
  type ProtestRow,
  type ProtestState,
  type TournamentPlayerRow,
  type TournamentQuestionRow,
  type TournamentRow,
  type TournamentState,
  type TournamentStore,
} from '../tournaments';
import { handleAdmin, type AdminStore } from '../admin';

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

interface StoredSession {
  userId: number;
  createdAt: number;
  expiresAt: number;
}

class MemoryAuthStore implements AuthStore {
  private nextId = 1;
  public users = new Map<number, StoredUser>();
  public sessionsByToken = new Map<string, StoredSession>();

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
  async createUser(
    username: string,
    pwHash: string,
    role: Role,
    createdAt: number,
  ): Promise<number> {
    const id = this.nextId++;
    this.users.set(id, { id, username, pwHash, role, createdAt, bannedAt: null });
    return id;
  }
  async createSession(
    token: string,
    userId: number,
    createdAt: number,
    expiresAt: number,
  ): Promise<void> {
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

class MemoryTournamentStore implements TournamentStore {
  private nextId = 1;
  private nextProtestId = 1;
  private nextAttemptId = 1;
  public tournaments = new Map<number, TournamentRow>();
  public players: TournamentPlayerRow[] = [];
  public questions: TournamentQuestionRow[] = [];
  public protests: ProtestRow[] = [];
  public attempts: AttemptRow[] = [];

  async createTournament(t: Omit<TournamentRow, 'id'>): Promise<number> {
    const id = this.nextId++;
    this.tournaments.set(id, { ...t, id });
    return id;
  }
  async findTournament(id: number): Promise<TournamentRow | null> {
    const t = this.tournaments.get(id);
    return t ? { ...t } : null;
  }
  async listUnfinished(): Promise<TournamentRow[]> {
    return [...this.tournaments.values()]
      .filter((t) => t.state !== 'finished')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((t) => ({ ...t }));
  }
  async setTournamentState(
    id: number,
    state: TournamentState,
    startedAt: number | null,
    finishedAt: number | null,
  ): Promise<void> {
    const t = this.tournaments.get(id);
    if (!t) return;
    t.state = state;
    t.startedAt = startedAt;
    t.finishedAt = finishedAt;
  }
  async addPlayer(p: TournamentPlayerRow): Promise<void> {
    this.players.push({ ...p });
  }
  async findPlayer(tournamentId: number, userId: number): Promise<TournamentPlayerRow | null> {
    const row = this.players.find(
      (p) => p.tournamentId === tournamentId && p.userId === userId,
    );
    return row ? { ...row } : null;
  }
  async listPlayers(tournamentId: number): Promise<TournamentPlayerRow[]> {
    return this.players
      .filter((p) => p.tournamentId === tournamentId)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({ ...p }));
  }
  async addQuestions(
    tournamentId: number,
    qs: ReadonlyArray<Omit<TournamentQuestionRow, 'tournamentId'>>,
  ): Promise<void> {
    for (const q of qs) this.questions.push({ tournamentId, ...q });
  }
  async listQuestions(tournamentId: number): Promise<TournamentQuestionRow[]> {
    return this.questions
      .filter((q) => q.tournamentId === tournamentId)
      .sort((a, b) => a.seq - b.seq)
      .map((q) => ({ ...q }));
  }
  async createProtest(p: Omit<ProtestRow, 'id'>): Promise<number> {
    const id = this.nextProtestId++;
    this.protests.push({ ...p, id });
    return id;
  }
  async listProtestsForUser(tournamentId: number, userId: number): Promise<ProtestRow[]> {
    return this.protests
      .filter((p) => p.tournamentId === tournamentId && p.raisedBy === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => ({ ...p }));
  }
  async listProtestsForTournament(tournamentId: number): Promise<ProtestRow[]> {
    return this.protests
      .filter((p) => p.tournamentId === tournamentId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => ({ ...p }));
  }

  async createAttempt(a: Omit<AttemptRow, 'id'>): Promise<number> {
    const id = this.nextAttemptId++;
    this.attempts.push({ ...a, id });
    return id;
  }

  async listAttempts(tournamentId: number): Promise<AttemptRow[]> {
    return this.attempts
      .filter((a) => a.tournamentId === tournamentId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((a) => ({ ...a }));
  }

  async findAttemptForProtest(
    tournamentId: number,
    userId: number,
    questionId: string,
  ): Promise<AttemptRow | null> {
    const matches = this.attempts.filter(
      (a) =>
        a.tournamentId === tournamentId &&
        a.userId === userId &&
        (a.questionId === questionId || a.questionId.startsWith(`${questionId}#`)),
    );
    if (matches.length === 0) return null;
    matches.sort((a, b) => b.createdAt - a.createdAt);
    return matches[0] ? { ...matches[0] } : null;
  }

  async applyAttemptRestitution(
    attemptId: number,
    delta: number,
    restitutedAt: number,
  ): Promise<void> {
    const a = this.attempts.find((x) => x.id === attemptId);
    if (!a) return;
    a.restitutionDelta = delta;
    a.restitutedAt = restitutedAt;
  }
}

class MemoryAdminStore implements AdminStore {
  constructor(
    private authStore: MemoryAuthStore,
    private tStore: MemoryTournamentStore,
  ) {}

  async listUsers({ q, offset, limit }: { q: string; offset: number; limit: number }) {
    const needle = q.toLowerCase();
    const all = [...this.authStore.users.values()]
      .filter((u) => u.username.toLowerCase().includes(needle))
      .sort((a, b) => a.id - b.id)
      .map((u) => ({ ...u }));
    return {
      rows: all.slice(offset, offset + limit),
      total: all.length,
    };
  }

  async setUserRole(id: number, role: Role): Promise<void> {
    const u = this.authStore.users.get(id);
    if (!u) return;
    u.role = role;
  }

  async setUserBanned(id: number, bannedAt: number | null): Promise<void> {
    const u = this.authStore.users.get(id);
    if (!u) return;
    u.bannedAt = bannedAt;
  }

  async deleteSessionsForUser(userId: number): Promise<void> {
    for (const [token, s] of this.authStore.sessionsByToken) {
      if (s.userId === userId) this.authStore.sessionsByToken.delete(token);
    }
  }

  async listProtests(state: ProtestState | null): Promise<ProtestRow[]> {
    return this.tStore.protests
      .filter((p) => state === null || p.state === state)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => ({ ...p }));
  }

  async findProtest(id: number): Promise<ProtestRow | null> {
    const p = this.tStore.protests.find((x) => x.id === id);
    return p ? { ...p } : null;
  }

  async resolveProtest(
    id: number,
    state: ProtestState,
    resolvedBy: number,
    resolvedAt: number,
    note: string | null,
  ): Promise<void> {
    const p = this.tStore.protests.find((x) => x.id === id);
    if (!p) return;
    p.state = state;
    p.resolvedBy = resolvedBy;
    p.resolvedAt = resolvedAt;
    p.resolvedNote = note;
  }
}

// ---------------------------------------------------------------------------
// Harness helpers
// ---------------------------------------------------------------------------

const NOW = 1_700_000_000_000;

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return { ip: '203.0.113.9', colo: 'ORD', now: NOW, ...overrides };
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

function cookieHeaderOf(response: Response): string | null {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return null;
  const token = parseSessionCookie(setCookie);
  return token ? `session=${token}` : null;
}

interface Seeded {
  authStore: MemoryAuthStore;
  tStore: MemoryTournamentStore;
  admin: MemoryAdminStore;
  aliceCookie: string;
  bobCookie: string;
  carolCookie: string;
}

async function seed(): Promise<Seeded> {
  const authStore = new MemoryAuthStore();
  const tStore = new MemoryTournamentStore();
  const admin = new MemoryAdminStore(authStore, tStore);

  // First signup is seeded as admin.
  const aRes = await handleAuth(
    req('POST', '/api/auth/signup', { username: 'alice', password: 'password1' }),
    authStore,
    ctx(),
  );
  const aliceCookie = cookieHeaderOf(aRes as Response) ?? '';

  const bRes = await handleAuth(
    req('POST', '/api/auth/signup', { username: 'bob', password: 'password1' }),
    authStore,
    ctx(),
  );
  const bobCookie = cookieHeaderOf(bRes as Response) ?? '';

  const cRes = await handleAuth(
    req('POST', '/api/auth/signup', { username: 'carol', password: 'password1' }),
    authStore,
    ctx(),
  );
  const carolCookie = cookieHeaderOf(cRes as Response) ?? '';

  return { authStore, tStore, admin, aliceCookie, bobCookie, carolCookie };
}

/**
 * Builds a seeded setup with a started tournament and one pending protest from
 * bob. Alice is admin + creator; bob is a player. Returns handles.
 */
async function withProtest(): Promise<
  Seeded & { tournamentId: number; protestId: number }
> {
  const seeded = await seed();
  await handleTournaments(
    req(
      'POST',
      '/api/tournaments',
      { name: 'Friday Quiz', format: 'tossups', n_tossups: 1, team: 'Red' },
      seeded.aliceCookie,
    ),
    seeded.authStore,
    seeded.tStore,
    ctx(),
  );
  await handleTournaments(
    req('POST', '/api/tournaments/1/join', { team: 'Blue' }, seeded.bobCookie),
    seeded.authStore,
    seeded.tStore,
    ctx(),
  );
  await handleTournaments(
    req(
      'POST',
      '/api/tournaments/1/start',
      { questions: [{ seq: 0, question_id: 'q0', question_kind: 'tossup' }] },
      seeded.aliceCookie,
    ),
    seeded.authStore,
    seeded.tStore,
    ctx(),
  );
  const protestRes = await handleTournaments(
    req(
      'POST',
      '/api/tournaments/1/protest',
      {
        question_id: 'q0',
        reason: 'the answer I gave was equivalent to the expected one',
        given_answer: 'dickens',
      },
      seeded.bobCookie,
    ),
    seeded.authStore,
    seeded.tStore,
    ctx(),
  );
  const pBody = (await (protestRes as Response).json()) as { id: number };
  return { ...seeded, tournamentId: 1, protestId: pBody.id };
}

beforeEach(() => {
  __resetRateLimit();
});

afterEach(() => {
  __resetRateLimit();
});

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

describe('admin dispatch', () => {
  it('returns null for an unrelated path', async () => {
    const { authStore, tStore, admin } = await seed();
    const res = await handleAdmin(
      req('GET', '/api/tournaments'),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res).toBeNull();
  });

  it('401s an anonymous caller on every endpoint', async () => {
    const { authStore, tStore, admin } = await seed();
    const paths: Array<[string, string, unknown?]> = [
      ['GET', '/api/admin/users'],
      ['POST', '/api/admin/users/2/role', { role: 'admin' }],
      ['POST', '/api/admin/users/2/ban'],
      ['POST', '/api/admin/users/2/unban'],
      ['GET', '/api/admin/rooms'],
      ['POST', '/api/admin/rooms/ABCD/close'],
      ['GET', '/api/admin/packets'],
      ['POST', '/api/admin/packets/x/remove'],
      ['GET', '/api/admin/protests'],
      ['POST', '/api/admin/protests/1/resolve', { decision: 'accepted' }],
    ];
    for (const [m, p, body] of paths) {
      const res = await handleAdmin(req(m, p, body), authStore, admin, tStore, ctx());
      expect(res?.status, `${m} ${p}`).toBe(401);
    }
  });

  it('403s a signed-in non-admin on every endpoint', async () => {
    const { authStore, tStore, admin, bobCookie } = await seed();
    const paths: Array<[string, string, unknown?]> = [
      ['GET', '/api/admin/users'],
      ['POST', '/api/admin/users/2/role', { role: 'admin' }],
      ['POST', '/api/admin/users/2/ban'],
      ['POST', '/api/admin/users/2/unban'],
      ['GET', '/api/admin/rooms'],
      ['POST', '/api/admin/rooms/ABCD/close'],
      ['GET', '/api/admin/packets'],
      ['POST', '/api/admin/packets/x/remove'],
      ['GET', '/api/admin/protests'],
      ['POST', '/api/admin/protests/1/resolve', { decision: 'accepted' }],
    ];
    for (const [m, p, body] of paths) {
      const res = await handleAdmin(
        req(m, p, body, bobCookie),
        authStore,
        admin,
        tStore,
        ctx(),
      );
      expect(res?.status, `${m} ${p}`).toBe(403);
    }
  });

  it('405s a DELETE to a known collection', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('DELETE', '/api/admin/users', undefined, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(405);
  });

  it('404s on an unknown admin path', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('GET', '/api/admin/things', undefined, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/users
// ---------------------------------------------------------------------------

describe('GET /api/admin/users', () => {
  it('admin sees every user, in id order, with page metadata', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('GET', '/api/admin/users', undefined, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      users: Array<{ id: number; username: string; role: string }>;
      page: number;
      pageCount: number;
      total: number;
    };
    expect(body.users.map((u) => u.username)).toEqual(['alice', 'bob', 'carol']);
    expect(body.users.find((u) => u.username === 'alice')?.role).toBe('admin');
    expect(body.users.find((u) => u.username === 'bob')?.role).toBe('user');
    expect(body.page).toBe(1);
    expect(body.total).toBe(3);
    expect(body.pageCount).toBe(1);
  });

  it('filters by substring q', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('GET', '/api/admin/users?q=ca', undefined, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      users: Array<{ username: string }>;
      total: number;
    };
    expect(body.users.map((u) => u.username)).toEqual(['carol']);
    expect(body.total).toBe(1);
  });

  it('paginates', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const page1 = await handleAdmin(
      req('GET', '/api/admin/users?limit=2&page=1', undefined, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    const body1 = (await (page1 as Response).json()) as {
      users: Array<{ username: string }>;
      pageCount: number;
      total: number;
    };
    expect(body1.users.map((u) => u.username)).toEqual(['alice', 'bob']);
    expect(body1.pageCount).toBe(2);
    expect(body1.total).toBe(3);

    const page2 = await handleAdmin(
      req('GET', '/api/admin/users?limit=2&page=2', undefined, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    const body2 = (await (page2 as Response).json()) as {
      users: Array<{ username: string }>;
    };
    expect(body2.users.map((u) => u.username)).toEqual(['carol']);
  });

  it('caps limit at 50', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    // Avoid an expensive pbkdf2 handshake for each seeded row: load the auth
    // store directly instead of signing up every user via the endpoint.
    for (let i = 0; i < 60; i++) {
      await authStore.createUser(
        `user${i.toString().padStart(2, '0')}`,
        'pbkdf2$1$AAAA$AAAA',
        'user',
        NOW,
      );
    }
    const res = await handleAdmin(
      req('GET', '/api/admin/users?limit=500', undefined, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    const body = (await (res as Response).json()) as {
      users: Array<unknown>;
    };
    expect(body.users.length).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/role
// ---------------------------------------------------------------------------

describe('POST /api/admin/users/:id/role', () => {
  it('400s on an invalid role', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/users/2/role', { role: 'owner' }, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('404s for an unknown user', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/users/999/role', { role: 'admin' }, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });

  it('refuses to demote yourself', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/users/1/role', { role: 'user' }, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
    const u = await authStore.findUserById(1);
    expect(u?.role).toBe('admin');
  });

  it('allows self → admin (no-op pass-through)', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/users/1/role', { role: 'admin' }, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
  });

  it('promotes bob to admin', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/users/2/role', { role: 'admin' }, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      user: { username: string; role: string };
    };
    expect(body.user).toMatchObject({ username: 'bob', role: 'admin' });
    const bob = await authStore.findUserById(2);
    expect(bob?.role).toBe('admin');
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/ban
// ---------------------------------------------------------------------------

describe('POST /api/admin/users/:id/ban', () => {
  it('refuses to ban yourself', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/users/1/ban', {}, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
    const u = await authStore.findUserById(1);
    expect(u?.bannedAt).toBeNull();
  });

  it('404s an unknown user', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/users/999/ban', {}, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });

  it('sets banned_at and deletes the user’s sessions', async () => {
    const { authStore, tStore, admin, aliceCookie, bobCookie } = await seed();
    // Pre-check: bob has a live session.
    const before = [...authStore.sessionsByToken.values()].filter(
      (s) => s.userId === 2,
    );
    expect(before.length).toBeGreaterThan(0);

    const res = await handleAdmin(
      req('POST', '/api/admin/users/2/ban', {}, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      user: { username: string; banned_at: number | null };
    };
    expect(body.user.banned_at).toBe(NOW);

    // Bob's sessions were deleted, so his cookie no longer resolves.
    const after = [...authStore.sessionsByToken.values()].filter(
      (s) => s.userId === 2,
    );
    expect(after.length).toBe(0);
    // Sanity: the cookie value itself is still there, but it won't authenticate.
    expect(bobCookie).toContain('session=');
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/unban
// ---------------------------------------------------------------------------

describe('POST /api/admin/users/:id/unban', () => {
  it('clears banned_at', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    await handleAdmin(
      req('POST', '/api/admin/users/2/ban', {}, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    const bannedBob = await authStore.findUserById(2);
    expect(bannedBob?.bannedAt).toBe(NOW);

    const res = await handleAdmin(
      req('POST', '/api/admin/users/2/unban', {}, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const unbanned = await authStore.findUserById(2);
    expect(unbanned?.bannedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rooms stubs
// ---------------------------------------------------------------------------

describe('GET /api/admin/rooms', () => {
  it('returns an empty list with a note', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('GET', '/api/admin/rooms', undefined, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      rooms: unknown[];
      note: string;
    };
    expect(body.rooms).toEqual([]);
    expect(body.note).toMatch(/live listing/i);
  });
});

describe('POST /api/admin/rooms/:code/close', () => {
  it('is a 501 stub', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/rooms/ABCD/close', {}, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(501);
  });
});

// ---------------------------------------------------------------------------
// Packets stubs
// ---------------------------------------------------------------------------

describe('GET /api/admin/packets', () => {
  it('returns an empty list with a note', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('GET', '/api/admin/packets', undefined, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      packets: unknown[];
      note: string;
    };
    expect(body.packets).toEqual([]);
    expect(body.note).toMatch(/client-side/i);
  });
});

describe('POST /api/admin/packets/:id/remove', () => {
  it('is a 404 stub', async () => {
    const { authStore, tStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/packets/abc/remove', {}, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/protests
// ---------------------------------------------------------------------------

describe('GET /api/admin/protests', () => {
  it('defaults to pending and includes tournament + raiser names', async () => {
    const { authStore, tStore, admin, aliceCookie } = await withProtest();
    const res = await handleAdmin(
      req('GET', '/api/admin/protests', undefined, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      protests: Array<{
        id: number;
        state: string;
        tournament_name: string;
        raised_by_username: string;
        given_answer: string;
      }>;
    };
    expect(body.protests).toHaveLength(1);
    expect(body.protests[0]).toMatchObject({
      state: 'pending',
      tournament_name: 'Friday Quiz',
      raised_by_username: 'bob',
      given_answer: 'dickens',
    });
  });

  it('state=accepted excludes pending protests', async () => {
    const { authStore, tStore, admin, aliceCookie } = await withProtest();
    const res = await handleAdmin(
      req('GET', '/api/admin/protests?state=accepted', undefined, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    const body = (await (res as Response).json()) as {
      protests: unknown[];
    };
    expect(body.protests).toEqual([]);
  });

  it('state=all returns protests in every state', async () => {
    const seeded = await withProtest();
    await handleAdmin(
      req(
        'POST',
        `/api/admin/protests/${seeded.protestId}/resolve`,
        { decision: 'rejected' },
        seeded.aliceCookie,
      ),
      seeded.authStore,
      seeded.admin,
      seeded.tStore,
      ctx(),
    );
    const res = await handleAdmin(
      req('GET', '/api/admin/protests?state=all', undefined, seeded.aliceCookie),
      seeded.authStore,
      seeded.admin,
      seeded.tStore,
      ctx(),
    );
    const body = (await (res as Response).json()) as {
      protests: Array<{ state: string }>;
    };
    expect(body.protests.map((p) => p.state)).toEqual(['rejected']);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/protests/:id/resolve
// ---------------------------------------------------------------------------

describe('POST /api/admin/protests/:id/resolve', () => {
  it('400s on an invalid decision', async () => {
    const { authStore, tStore, admin, aliceCookie, protestId } = await withProtest();
    const res = await handleAdmin(
      req(
        'POST',
        `/api/admin/protests/${protestId}/resolve`,
        { decision: 'maybe' },
        aliceCookie,
      ),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('404s an unknown protest id', async () => {
    const { authStore, tStore, admin, aliceCookie } = await withProtest();
    const res = await handleAdmin(
      req(
        'POST',
        '/api/admin/protests/999/resolve',
        { decision: 'accepted' },
        aliceCookie,
      ),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });

  it('accepts a pending protest, records resolver + timestamp + note', async () => {
    const { authStore, tStore, admin, aliceCookie, protestId } = await withProtest();
    const res = await handleAdmin(
      req(
        'POST',
        `/api/admin/protests/${protestId}/resolve`,
        { decision: 'accepted', note: 'the alternate answer is standard' },
        aliceCookie,
      ),
      authStore,
      admin,
      tStore,
      ctx({ now: NOW + 500 }),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      protest: {
        state: string;
        resolved_by: number | null;
        resolved_at: number | null;
        resolved_note: string | null;
      };
    };
    expect(body.protest.state).toBe('accepted');
    expect(body.protest.resolved_by).toBe(1); // alice
    expect(body.protest.resolved_at).toBe(NOW + 500);
    expect(body.protest.resolved_note).toBe('the alternate answer is standard');
  });

  it('empty-string note persists as null', async () => {
    const { authStore, tStore, admin, aliceCookie, protestId } = await withProtest();
    const res = await handleAdmin(
      req(
        'POST',
        `/api/admin/protests/${protestId}/resolve`,
        { decision: 'rejected', note: '  ' },
        aliceCookie,
      ),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    const body = (await (res as Response).json()) as {
      protest: { resolved_note: string | null };
    };
    expect(body.protest.resolved_note).toBeNull();
  });

  it('400s a protest that is already resolved', async () => {
    const { authStore, tStore, admin, aliceCookie, protestId } = await withProtest();
    await handleAdmin(
      req(
        'POST',
        `/api/admin/protests/${protestId}/resolve`,
        { decision: 'accepted' },
        aliceCookie,
      ),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    const res = await handleAdmin(
      req(
        'POST',
        `/api/admin/protests/${protestId}/resolve`,
        { decision: 'rejected' },
        aliceCookie,
      ),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('after resolution, the pending list no longer contains the protest', async () => {
    const { authStore, tStore, admin, aliceCookie, protestId } = await withProtest();
    await handleAdmin(
      req(
        'POST',
        `/api/admin/protests/${protestId}/resolve`,
        { decision: 'rejected' },
        aliceCookie,
      ),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    const res = await handleAdmin(
      req('GET', '/api/admin/protests', undefined, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    const body = (await (res as Response).json()) as { protests: unknown[] };
    expect(body.protests).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Protest restitution
// ---------------------------------------------------------------------------

/**
 * Seeds a started tournament, has bob record a tossup attempt that was ruled
 * incorrect (reject, -5), then has bob file a protest on it. Returns the
 * tournament, the attempt and the protest. The protest is still pending.
 */
async function withNeggedAttemptAndProtest(): Promise<
  Seeded & { tournamentId: number; protestId: number; attemptId: number }
> {
  const seeded = await seed();
  await handleTournaments(
    req(
      'POST',
      '/api/tournaments',
      { name: 'Delta', format: 'tossups', n_tossups: 1 },
      seeded.aliceCookie,
    ),
    seeded.authStore,
    seeded.tStore,
    ctx(),
  );
  await handleTournaments(
    req('POST', '/api/tournaments/1/join', { team: 'Blue' }, seeded.bobCookie),
    seeded.authStore,
    seeded.tStore,
    ctx(),
  );
  await handleTournaments(
    req(
      'POST',
      '/api/tournaments/1/start',
      { questions: [{ seq: 0, question_id: 'q0', question_kind: 'tossup' }] },
      seeded.aliceCookie,
    ),
    seeded.authStore,
    seeded.tStore,
    ctx(),
  );
  const attemptRes = await handleTournaments(
    req(
      'POST',
      '/api/tournaments/1/attempts',
      {
        seq: 0,
        question_id: 'q0',
        given_answer: 'dickens',
        directive: 'reject',
        points: -5,
        powered: false,
        buzz_word_index: 12,
        total_words: 40,
        power_word_index: 7,
        ms_to_answer: 1500,
      },
      seeded.bobCookie,
    ),
    seeded.authStore,
    seeded.tStore,
    ctx(),
  );
  const { id: attemptId } = (await (attemptRes as Response).json()) as {
    id: number;
  };
  const protestRes = await handleTournaments(
    req(
      'POST',
      '/api/tournaments/1/protest',
      {
        question_id: 'q0',
        reason: 'my answer was in fact equivalent to the expected one',
        given_answer: 'dickens',
      },
      seeded.bobCookie,
    ),
    seeded.authStore,
    seeded.tStore,
    ctx(),
  );
  const { id: protestId } = (await (protestRes as Response).json()) as {
    id: number;
  };
  return { ...seeded, tournamentId: 1, protestId, attemptId };
}

describe('POST /api/admin/protests/:id/resolve — restitution', () => {
  it('accepted protest on a negged tossup restitutes to the "correct" points', async () => {
    // Buzz was before the (*) power mark (powerWordIndex=7, buzzWordIndex=12).
    // Actually buzz=12 > power=7 so this is a non-powered correct buzz: +10.
    // From -5 to +10 → delta +15.
    const { authStore, tStore, admin, aliceCookie, protestId, attemptId } =
      await withNeggedAttemptAndProtest();
    const res = await handleAdmin(
      req(
        'POST',
        `/api/admin/protests/${protestId}/resolve`,
        { decision: 'accepted' },
        aliceCookie,
      ),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      protest: { state: string; restitution_delta: number | null };
    };
    expect(body.protest.state).toBe('accepted');
    expect(body.protest.restitution_delta).toBe(15);

    const attempts = await tStore.listAttempts(1);
    const bobAttempt = attempts.find((a) => a.id === attemptId);
    expect(bobAttempt?.restitutionDelta).toBe(15);
    expect(bobAttempt?.restitutedAt).not.toBeNull();
  });

  it('powered buzz on a negged tossup restitutes to +15 from -5 (delta +20)', async () => {
    const seeded = await seed();
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments',
        { name: 'Power Delta', format: 'tossups', n_tossups: 1 },
        seeded.aliceCookie,
      ),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    await handleTournaments(
      req('POST', '/api/tournaments/1/join', { team: 'Blue' }, seeded.bobCookie),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/start',
        { questions: [{ seq: 0, question_id: 'qp', question_kind: 'tossup' }] },
        seeded.aliceCookie,
      ),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    // Buzz is at word 3, power ends at word 7, so a correct buzz would power.
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/attempts',
        {
          seq: 0,
          question_id: 'qp',
          given_answer: 'dickens',
          directive: 'reject',
          points: -5,
          powered: false,
          buzz_word_index: 3,
          total_words: 40,
          power_word_index: 7,
          ms_to_answer: 900,
        },
        seeded.bobCookie,
      ),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    const protestRes = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/protest',
        {
          question_id: 'qp',
          reason: 'equivalent answer rejected unfairly in a powered buzz',
          given_answer: 'dickens',
        },
        seeded.bobCookie,
      ),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    const { id: protestId } = (await (protestRes as Response).json()) as {
      id: number;
    };

    const res = await handleAdmin(
      req(
        'POST',
        `/api/admin/protests/${protestId}/resolve`,
        { decision: 'accepted' },
        seeded.aliceCookie,
      ),
      seeded.authStore,
      new MemoryAdminStore(seeded.authStore, seeded.tStore),
      seeded.tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      protest: { restitution_delta: number };
    };
    expect(body.protest.restitution_delta).toBe(20);
  });

  it('rejected protest writes no restitution', async () => {
    const { authStore, tStore, admin, aliceCookie, protestId, attemptId } =
      await withNeggedAttemptAndProtest();
    const res = await handleAdmin(
      req(
        'POST',
        `/api/admin/protests/${protestId}/resolve`,
        { decision: 'rejected' },
        aliceCookie,
      ),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      protest: { restitution_delta: number | null };
    };
    expect(body.protest.restitution_delta).toBe(null);

    const attempts = await tStore.listAttempts(1);
    const bobAttempt = attempts.find((a) => a.id === attemptId);
    expect(bobAttempt?.restitutionDelta).toBe(0);
    expect(bobAttempt?.restitutedAt).toBe(null);
  });

  it('accepted protest with no matching attempt still succeeds but writes no delta', async () => {
    // Set up a tournament where bob files a protest without ever recording an
    // attempt — a client that crashed mid-question.
    const seeded = await seed();
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments',
        { name: 'Empty', format: 'tossups', n_tossups: 1 },
        seeded.aliceCookie,
      ),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    await handleTournaments(
      req('POST', '/api/tournaments/1/join', { team: 'Blue' }, seeded.bobCookie),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/start',
        { questions: [{ seq: 0, question_id: 'q0', question_kind: 'tossup' }] },
        seeded.aliceCookie,
      ),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    const protestRes = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/protest',
        {
          question_id: 'q0',
          reason: 'client crashed and never recorded, but I want this reviewed',
        },
        seeded.bobCookie,
      ),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    const { id: protestId } = (await (protestRes as Response).json()) as {
      id: number;
    };
    const admin = new MemoryAdminStore(seeded.authStore, seeded.tStore);
    const res = await handleAdmin(
      req(
        'POST',
        `/api/admin/protests/${protestId}/resolve`,
        { decision: 'accepted' },
        seeded.aliceCookie,
      ),
      seeded.authStore,
      admin,
      seeded.tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      protest: { restitution_delta: number | null };
    };
    expect(body.protest.restitution_delta).toBe(null);
  });

  it('accepted protest on a missed bonus part restitutes to the part value', async () => {
    const seeded = await seed();
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments',
        {
          name: 'Bonus',
          format: 'tossups_bonuses',
          n_tossups: 1,
          n_bonuses: 1,
        },
        seeded.aliceCookie,
      ),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    await handleTournaments(
      req('POST', '/api/tournaments/1/join', { team: 'Blue' }, seeded.bobCookie),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/start',
        {
          questions: [
            { seq: 0, question_id: 't0', question_kind: 'tossup' },
            { seq: 1, question_id: 'b0', question_kind: 'bonus' },
          ],
        },
        seeded.aliceCookie,
      ),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    // Bonus part 0 got 0 points; the correct value is 10.
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/attempts',
        {
          seq: 1,
          question_id: 'b0#0',
          given_answer: 'dickens',
          directive: 'reject',
          points: 0,
          powered: false,
          buzz_word_index: null,
          total_words: 8,
          power_word_index: null,
          ms_to_answer: null,
        },
        seeded.bobCookie,
      ),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    const protestRes = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/protest',
        {
          question_id: 'b0',
          reason: 'bonus part 0 answer was equivalent and should have scored',
          given_answer: 'dickens',
        },
        seeded.bobCookie,
      ),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    const { id: protestId } = (await (protestRes as Response).json()) as {
      id: number;
    };
    const admin = new MemoryAdminStore(seeded.authStore, seeded.tStore);
    const res = await handleAdmin(
      req(
        'POST',
        `/api/admin/protests/${protestId}/resolve`,
        { decision: 'accepted' },
        seeded.aliceCookie,
      ),
      seeded.authStore,
      admin,
      seeded.tStore,
      ctx(),
    );
    const body = (await (res as Response).json()) as {
      protest: { restitution_delta: number };
    };
    expect(body.protest.restitution_delta).toBe(10);
  });

  it('surfaces the accepted delta in the list view', async () => {
    const { authStore, tStore, admin, aliceCookie, protestId } =
      await withNeggedAttemptAndProtest();
    await handleAdmin(
      req(
        'POST',
        `/api/admin/protests/${protestId}/resolve`,
        { decision: 'accepted' },
        aliceCookie,
      ),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    const res = await handleAdmin(
      req('GET', '/api/admin/protests?state=accepted', undefined, aliceCookie),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    const body = (await (res as Response).json()) as {
      protests: Array<{ id: number; restitution_delta: number | null }>;
    };
    expect(body.protests[0]?.restitution_delta).toBe(15);
  });

  it('scoreboard reflects the restitution after acceptance', async () => {
    const { authStore, tStore, admin, aliceCookie, protestId } =
      await withNeggedAttemptAndProtest();
    await handleAdmin(
      req(
        'POST',
        `/api/admin/protests/${protestId}/resolve`,
        { decision: 'accepted' },
        aliceCookie,
      ),
      authStore,
      admin,
      tStore,
      ctx(),
    );
    const res = await handleTournaments(
      req('GET', '/api/tournaments/1/scoreboard'),
      authStore,
      tStore,
      ctx(),
    );
    const body = (await (res as Response).json()) as {
      scoreboard: Array<{
        username: string;
        points: number;
        base_points: number;
        restitution_delta: number;
      }>;
    };
    const bob = body.scoreboard.find((e) => e.username === 'bob');
    expect(bob?.base_points).toBe(-5);
    expect(bob?.restitution_delta).toBe(15);
    expect(bob?.points).toBe(10);
  });
});
