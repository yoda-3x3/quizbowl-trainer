/**
 * Endpoint tests for the packets module. Mirrors the style of
 * admin.test.ts: in-memory AuthStore + PacketStore, no Workers harness.
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
  MAX_PACKET_BYTES,
  handlePackets,
  type PacketRow,
  type PacketStore,
} from '../packets';
import { handleAdmin } from '../admin';

class MemoryAuthStore implements AuthStore {
  private nextId = 1;
  public users = new Map<number, StoredUser>();
  public sessionsByToken = new Map<
    string,
    { userId: number; createdAt: number; expiresAt: number }
  >();

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

class MemoryPacketStore implements PacketStore {
  public rows: PacketRow[] = [];

  async insert(row: PacketRow): Promise<void> {
    this.rows.push({ ...row });
  }
  async list() {
    return [...this.rows]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ data: _data, ...rest }) => ({ ...rest }));
  }
  async find(id: string): Promise<PacketRow | null> {
    const r = this.rows.find((x) => x.id === id);
    return r ? { ...r } : null;
  }
  async delete(id: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((x) => x.id !== id);
    return this.rows.length < before;
  }
}

const NOW = 1_700_000_000_000;

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return { ip: '203.0.113.9', colo: 'ORD', now: NOW, ...overrides };
}

function req(
  method: string,
  path: string,
  body?: unknown,
  cookies?: string,
): Request {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookies) headers['cookie'] = cookies;
  return new Request(`https://x.example${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function rawReq(
  method: string,
  path: string,
  body: string,
  cookies?: string,
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (cookies) headers['cookie'] = cookies;
  return new Request(`https://x.example${path}`, { method, headers, body });
}

function cookieOf(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  const token = setCookie ? parseSessionCookie(setCookie) : null;
  return token ? `session=${token}` : '';
}

async function seed(): Promise<{
  authStore: MemoryAuthStore;
  packets: MemoryPacketStore;
  aliceCookie: string; // admin (first signup)
  bobCookie: string; // user
  carolCookie: string; // user
}> {
  const authStore = new MemoryAuthStore();
  const packets = new MemoryPacketStore();
  const a = await handleAuth(
    req('POST', '/api/auth/signup', { username: 'alice', password: 'password1' }),
    authStore,
    ctx(),
  );
  const b = await handleAuth(
    req('POST', '/api/auth/signup', { username: 'bob', password: 'password1' }),
    authStore,
    ctx(),
  );
  const c = await handleAuth(
    req('POST', '/api/auth/signup', { username: 'carol', password: 'password1' }),
    authStore,
    ctx(),
  );
  return {
    authStore,
    packets,
    aliceCookie: cookieOf(a as Response),
    bobCookie: cookieOf(b as Response),
    carolCookie: cookieOf(c as Response),
  };
}

beforeEach(() => __resetRateLimit());
afterEach(() => __resetRateLimit());

const SAMPLE = {
  tossups: [{ id: 't1', questionSanitized: 'Who wrote Hamlet? (*)' }],
  bonuses: [{ id: 'b1', leadin: 'Name this...', parts: [{}, {}, {}] }],
};

describe('POST /api/packets', () => {
  it('401s an anonymous caller', async () => {
    const { authStore, packets } = await seed();
    const res = await handlePackets(
      req('POST', '/api/packets', { name: 'x', data: SAMPLE }),
      authStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(401);
  });

  it('inserts a row for a signed-in user and returns its id', async () => {
    const { authStore, packets, bobCookie } = await seed();
    const res = await handlePackets(
      req(
        'POST',
        '/api/packets',
        { name: '2019 PACE NSC r12', data: SAMPLE },
        bobCookie,
      ),
      authStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as { id: string };
    expect(body.id).toBeTruthy();
    expect(packets.rows).toHaveLength(1);
    expect(packets.rows[0]?.uploaderId).toBe(2); // bob
    expect(packets.rows[0]?.name).toBe('2019 PACE NSC r12');
    expect(packets.rows[0]?.tossupCount).toBe(1);
    expect(packets.rows[0]?.bonusCount).toBe(1);
  });

  it('400s a missing name', async () => {
    const { authStore, packets, bobCookie } = await seed();
    const res = await handlePackets(
      req('POST', '/api/packets', { data: SAMPLE }, bobCookie),
      authStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('413s a body over 1 MiB', async () => {
    const { authStore, packets, bobCookie } = await seed();
    const huge = JSON.stringify({
      name: 'huge',
      data: { tossups: [], bonuses: [], big: 'x'.repeat(MAX_PACKET_BYTES) },
    });
    const res = await handlePackets(
      rawReq('POST', '/api/packets', huge, bobCookie),
      authStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(413);
    expect(packets.rows).toHaveLength(0);
  });
});

describe('GET /api/packets', () => {
  it('401s an anonymous caller', async () => {
    const { authStore, packets } = await seed();
    const res = await handlePackets(
      req('GET', '/api/packets'),
      authStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(401);
  });

  it('lists every packet across users with uploader_name resolved', async () => {
    const { authStore, packets, bobCookie, carolCookie } = await seed();
    await handlePackets(
      req('POST', '/api/packets', { name: 'bobs', data: SAMPLE }, bobCookie),
      authStore,
      packets,
      ctx({ now: NOW }),
    );
    await handlePackets(
      req('POST', '/api/packets', { name: 'carols', data: SAMPLE }, carolCookie),
      authStore,
      packets,
      ctx({ now: NOW + 100 }),
    );

    const res = await handlePackets(
      req('GET', '/api/packets', undefined, bobCookie),
      authStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      packets: Array<{ name: string; uploader_name: string }>;
    };
    expect(body.packets.map((p) => p.name).sort()).toEqual(['bobs', 'carols']);
    const byName = new Map(body.packets.map((p) => [p.name, p.uploader_name]));
    expect(byName.get('bobs')).toBe('bob');
    expect(byName.get('carols')).toBe('carol');
  });
});

describe('GET /api/packets/:id', () => {
  it('401s an anonymous caller', async () => {
    const { authStore, packets } = await seed();
    const res = await handlePackets(
      req('GET', '/api/packets/anything'),
      authStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(401);
  });

  it('404s a missing id', async () => {
    const { authStore, packets, bobCookie } = await seed();
    const res = await handlePackets(
      req('GET', '/api/packets/does-not-exist', undefined, bobCookie),
      authStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });

  it('returns the full packet data to any signed-in user', async () => {
    const { authStore, packets, bobCookie, carolCookie } = await seed();
    const up = await handlePackets(
      req('POST', '/api/packets', { name: 'bobs', data: SAMPLE }, bobCookie),
      authStore,
      packets,
      ctx(),
    );
    const { id } = (await (up as Response).json()) as { id: string };

    const res = await handlePackets(
      req('GET', `/api/packets/${id}`, undefined, carolCookie),
      authStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      packet: { name: string; data: unknown; uploader_name: string };
    };
    expect(body.packet.name).toBe('bobs');
    expect(body.packet.uploader_name).toBe('bob');
    expect(body.packet.data).toEqual(SAMPLE);
  });
});

describe('DELETE /api/packets/:id', () => {
  it('401s an anonymous caller', async () => {
    const { authStore, packets } = await seed();
    const res = await handlePackets(
      req('DELETE', '/api/packets/anything'),
      authStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(401);
  });

  it('404s a missing id', async () => {
    const { authStore, packets, bobCookie } = await seed();
    const res = await handlePackets(
      req('DELETE', '/api/packets/nope', undefined, bobCookie),
      authStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });

  it('403s a non-uploader non-admin', async () => {
    const { authStore, packets, bobCookie, carolCookie } = await seed();
    const up = await handlePackets(
      req('POST', '/api/packets', { name: 'bobs', data: SAMPLE }, bobCookie),
      authStore,
      packets,
      ctx(),
    );
    const { id } = (await (up as Response).json()) as { id: string };
    const res = await handlePackets(
      req('DELETE', `/api/packets/${id}`, undefined, carolCookie),
      authStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(403);
    expect(packets.rows).toHaveLength(1);
  });

  it('uploader can delete their own packet', async () => {
    const { authStore, packets, bobCookie } = await seed();
    const up = await handlePackets(
      req('POST', '/api/packets', { name: 'bobs', data: SAMPLE }, bobCookie),
      authStore,
      packets,
      ctx(),
    );
    const { id } = (await (up as Response).json()) as { id: string };
    const res = await handlePackets(
      req('DELETE', `/api/packets/${id}`, undefined, bobCookie),
      authStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(200);
    expect(packets.rows).toHaveLength(0);
  });

  it('admin can delete any packet', async () => {
    const { authStore, packets, aliceCookie, bobCookie } = await seed();
    const up = await handlePackets(
      req('POST', '/api/packets', { name: 'bobs', data: SAMPLE }, bobCookie),
      authStore,
      packets,
      ctx(),
    );
    const { id } = (await (up as Response).json()) as { id: string };
    const res = await handlePackets(
      req('DELETE', `/api/packets/${id}`, undefined, aliceCookie),
      authStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(200);
    expect(packets.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Admin surface — GET /api/admin/packets and POST /api/admin/packets/:id/remove
// ---------------------------------------------------------------------------

// These go through handleAdmin's new 6-arg form (packets store + ctx). The
// non-packet routes already have thorough coverage in admin.test.ts; here we
// just assert the admin router reads/removes through the shared store.

import type { AdminStore, LiveRoomRow } from '../admin';
import type {
  AttemptRow,
  ProtestRow,
  ProtestState,
  TournamentPlayerRow,
  TournamentQuestionRow,
  TournamentRow,
  TournamentState,
  TournamentStore,
} from '../tournaments';

class MemoryTournamentStore implements TournamentStore {
  public tournaments = new Map<number, TournamentRow>();
  public players: TournamentPlayerRow[] = [];
  public questions: TournamentQuestionRow[] = [];
  public protests: ProtestRow[] = [];
  public attempts: AttemptRow[] = [];
  async createTournament(t: Omit<TournamentRow, 'id'>) {
    const id = this.tournaments.size + 1;
    this.tournaments.set(id, { ...t, id });
    return id;
  }
  async findTournament(id: number) {
    return this.tournaments.get(id) ?? null;
  }
  async listUnfinished() {
    return [...this.tournaments.values()];
  }
  async setTournamentState(
    id: number,
    state: TournamentState,
    startedAt: number | null,
    finishedAt: number | null,
  ) {
    const t = this.tournaments.get(id);
    if (t) {
      t.state = state;
      t.startedAt = startedAt;
      t.finishedAt = finishedAt;
    }
  }
  async addPlayer(p: TournamentPlayerRow) {
    this.players.push(p);
  }
  async findPlayer() {
    return null;
  }
  async listPlayers() {
    return [];
  }
  async addQuestions() {
    /* noop */
  }
  async listQuestions() {
    return [];
  }
  async createProtest() {
    return 1;
  }
  async listProtestsForUser() {
    return [];
  }
  async listProtestsForTournament() {
    return [];
  }
  async createAttempt() {
    return 1;
  }
  async listAttempts() {
    return [];
  }
  async findAttemptForProtest() {
    return null;
  }
  async applyAttemptRestitution() {
    /* noop */
  }
}

class MemoryAdminStore implements AdminStore {
  public liveRooms = new Map<string, LiveRoomRow>();
  async listUsers() {
    return { rows: [], total: 0 };
  }
  async setUserRole() {
    /* noop */
  }
  async setUserBanned() {
    /* noop */
  }
  async deleteSessionsForUser() {
    /* noop */
  }
  async listLiveRooms() {
    return [];
  }
  async findLiveRoom() {
    return null;
  }
  async markRoomClosed() {
    return true;
  }
  async listProtests(_state: ProtestState | null) {
    return [];
  }
  async findProtest() {
    return null;
  }
  async resolveProtest() {
    /* noop */
  }
}

describe('GET /api/admin/packets (backed by store)', () => {
  it('admin sees persisted packets', async () => {
    const { authStore, packets, aliceCookie, bobCookie } = await seed();
    await handlePackets(
      req('POST', '/api/packets', { name: 'bobs', data: SAMPLE }, bobCookie),
      authStore,
      packets,
      ctx(),
    );

    const tStore = new MemoryTournamentStore();
    const admin = new MemoryAdminStore();
    const res = await handleAdmin(
      req('GET', '/api/admin/packets', undefined, aliceCookie),
      authStore,
      admin,
      tStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      packets: Array<{ name: string; uploader_name: string }>;
    };
    expect(body.packets).toHaveLength(1);
    expect(body.packets[0]?.name).toBe('bobs');
    expect(body.packets[0]?.uploader_name).toBe('bob');
  });

  it('non-admin gets 403', async () => {
    const { authStore, packets, bobCookie } = await seed();
    const tStore = new MemoryTournamentStore();
    const admin = new MemoryAdminStore();
    const res = await handleAdmin(
      req('GET', '/api/admin/packets', undefined, bobCookie),
      authStore,
      admin,
      tStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(403);
  });
});

describe('POST /api/admin/packets/:id/remove', () => {
  it('admin can delete a user’s packet through the admin route', async () => {
    const { authStore, packets, aliceCookie, bobCookie } = await seed();
    const up = await handlePackets(
      req('POST', '/api/packets', { name: 'bobs', data: SAMPLE }, bobCookie),
      authStore,
      packets,
      ctx(),
    );
    const { id } = (await (up as Response).json()) as { id: string };

    const tStore = new MemoryTournamentStore();
    const admin = new MemoryAdminStore();
    const res = await handleAdmin(
      req(
        'POST',
        `/api/admin/packets/${encodeURIComponent(id)}/remove`,
        {},
        aliceCookie,
      ),
      authStore,
      admin,
      tStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(200);
    expect(packets.rows).toHaveLength(0);
  });

  it('404s on an unknown id', async () => {
    const { authStore, packets, aliceCookie } = await seed();
    const tStore = new MemoryTournamentStore();
    const admin = new MemoryAdminStore();
    const res = await handleAdmin(
      req('POST', '/api/admin/packets/nope/remove', {}, aliceCookie),
      authStore,
      admin,
      tStore,
      packets,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });
});
