/**
 * Tests the client-side auth store.
 *
 * `fetch` is stubbed per case. The store is module-level, so every test resets
 * it through the __resetAuth seam before running.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetAuth,
  getAuthState,
  refreshAuth,
  signIn,
  signOut,
  signUp,
} from '../auth';

type FetchStub = (path: string, init?: RequestInit) => Promise<Response>;

function stubFetch(handler: FetchStub) {
  const g = globalThis as unknown as { fetch: typeof fetch };
  g.fetch = handler as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  __resetAuth();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('refreshAuth', () => {
  it('reads the user on 200', async () => {
    const calls: string[] = [];
    stubFetch(async (path) => {
      calls.push(path);
      return jsonResponse({ user: { id: 1, username: 'alice', role: 'admin' } });
    });
    await refreshAuth();
    expect(calls).toEqual(['/api/auth/me']);
    const s = getAuthState();
    expect(s.user).toEqual({ id: 1, username: 'alice', role: 'admin' });
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it('clears the user on 401, without recording an error', async () => {
    stubFetch(async () => jsonResponse({ error: 'not signed in' }, 401));
    await refreshAuth();
    const s = getAuthState();
    expect(s.user).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it('records an error on a non-401 non-200 response', async () => {
    stubFetch(async () => jsonResponse({ error: 'boom' }, 500));
    await refreshAuth();
    const s = getAuthState();
    expect(s.user).toBeNull();
    expect(s.error).toBe('boom');
  });

  it('records an error on a network throw', async () => {
    stubFetch(async () => {
      throw new Error('offline');
    });
    await refreshAuth();
    expect(getAuthState().error).toBe('offline');
  });
});

describe('signIn', () => {
  it('posts to /api/auth/signin and stores the user on success', async () => {
    const seen: { path: string; body: string | null }[] = [];
    stubFetch(async (path, init) => {
      seen.push({ path, body: typeof init?.body === 'string' ? init.body : null });
      return jsonResponse({ user: { id: 2, username: 'bob', role: 'user' } });
    });
    const user = await signIn('bob', 'password1');
    expect(user).toEqual({ id: 2, username: 'bob', role: 'user' });
    expect(getAuthState().user?.username).toBe('bob');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.path).toBe('/api/auth/signin');
    expect(seen[0]?.body).toContain('"username":"bob"');
  });

  it('records the server error on 401 and throws', async () => {
    stubFetch(async () => jsonResponse({ error: 'invalid credentials' }, 401));
    await expect(signIn('bob', 'wrong')).rejects.toThrow('invalid credentials');
    expect(getAuthState().error).toBe('invalid credentials');
    expect(getAuthState().user).toBeNull();
  });

  it('falls back to a status-code message when the server omits one', async () => {
    stubFetch(async () => new Response('plain', { status: 500 }));
    await expect(signIn('bob', 'password1')).rejects.toThrow();
    expect(getAuthState().error).toMatch(/500/);
  });
});

describe('signUp', () => {
  it('posts to /api/auth/signup and stores the user', async () => {
    stubFetch(async () =>
      jsonResponse({ user: { id: 1, username: 'alice', role: 'admin' } }),
    );
    const user = await signUp('alice', 'password1');
    expect(user.username).toBe('alice');
    expect(getAuthState().user?.role).toBe('admin');
  });

  it('surfaces 409 as an error, throws, and leaves the user null', async () => {
    stubFetch(async () => jsonResponse({ error: 'username taken' }, 409));
    await expect(signUp('alice', 'password1')).rejects.toThrow('username taken');
    expect(getAuthState().error).toBe('username taken');
    expect(getAuthState().user).toBeNull();
  });
});

describe('signOut', () => {
  it('clears the user, even if the server call fails', async () => {
    // First a successful signin to seed state.
    stubFetch(async () =>
      jsonResponse({ user: { id: 1, username: 'alice', role: 'user' } }),
    );
    await signIn('alice', 'password1');
    expect(getAuthState().user).not.toBeNull();

    // Now simulate an offline signout.
    stubFetch(async () => {
      throw new Error('offline');
    });
    await signOut();
    expect(getAuthState().user).toBeNull();
    expect(getAuthState().error).toBeNull();
  });
});
