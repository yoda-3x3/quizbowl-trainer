/**
 * Endpoint tests for the auth module.
 *
 * Uses an in-memory AuthStore shim rather than a D1 test harness, since the
 * endpoints go through the store interface and the D1 adapter itself is a thin
 * SQL wrapper that only runs against the real binding.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  RATE_LIMIT_MAX,
  __resetRateLimit,
  authenticate,
  handleAuth,
  rateLimit,
  type AuthStore,
  type RequestContext,
  type Role,
  type StoredUser,
} from '../auth';
import { parseSessionCookie } from '../session';

class MemoryStore implements AuthStore {
  private nextId = 1;
  public users = new Map<number, StoredUser>();
  public sessions = new Map<number, { token: string; userId: number; createdAt: number; expiresAt: number }>();
  private sessionsByToken = new Map<string, { userId: number; createdAt: number; expiresAt: number }>();
  private nextSessionId = 1;

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
    this.users.set(id, {
      id,
      username,
      pwHash,
      role,
      createdAt,
      bannedAt: null,
    });
    return id;
  }

  async createSession(
    token: string,
    userId: number,
    createdAt: number,
    expiresAt: number,
  ): Promise<void> {
    this.sessions.set(this.nextSessionId++, { token, userId, createdAt, expiresAt });
    this.sessionsByToken.set(token, { userId, createdAt, expiresAt });
  }

  async findSession(token: string) {
    const s = this.sessionsByToken.get(token);
    return s ? { userId: s.userId, expiresAt: s.expiresAt } : null;
  }

  async deleteSession(token: string): Promise<void> {
    this.sessionsByToken.delete(token);
    for (const [k, v] of this.sessions.entries()) {
      if (v.token === token) this.sessions.delete(k);
    }
  }

  ban(id: number, at: number): void {
    const u = this.users.get(id);
    if (u) u.bannedAt = at;
  }
}

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

afterEach(() => {
  __resetRateLimit();
});

// ---------------------------------------------------------------------------
// Validation + routing
// ---------------------------------------------------------------------------

describe('route dispatch', () => {
  it('returns null for an unknown path so the caller can fall through', async () => {
    const store = new MemoryStore();
    const res = await handleAuth(req('GET', '/api/room'), store, ctx());
    expect(res).toBeNull();
  });

  it('405s a GET to /api/auth/signup', async () => {
    const store = new MemoryStore();
    const res = await handleAuth(req('GET', '/api/auth/signup'), store, ctx());
    expect(res?.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

describe('POST /api/auth/signup', () => {
  it('400s on a missing body', async () => {
    const store = new MemoryStore();
    const res = await handleAuth(
      new Request('https://x.example/api/auth/signup', { method: 'POST' }),
      store,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('400s on a short password', async () => {
    const store = new MemoryStore();
    const res = await handleAuth(
      req('POST', '/api/auth/signup', { username: 'alice', password: 'short' }),
      store,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('400s on a username with illegal characters', async () => {
    const store = new MemoryStore();
    const res = await handleAuth(
      req('POST', '/api/auth/signup', { username: 'a lice', password: 'password1' }),
      store,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('400s on a 2-character username', async () => {
    const store = new MemoryStore();
    const res = await handleAuth(
      req('POST', '/api/auth/signup', { username: 'ab', password: 'password1' }),
      store,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('seeds the first user as admin and sets a session cookie', async () => {
    const store = new MemoryStore();
    const res = await handleAuth(
      req('POST', '/api/auth/signup', { username: 'alice', password: 'password1' }),
      store,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const token = sessionCookieOf(res as Response);
    expect(token).not.toBeNull();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const body = await (res as Response).json();
    expect(body).toEqual({ user: { id: 1, username: 'alice', role: 'admin' } });
    expect(store.users.get(1)?.role).toBe('admin');
  });

  it('second user is a plain user, not admin', async () => {
    const store = new MemoryStore();
    await handleAuth(
      req('POST', '/api/auth/signup', { username: 'alice', password: 'password1' }),
      store,
      ctx(),
    );
    const res = await handleAuth(
      req('POST', '/api/auth/signup', { username: 'bob', password: 'password1' }),
      store,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as { user: { role: Role } };
    expect(body.user.role).toBe('user');
    expect(store.users.get(2)?.role).toBe('user');
  });

  it('409s on a taken username', async () => {
    const store = new MemoryStore();
    await handleAuth(
      req('POST', '/api/auth/signup', { username: 'alice', password: 'password1' }),
      store,
      ctx(),
    );
    const res = await handleAuth(
      req('POST', '/api/auth/signup', { username: 'alice', password: 'password1' }),
      store,
      ctx(),
    );
    expect(res?.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Signin
// ---------------------------------------------------------------------------

async function seed(store: MemoryStore, now: number): Promise<void> {
  const res = await handleAuth(
    req('POST', '/api/auth/signup', { username: 'alice', password: 'password1' }),
    store,
    ctx({ now }),
  );
  expect(res?.status).toBe(200);
}

describe('POST /api/auth/signin', () => {
  it('signs in with the right credentials', async () => {
    const store = new MemoryStore();
    await seed(store, NOW);
    const res = await handleAuth(
      req('POST', '/api/auth/signin', { username: 'alice', password: 'password1' }),
      store,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const token = sessionCookieOf(res as Response);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('401s on a wrong password', async () => {
    const store = new MemoryStore();
    await seed(store, NOW);
    const res = await handleAuth(
      req('POST', '/api/auth/signin', { username: 'alice', password: 'wrongpass' }),
      store,
      ctx(),
    );
    expect(res?.status).toBe(401);
  });

  it('401s on an unknown username', async () => {
    const store = new MemoryStore();
    await seed(store, NOW);
    const res = await handleAuth(
      req('POST', '/api/auth/signin', { username: 'bob', password: 'password1' }),
      store,
      ctx(),
    );
    expect(res?.status).toBe(401);
  });

  it('403s a banned account on signin', async () => {
    const store = new MemoryStore();
    await seed(store, NOW);
    store.ban(1, NOW + 1000);
    const res = await handleAuth(
      req('POST', '/api/auth/signin', { username: 'alice', password: 'password1' }),
      store,
      ctx(),
    );
    expect(res?.status).toBe(403);
  });

  it('rate-limits after 10 failed attempts and lets a fresh window through', async () => {
    const store = new MemoryStore();
    await seed(store, NOW);
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const res = await handleAuth(
        req('POST', '/api/auth/signin', { username: 'alice', password: 'wrongpass' }),
        store,
        ctx(),
      );
      expect(res?.status).toBe(401);
    }
    const blocked = await handleAuth(
      req('POST', '/api/auth/signin', { username: 'alice', password: 'password1' }),
      store,
      ctx(),
    );
    expect(blocked?.status).toBe(429);

    // 11 minutes later the bucket is fresh.
    const later = await handleAuth(
      req('POST', '/api/auth/signin', { username: 'alice', password: 'password1' }),
      store,
      ctx({ now: NOW + 11 * 60 * 1000 }),
    );
    expect(later?.status).toBe(200);
  });

  it('counts different usernames in different buckets', async () => {
    const store = new MemoryStore();
    await seed(store, NOW);
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      await handleAuth(
        req('POST', '/api/auth/signin', { username: 'alice', password: 'wrong' }),
        store,
        ctx(),
      );
    }
    // A different username from the same IP + colo is fine.
    const res = await handleAuth(
      req('POST', '/api/auth/signin', { username: 'bob', password: 'anything1' }),
      store,
      ctx(),
    );
    expect(res?.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Signout + me
// ---------------------------------------------------------------------------

describe('POST /api/auth/signout', () => {
  it('clears the cookie and deletes the session row', async () => {
    const store = new MemoryStore();
    const signupRes = await handleAuth(
      req('POST', '/api/auth/signup', { username: 'alice', password: 'password1' }),
      store,
      ctx(),
    );
    const token = sessionCookieOf(signupRes as Response) ?? '';
    expect(await store.findSession(token)).not.toBeNull();

    const res = await handleAuth(
      req('POST', '/api/auth/signout', undefined, `session=${token}`),
      store,
      ctx(),
    );
    expect(res?.status).toBe(200);
    expect((res as Response).headers.get('set-cookie')).toContain('Max-Age=0');
    expect(await store.findSession(token)).toBeNull();
  });

  it('signout without a cookie still 200s', async () => {
    const store = new MemoryStore();
    const res = await handleAuth(req('POST', '/api/auth/signout'), store, ctx());
    expect(res?.status).toBe(200);
  });
});

describe('GET /api/auth/me', () => {
  it('401s without a session cookie', async () => {
    const store = new MemoryStore();
    const res = await handleAuth(req('GET', '/api/auth/me'), store, ctx());
    expect(res?.status).toBe(401);
  });

  it('returns the user for a valid session', async () => {
    const store = new MemoryStore();
    const signupRes = await handleAuth(
      req('POST', '/api/auth/signup', { username: 'alice', password: 'password1' }),
      store,
      ctx(),
    );
    const token = sessionCookieOf(signupRes as Response) ?? '';
    const res = await handleAuth(
      req('GET', '/api/auth/me', undefined, `session=${token}`),
      store,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as { user: { id: number; username: string; role: Role } };
    expect(body.user).toEqual({ id: 1, username: 'alice', role: 'admin' });
  });

  it('401s when the session has expired', async () => {
    const store = new MemoryStore();
    const signupRes = await handleAuth(
      req('POST', '/api/auth/signup', { username: 'alice', password: 'password1' }),
      store,
      ctx(),
    );
    const token = sessionCookieOf(signupRes as Response) ?? '';
    const far = NOW + 100 * 24 * 60 * 60 * 1000;
    const res = await handleAuth(
      req('GET', '/api/auth/me', undefined, `session=${token}`),
      store,
      ctx({ now: far }),
    );
    expect(res?.status).toBe(401);
  });

  it('401s when the backing user was banned', async () => {
    const store = new MemoryStore();
    const signupRes = await handleAuth(
      req('POST', '/api/auth/signup', { username: 'alice', password: 'password1' }),
      store,
      ctx(),
    );
    const token = sessionCookieOf(signupRes as Response) ?? '';
    store.ban(1, NOW + 1000);
    const res = await handleAuth(
      req('GET', '/api/auth/me', undefined, `session=${token}`),
      store,
      ctx(),
    );
    expect(res?.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// authenticate() helper
// ---------------------------------------------------------------------------

describe('authenticate', () => {
  it('returns null without a cookie', async () => {
    const store = new MemoryStore();
    expect(await authenticate(req('GET', '/anything'), store, NOW)).toBeNull();
  });

  it('returns the user for a live session cookie', async () => {
    const store = new MemoryStore();
    const signupRes = await handleAuth(
      req('POST', '/api/auth/signup', { username: 'alice', password: 'password1' }),
      store,
      ctx(),
    );
    const token = sessionCookieOf(signupRes as Response) ?? '';
    const result = await authenticate(
      req('GET', '/anything', undefined, `session=${token}`),
      store,
      NOW,
    );
    expect(result?.user.username).toBe('alice');
    expect(result?.token).toBe(token);
  });
});

// ---------------------------------------------------------------------------
// Rate limiter in isolation
// ---------------------------------------------------------------------------

describe('rateLimit', () => {
  it('allows the first RATE_LIMIT_MAX attempts and blocks the next one', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(rateLimit('k', NOW)).toBe(true);
    }
    expect(rateLimit('k', NOW)).toBe(false);
  });

  it('resets after the window passes', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) rateLimit('k', NOW);
    expect(rateLimit('k', NOW + 11 * 60 * 1000)).toBe(true);
  });
});
