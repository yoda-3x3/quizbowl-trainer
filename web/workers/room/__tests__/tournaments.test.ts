/**
 * Endpoint tests for the tournaments module.
 *
 * Mirrors the auth tests: an in-memory AuthStore shim and a matching in-memory
 * TournamentStore shim run the endpoints without a D1 harness, since both
 * adapters are thin SQL wrappers that only run against the real binding.
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
  PROTEST_RATE_LIMIT_MAX,
  handleTournaments,
  type ProtestRow,
  type TournamentPlayerRow,
  type TournamentQuestionRow,
  type TournamentRow,
  type TournamentState,
  type TournamentStore,
} from '../tournaments';

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

class MemoryTournamentStore implements TournamentStore {
  private nextId = 1;
  private nextProtestId = 1;
  public tournaments = new Map<number, TournamentRow>();
  public players: TournamentPlayerRow[] = [];
  public questions: TournamentQuestionRow[] = [];
  public protests: ProtestRow[] = [];

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
    for (const q of qs) {
      this.questions.push({ tournamentId, ...q });
    }
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
}

// ---------------------------------------------------------------------------
// Harness helpers
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
  tStore: MemoryTournamentStore;
  aliceCookie: string;
  bobCookie: string;
}

async function seed(now: number = NOW): Promise<Seeded> {
  const authStore = new MemoryAuthStore();
  const tStore = new MemoryTournamentStore();

  // First signup is seeded as admin.
  const aRes = await handleAuth(
    req('POST', '/api/auth/signup', { username: 'alice', password: 'password1' }),
    authStore,
    ctx({ now }),
  );
  const aliceCookie = `session=${sessionCookieOf(aRes as Response) ?? ''}`;

  const bRes = await handleAuth(
    req('POST', '/api/auth/signup', { username: 'bob', password: 'password1' }),
    authStore,
    ctx({ now }),
  );
  const bobCookie = `session=${sessionCookieOf(bRes as Response) ?? ''}`;

  return { authStore, tStore, aliceCookie, bobCookie };
}

afterEach(() => {
  __resetRateLimit();
});

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

describe('route dispatch', () => {
  it('returns null for an unrelated path', async () => {
    const { authStore, tStore } = await seed();
    const res = await handleTournaments(req('GET', '/api/room'), authStore, tStore, ctx());
    expect(res).toBeNull();
  });

  it('405s a DELETE to /api/tournaments', async () => {
    const { authStore, tStore } = await seed();
    const res = await handleTournaments(
      req('DELETE', '/api/tournaments'),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(405);
  });

  it('404s on an unknown sub-action', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    const create = await handleTournaments(
      req(
        'POST',
        '/api/tournaments',
        { name: 'Test', format: 'tossups', n_tossups: 3 },
        aliceCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(create?.status).toBe(200);
    const res = await handleTournaments(
      req('POST', '/api/tournaments/1/explode', {}, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });

  it('404s on a non-numeric id', async () => {
    const { authStore, tStore } = await seed();
    const res = await handleTournaments(
      req('GET', '/api/tournaments/abc'),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

describe('POST /api/tournaments (create)', () => {
  it('401s an anonymous caller', async () => {
    const { authStore, tStore } = await seed();
    const res = await handleTournaments(
      req('POST', '/api/tournaments', { name: 'Test', format: 'tossups', n_tossups: 3 }),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(401);
  });

  it('400s on an empty name', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    const res = await handleTournaments(
      req('POST', '/api/tournaments', { name: '   ', format: 'tossups', n_tossups: 3 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('400s on a 61-char name', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    const name = 'x'.repeat(61);
    const res = await handleTournaments(
      req('POST', '/api/tournaments', { name, format: 'tossups', n_tossups: 3 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('400s on an unknown format', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    const res = await handleTournaments(
      req('POST', '/api/tournaments', { name: 'Test', format: 'poetry', n_tossups: 3 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('400s on n_tossups=0', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    const res = await handleTournaments(
      req('POST', '/api/tournaments', { name: 'Test', format: 'tossups', n_tossups: 0 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('400s on n_tossups=51', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    const res = await handleTournaments(
      req('POST', '/api/tournaments', { name: 'Test', format: 'tossups', n_tossups: 51 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('creates a tournament with the caller auto-joined', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments',
        { name: 'Friday Quiz', format: 'tossups', n_tossups: 3, team: 'Red' },
        aliceCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      tournament: {
        id: number;
        name: string;
        state: TournamentState;
        player_count: number;
        creator_username: string;
        players: Array<{ user_id: number; username: string; team: string }>;
      };
    };
    expect(body.tournament.id).toBe(1);
    expect(body.tournament.name).toBe('Friday Quiz');
    expect(body.tournament.state).toBe('open');
    expect(body.tournament.player_count).toBe(1);
    expect(body.tournament.creator_username).toBe('alice');
    expect(body.tournament.players[0]).toMatchObject({
      username: 'alice',
      team: 'Red',
    });
  });

  it('defaults n_bonuses to 0 and team to empty', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    const res = await handleTournaments(
      req('POST', '/api/tournaments', { name: 'T', format: 'tossups', n_tossups: 1 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      tournament: { n_bonuses: number; players: Array<{ team: string }> };
    };
    expect(body.tournament.n_bonuses).toBe(0);
    expect(body.tournament.players[0]?.team).toBe('');
  });
});

// ---------------------------------------------------------------------------
// List + get
// ---------------------------------------------------------------------------

describe('GET /api/tournaments (list)', () => {
  it('lists non-finished tournaments', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    await handleTournaments(
      req('POST', '/api/tournaments', { name: 'A', format: 'tossups', n_tossups: 1 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    const finished = await tStore.createTournament({
      name: 'Old',
      format: 'tossups',
      nTossups: 1,
      nBonuses: 0,
      createdBy: 1,
      createdAt: NOW - 1000,
      startedAt: NOW - 500,
      finishedAt: NOW - 100,
      state: 'finished',
    });
    expect(finished).toBeGreaterThan(0);
    const res = await handleTournaments(
      req('GET', '/api/tournaments'),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      tournaments: Array<{ name: string; player_count: number }>;
    };
    expect(body.tournaments.map((t) => t.name)).toEqual(['A']);
  });
});

describe('GET /api/tournaments/:id', () => {
  it('404s for an unknown id', async () => {
    const { authStore, tStore } = await seed();
    const res = await handleTournaments(
      req('GET', '/api/tournaments/999'),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });

  it('returns detail including players and questions', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    await handleTournaments(
      req('POST', '/api/tournaments', { name: 'X', format: 'tossups', n_tossups: 2 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    const res = await handleTournaments(
      req('GET', '/api/tournaments/1'),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      tournament: { id: number; players: unknown[]; questions: unknown[] };
    };
    expect(body.tournament.id).toBe(1);
    expect(body.tournament.players).toHaveLength(1);
    expect(body.tournament.questions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------

describe('POST /api/tournaments/:id/join', () => {
  it('401s an anonymous caller', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    await handleTournaments(
      req('POST', '/api/tournaments', { name: 'X', format: 'tossups', n_tossups: 2 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    const res = await handleTournaments(
      req('POST', '/api/tournaments/1/join', {}),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(401);
  });

  it('404s an unknown tournament', async () => {
    const { authStore, tStore, bobCookie } = await seed();
    const res = await handleTournaments(
      req('POST', '/api/tournaments/42/join', {}, bobCookie),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });

  it('409s when the caller has already joined', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    await handleTournaments(
      req('POST', '/api/tournaments', { name: 'X', format: 'tossups', n_tossups: 2 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    const res = await handleTournaments(
      req('POST', '/api/tournaments/1/join', {}, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(409);
  });

  it('adds a new player with their team', async () => {
    const { authStore, tStore, aliceCookie, bobCookie } = await seed();
    await handleTournaments(
      req('POST', '/api/tournaments', { name: 'X', format: 'tossups', n_tossups: 2 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    const res = await handleTournaments(
      req('POST', '/api/tournaments/1/join', { team: 'Blue' }, bobCookie),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      tournament: { players: Array<{ username: string; team: string }> };
    };
    expect(body.tournament.players.map((p) => p.username).sort()).toEqual(['alice', 'bob']);
    expect(body.tournament.players.find((p) => p.username === 'bob')?.team).toBe('Blue');
  });

  it('400s joining a tournament that is already running', async () => {
    const { authStore, tStore, aliceCookie, bobCookie } = await seed();
    await handleTournaments(
      req('POST', '/api/tournaments', { name: 'X', format: 'tossups', n_tossups: 1 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/start',
        { questions: [{ seq: 0, question_id: 'q0', question_kind: 'tossup' }] },
        aliceCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    const res = await handleTournaments(
      req('POST', '/api/tournaments/1/join', {}, bobCookie),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

describe('POST /api/tournaments/:id/start', () => {
  it('403s a non-creator', async () => {
    const { authStore, tStore, aliceCookie, bobCookie } = await seed();
    await handleTournaments(
      req('POST', '/api/tournaments', { name: 'X', format: 'tossups', n_tossups: 1 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/start',
        { questions: [{ seq: 0, question_id: 'q0', question_kind: 'tossup' }] },
        bobCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(403);
  });

  it('400s on the wrong number of questions', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    await handleTournaments(
      req('POST', '/api/tournaments', { name: 'X', format: 'tossups', n_tossups: 3 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/start',
        { questions: [{ seq: 0, question_id: 'q0', question_kind: 'tossup' }] },
        aliceCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('400s on a malformed question entry', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    await handleTournaments(
      req('POST', '/api/tournaments', { name: 'X', format: 'tossups', n_tossups: 1 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/start',
        { questions: [{ seq: 0, question_id: '', question_kind: 'tossup' }] },
        aliceCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('sets state to running and pins the question sequence', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    await handleTournaments(
      req('POST', '/api/tournaments', { name: 'X', format: 'tossups', n_tossups: 2 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/start',
        {
          questions: [
            { seq: 0, question_id: 'q0', question_kind: 'tossup' },
            { seq: 1, question_id: 'q1', question_kind: 'tossup' },
          ],
        },
        aliceCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      tournament: { state: TournamentState; started_at: number | null; questions: Array<{ seq: number }> };
    };
    expect(body.tournament.state).toBe('running');
    expect(body.tournament.started_at).toBe(NOW);
    expect(body.tournament.questions.map((q) => q.seq)).toEqual([0, 1]);
  });

  it('400s when already running', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    await handleTournaments(
      req('POST', '/api/tournaments', { name: 'X', format: 'tossups', n_tossups: 1 }, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    const start = {
      questions: [{ seq: 0, question_id: 'q0', question_kind: 'tossup' }],
    };
    await handleTournaments(
      req('POST', '/api/tournaments/1/start', start, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    const res = await handleTournaments(
      req('POST', '/api/tournaments/1/start', start, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Protest
// ---------------------------------------------------------------------------

async function startedTournament(): Promise<Seeded> {
  const seeded = await seed();
  await handleTournaments(
    req('POST', '/api/tournaments', { name: 'X', format: 'tossups', n_tossups: 2 }, seeded.aliceCookie),
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
          { seq: 0, question_id: 'q0', question_kind: 'tossup' },
          { seq: 1, question_id: 'q1', question_kind: 'tossup' },
        ],
      },
      seeded.aliceCookie,
    ),
    seeded.authStore,
    seeded.tStore,
    ctx(),
  );
  return seeded;
}

describe('POST /api/tournaments/:id/protest', () => {
  it('401s an anonymous caller', async () => {
    const { authStore, tStore } = await startedTournament();
    const res = await handleTournaments(
      req('POST', '/api/tournaments/1/protest', {
        question_id: 'q0',
        reason: 'the judge misheard my answer',
      }),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(401);
  });

  it('403s a signed-in user who is not in the tournament', async () => {
    const seeded = await seed();
    await handleTournaments(
      req('POST', '/api/tournaments', { name: 'X', format: 'tossups', n_tossups: 1 }, seeded.aliceCookie),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/protest',
        { question_id: 'q0', reason: 'a long enough reason here' },
        seeded.bobCookie,
      ),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    expect(res?.status).toBe(403);
  });

  it('400s a reason under 10 chars', async () => {
    const { authStore, tStore, bobCookie } = await startedTournament();
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/protest',
        { question_id: 'q0', reason: 'short' },
        bobCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('400s a missing question_id', async () => {
    const { authStore, tStore, bobCookie } = await startedTournament();
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/protest',
        { reason: 'this is a long enough protest reason' },
        bobCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('files a pending protest for a tournament player', async () => {
    const { authStore, tStore, bobCookie } = await startedTournament();
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/protest',
        {
          question_id: 'q0',
          reason: 'the answer I gave was equivalent to the expected one',
          given_answer: 'dickens',
        },
        bobCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as { id: number; state: string };
    expect(body).toEqual({ id: 1, state: 'pending' });
    expect(tStore.protests[0]).toMatchObject({
      tournamentId: 1,
      raisedBy: 2,
      questionId: 'q0',
      givenAnswer: 'dickens',
      state: 'pending',
    });
  });

  it('rate-limits after PROTEST_RATE_LIMIT_MAX in a row', async () => {
    const { authStore, tStore, bobCookie } = await startedTournament();
    for (let i = 0; i < PROTEST_RATE_LIMIT_MAX; i++) {
      const res = await handleTournaments(
        req(
          'POST',
          '/api/tournaments/1/protest',
          {
            question_id: 'q0',
            reason: `reason number ${i} is long enough`,
          },
          bobCookie,
        ),
        authStore,
        tStore,
        ctx(),
      );
      expect(res?.status).toBe(200);
    }
    const blocked = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/protest',
        { question_id: 'q0', reason: 'another valid protest reason' },
        bobCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(blocked?.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// List protests
// ---------------------------------------------------------------------------

describe('GET /api/tournaments/:id/protests', () => {
  it('401s an anonymous caller', async () => {
    const { authStore, tStore } = await startedTournament();
    const res = await handleTournaments(
      req('GET', '/api/tournaments/1/protests'),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(401);
  });

  it("returns only the caller's own protests for a non-admin", async () => {
    const { authStore, tStore, aliceCookie, bobCookie } = await startedTournament();
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/protest',
        { question_id: 'q0', reason: 'alice protests something here' },
        aliceCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/protest',
        { question_id: 'q1', reason: 'bob also files a protest here' },
        bobCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    const res = await handleTournaments(
      req('GET', '/api/tournaments/1/protests', undefined, bobCookie),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      protests: Array<{ raised_by: number; question_id: string }>;
    };
    expect(body.protests).toHaveLength(1);
    expect(body.protests[0]).toMatchObject({ raised_by: 2, question_id: 'q1' });
  });

  it('admin (alice) sees every protest for the tournament', async () => {
    const { authStore, tStore, aliceCookie, bobCookie } = await startedTournament();
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/protest',
        { question_id: 'q0', reason: 'alice protests something here' },
        aliceCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/protest',
        { question_id: 'q1', reason: 'bob also files a protest here' },
        bobCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    const res = await handleTournaments(
      req('GET', '/api/tournaments/1/protests', undefined, aliceCookie),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      protests: Array<{ raised_by: number }>;
    };
    expect(body.protests.map((p) => p.raised_by).sort()).toEqual([1, 2]);
  });
});
