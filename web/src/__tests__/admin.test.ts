/**
 * Tests the client-side admin store.
 *
 * `fetch` is stubbed per case. The mutation helpers and list helpers go through
 * the same `getJson` / `postJson` plumbing, so these tests mostly check URL
 * shapes and error handling; the hook state machines are exercised in the
 * admin tab tests.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  banUser,
  closeAdminRoom,
  listAdminPackets,
  listAdminProtests,
  listAdminRooms,
  listAdminUsers,
  removeAdminPacket,
  resolveAdminProtest,
  setUserRole,
  unbanUser,
} from '../admin';

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listAdminUsers', () => {
  it('builds the URL with q, page and limit when given', async () => {
    const calls: string[] = [];
    stubFetch(async (path) => {
      calls.push(path);
      return jsonResponse({ users: [], page: 1, pageCount: 1, total: 0 });
    });
    await listAdminUsers({ q: 'ali', page: 2, limit: 10 });
    expect(calls[0]).toContain('/api/admin/users?');
    expect(calls[0]).toContain('q=ali');
    expect(calls[0]).toContain('page=2');
    expect(calls[0]).toContain('limit=10');
  });

  it('omits empty q', async () => {
    const calls: string[] = [];
    stubFetch(async (path) => {
      calls.push(path);
      return jsonResponse({ users: [], page: 1, pageCount: 1, total: 0 });
    });
    await listAdminUsers();
    expect(calls[0]).toBe('/api/admin/users');
  });

  it('raises the server error text', async () => {
    stubFetch(async () => jsonResponse({ error: 'admin only' }, 403));
    await expect(listAdminUsers()).rejects.toThrow('admin only');
  });

  it('returns the body shape', async () => {
    stubFetch(async () =>
      jsonResponse({
        users: [{ id: 1, username: 'alice', role: 'admin', created_at: 1, banned_at: null }],
        page: 1,
        pageCount: 1,
        total: 1,
      }),
    );
    const body = await listAdminUsers();
    expect(body.total).toBe(1);
    expect(body.users[0]?.username).toBe('alice');
  });
});

describe('user mutations', () => {
  it('setUserRole posts the role', async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    stubFetch(async (path, init) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
      return jsonResponse({
        user: { id: 2, username: 'bob', role: 'admin', created_at: 1, banned_at: null },
      });
    });
    const user = await setUserRole(2, 'admin');
    expect(calls[0]?.path).toBe('/api/admin/users/2/role');
    expect(calls[0]?.body).toEqual({ role: 'admin' });
    expect(user.role).toBe('admin');
  });

  it('banUser posts an empty body and returns the updated row', async () => {
    const calls: string[] = [];
    stubFetch(async (path) => {
      calls.push(path);
      return jsonResponse({
        user: { id: 2, username: 'bob', role: 'user', created_at: 1, banned_at: 999 },
      });
    });
    const user = await banUser(2);
    expect(calls[0]).toBe('/api/admin/users/2/ban');
    expect(user.banned_at).toBe(999);
  });

  it('unbanUser hits the unban path', async () => {
    const calls: string[] = [];
    stubFetch(async (path) => {
      calls.push(path);
      return jsonResponse({
        user: { id: 2, username: 'bob', role: 'user', created_at: 1, banned_at: null },
      });
    });
    const user = await unbanUser(2);
    expect(calls[0]).toBe('/api/admin/users/2/unban');
    expect(user.banned_at).toBeNull();
  });

  it('banUser surfaces a server error', async () => {
    stubFetch(async () => jsonResponse({ error: 'cannot ban yourself' }, 400));
    await expect(banUser(1)).rejects.toThrow('cannot ban yourself');
  });
});

describe('rooms and packets', () => {
  it('listAdminRooms returns the server list and its note', async () => {
    stubFetch(async () =>
      jsonResponse({ rooms: [], note: 'live listing not implemented' }),
    );
    const body = await listAdminRooms();
    expect(body.rooms).toEqual([]);
    expect(body.note).toMatch(/live listing/);
  });

  it('closeAdminRoom URL-encodes the code', async () => {
    const calls: string[] = [];
    stubFetch(async (path) => {
      calls.push(path);
      return jsonResponse({ ok: true });
    });
    await closeAdminRoom('AB CD');
    expect(calls[0]).toBe('/api/admin/rooms/AB%20CD/close');
  });

  it('listAdminPackets returns the server note', async () => {
    stubFetch(async () =>
      jsonResponse({
        packets: [],
        note: 'packet import is client-side; nothing to manage server-side yet',
      }),
    );
    const body = await listAdminPackets();
    expect(body.packets).toEqual([]);
    expect(body.note).toMatch(/client-side/);
  });

  it('removeAdminPacket surfaces the 404 error', async () => {
    stubFetch(async () =>
      jsonResponse({ error: 'packets are not persisted server-side; nothing to remove' }, 404),
    );
    await expect(removeAdminPacket('abc')).rejects.toThrow(/not persisted/);
  });
});

describe('protests', () => {
  it('listAdminProtests defaults to pending and reads protests array', async () => {
    const calls: string[] = [];
    stubFetch(async (path) => {
      calls.push(path);
      return jsonResponse({ protests: [] });
    });
    const body = await listAdminProtests();
    expect(calls[0]).toBe('/api/admin/protests?state=pending');
    expect(body).toEqual([]);
  });

  it('listAdminProtests passes the requested state', async () => {
    const calls: string[] = [];
    stubFetch(async (path) => {
      calls.push(path);
      return jsonResponse({ protests: [] });
    });
    await listAdminProtests('all');
    expect(calls[0]).toBe('/api/admin/protests?state=all');
  });

  it('resolveAdminProtest sends decision and note', async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    stubFetch(async (path, init) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
      return jsonResponse({
        protest: {
          id: 1,
          tournament_id: 1,
          tournament_name: 'X',
          question_id: 'q0',
          raised_by: 2,
          raised_by_username: 'bob',
          reason: 'r',
          given_answer: 'g',
          state: 'accepted',
          created_at: 1,
          resolved_by: 1,
          resolved_at: 2,
          resolved_note: 'ok',
        },
      });
    });
    const body = await resolveAdminProtest(1, 'accepted', 'ok');
    expect(calls[0]?.path).toBe('/api/admin/protests/1/resolve');
    expect(calls[0]?.body).toEqual({ decision: 'accepted', note: 'ok' });
    expect(body.state).toBe('accepted');
  });
});
