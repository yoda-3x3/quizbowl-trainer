/**
 * Endpoint tests for the admin module.
 *
 * Mirrors auth/tournaments: in-memory shims for AuthStore and AdminStore so
 * the dispatch logic runs without a D1 harness. The admin store is deliberately
 * independent from the other two so the shims here do not perturb the ones
 * used by the other test files.
 *
 * This file covers the user-management endpoints. The rooms, packets and
 * protests coverage lands in the next commit.
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

class MemoryAdminStore implements AdminStore {
  constructor(private authStore: MemoryAuthStore) {}

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
  admin: MemoryAdminStore;
  aliceCookie: string;
  bobCookie: string;
  carolCookie: string;
}

async function seed(): Promise<Seeded> {
  const authStore = new MemoryAuthStore();
  const admin = new MemoryAdminStore(authStore);

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

  return { authStore, admin, aliceCookie, bobCookie, carolCookie };
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
    const { authStore, admin } = await seed();
    const res = await handleAdmin(
      req('GET', '/api/tournaments'),
      authStore,
      admin,
      ctx(),
    );
    expect(res).toBeNull();
  });

  it('401s an anonymous caller on every user endpoint', async () => {
    const { authStore, admin } = await seed();
    const paths: Array<[string, string, unknown?]> = [
      ['GET', '/api/admin/users'],
      ['POST', '/api/admin/users/2/role', { role: 'admin' }],
      ['POST', '/api/admin/users/2/ban'],
      ['POST', '/api/admin/users/2/unban'],
    ];
    for (const [m, p, body] of paths) {
      const res = await handleAdmin(req(m, p, body), authStore, admin, ctx());
      expect(res?.status, `${m} ${p}`).toBe(401);
    }
  });

  it('403s a signed-in non-admin on every user endpoint', async () => {
    const { authStore, admin, bobCookie } = await seed();
    const paths: Array<[string, string, unknown?]> = [
      ['GET', '/api/admin/users'],
      ['POST', '/api/admin/users/2/role', { role: 'admin' }],
      ['POST', '/api/admin/users/2/ban'],
      ['POST', '/api/admin/users/2/unban'],
    ];
    for (const [m, p, body] of paths) {
      const res = await handleAdmin(
        req(m, p, body, bobCookie),
        authStore,
        admin,
        ctx(),
      );
      expect(res?.status, `${m} ${p}`).toBe(403);
    }
  });

  it('405s a DELETE to /api/admin/users', async () => {
    const { authStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('DELETE', '/api/admin/users', undefined, aliceCookie),
      authStore,
      admin,
      ctx(),
    );
    expect(res?.status).toBe(405);
  });

  it('404s on an unknown admin path', async () => {
    const { authStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('GET', '/api/admin/things', undefined, aliceCookie),
      authStore,
      admin,
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
    const { authStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('GET', '/api/admin/users', undefined, aliceCookie),
      authStore,
      admin,
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
    const { authStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('GET', '/api/admin/users?q=ca', undefined, aliceCookie),
      authStore,
      admin,
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
    const { authStore, admin, aliceCookie } = await seed();
    const page1 = await handleAdmin(
      req('GET', '/api/admin/users?limit=2&page=1', undefined, aliceCookie),
      authStore,
      admin,
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
      ctx(),
    );
    const body2 = (await (page2 as Response).json()) as {
      users: Array<{ username: string }>;
    };
    expect(body2.users.map((u) => u.username)).toEqual(['carol']);
  });

  it('caps limit at 50', async () => {
    const { authStore, admin, aliceCookie } = await seed();
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
    const { authStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/users/2/role', { role: 'owner' }, aliceCookie),
      authStore,
      admin,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('404s for an unknown user', async () => {
    const { authStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/users/999/role', { role: 'admin' }, aliceCookie),
      authStore,
      admin,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });

  it('refuses to demote yourself', async () => {
    const { authStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/users/1/role', { role: 'user' }, aliceCookie),
      authStore,
      admin,
      ctx(),
    );
    expect(res?.status).toBe(400);
    const u = await authStore.findUserById(1);
    expect(u?.role).toBe('admin');
  });

  it('allows self -> admin (no-op pass-through)', async () => {
    const { authStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/users/1/role', { role: 'admin' }, aliceCookie),
      authStore,
      admin,
      ctx(),
    );
    expect(res?.status).toBe(200);
  });

  it('promotes bob to admin', async () => {
    const { authStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/users/2/role', { role: 'admin' }, aliceCookie),
      authStore,
      admin,
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
    const { authStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/users/1/ban', {}, aliceCookie),
      authStore,
      admin,
      ctx(),
    );
    expect(res?.status).toBe(400);
    const u = await authStore.findUserById(1);
    expect(u?.bannedAt).toBeNull();
  });

  it('404s an unknown user', async () => {
    const { authStore, admin, aliceCookie } = await seed();
    const res = await handleAdmin(
      req('POST', '/api/admin/users/999/ban', {}, aliceCookie),
      authStore,
      admin,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });

  it('sets banned_at and deletes the user’s sessions', async () => {
    const { authStore, admin, aliceCookie, bobCookie } = await seed();
    // Pre-check: bob has a live session.
    const before = [...authStore.sessionsByToken.values()].filter(
      (s) => s.userId === 2,
    );
    expect(before.length).toBeGreaterThan(0);

    const res = await handleAdmin(
      req('POST', '/api/admin/users/2/ban', {}, aliceCookie),
      authStore,
      admin,
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
    const { authStore, admin, aliceCookie } = await seed();
    await handleAdmin(
      req('POST', '/api/admin/users/2/ban', {}, aliceCookie),
      authStore,
      admin,
      ctx(),
    );
    const bannedBob = await authStore.findUserById(2);
    expect(bannedBob?.bannedAt).toBe(NOW);

    const res = await handleAdmin(
      req('POST', '/api/admin/users/2/unban', {}, aliceCookie),
      authStore,
      admin,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const unbanned = await authStore.findUserById(2);
    expect(unbanned?.bannedAt).toBeNull();
  });
});
