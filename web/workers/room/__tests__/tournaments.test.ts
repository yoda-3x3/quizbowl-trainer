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
  __resetQuestionCache,
  handleTournaments,
  type AttemptRow,
  type ProtestRow,
  type PublicBonus,
  type PublicTossup,
  type QuestionFetcher,
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

class FakeQuestionFetcher implements QuestionFetcher {
  public tossups = new Map<string, PublicTossup>();
  public bonuses = new Map<string, PublicBonus>();
  public tossupHits = 0;
  public bonusHits = 0;

  async fetchTossup(id: string): Promise<PublicTossup | null> {
    this.tossupHits += 1;
    return this.tossups.get(id) ?? null;
  }

  async fetchBonus(id: string): Promise<PublicBonus | null> {
    this.bonusHits += 1;
    return this.bonuses.get(id) ?? null;
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

// ---------------------------------------------------------------------------
// GET /api/tournaments/:id/questions/:seq
// ---------------------------------------------------------------------------

function makeTossup(id: string, overrides: Partial<PublicTossup> = {}): PublicTossup {
  return {
    id,
    question: 'Who wrote?',
    question_sanitized: 'Who wrote?',
    answer: '<b><u>Dickens</u></b>',
    answer_sanitized: 'Dickens',
    category: 'Literature',
    subcategory: 'British Literature',
    difficulty: 4,
    set_name: 'Test Set',
    set_year: 2024,
    packet_number: 1,
    question_number: 1,
    ...overrides,
  };
}

function makeBonus(id: string, overrides: Partial<PublicBonus> = {}): PublicBonus {
  return {
    id,
    leadin: 'For 10 points each:',
    leadin_sanitized: 'For 10 points each:',
    parts: ['Who wrote Hard Times?', 'Who wrote Bleak House?'],
    parts_sanitized: ['Who wrote Hard Times?', 'Who wrote Bleak House?'],
    answers: ['Dickens', 'Dickens'],
    answers_sanitized: ['Dickens', 'Dickens'],
    values: [10, 10],
    category: 'Literature',
    subcategory: 'British Literature',
    difficulty: 4,
    set_name: 'Test Set',
    ...overrides,
  };
}

async function startedTournamentWith(
  format: 'tossups' | 'tossups_bonuses' = 'tossups',
  questions: Array<{ question_id: string; question_kind: 'tossup' | 'bonus' }> = [
    { question_id: 'q0', question_kind: 'tossup' },
    { question_id: 'q1', question_kind: 'tossup' },
  ],
): Promise<Seeded & { tournamentId: number }> {
  const seeded = await seed();
  const nTossups = questions.filter((q) => q.question_kind === 'tossup').length;
  const nBonuses = questions.filter((q) => q.question_kind === 'bonus').length;
  await handleTournaments(
    req(
      'POST',
      '/api/tournaments',
      { name: 'Scoreboard Match', format, n_tossups: nTossups, n_bonuses: nBonuses },
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
      { questions: questions.map((q, i) => ({ seq: i, ...q })) },
      seeded.aliceCookie,
    ),
    seeded.authStore,
    seeded.tStore,
    ctx(),
  );
  return { ...seeded, tournamentId: 1 };
}

describe('GET /api/tournaments/:id/questions/:seq', () => {
  afterEach(() => {
    __resetQuestionCache();
  });

  it('401s an anonymous caller', async () => {
    const { authStore, tStore } = await startedTournamentWith();
    const fetcher = new FakeQuestionFetcher();
    fetcher.tossups.set('q0', makeTossup('q0'));
    const res = await handleTournaments(
      req('GET', '/api/tournaments/1/questions/0'),
      authStore,
      tStore,
      ctx(),
      fetcher,
    );
    expect(res?.status).toBe(401);
  });

  it('403s a signed-in non-player', async () => {
    const seeded = await startedTournamentWith();
    // carol is signed in (first seeded user after alice/bob/<admin flag>)
    const authRes = await handleAuth(
      req('POST', '/api/auth/signup', { username: 'carol', password: 'password1' }),
      seeded.authStore,
      ctx(),
    );
    const carolCookie = `session=${sessionCookieOf(authRes as Response) ?? ''}`;
    const fetcher = new FakeQuestionFetcher();
    fetcher.tossups.set('q0', makeTossup('q0'));
    const res = await handleTournaments(
      req('GET', '/api/tournaments/1/questions/0', undefined, carolCookie),
      seeded.authStore,
      seeded.tStore,
      ctx(),
      fetcher,
    );
    expect(res?.status).toBe(403);
  });

  it('404s a missing tournament', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    const fetcher = new FakeQuestionFetcher();
    const res = await handleTournaments(
      req('GET', '/api/tournaments/99/questions/0', undefined, aliceCookie),
      authStore,
      tStore,
      ctx(),
      fetcher,
    );
    expect(res?.status).toBe(404);
  });

  it('404s an out-of-range seq', async () => {
    const { authStore, tStore, aliceCookie } = await startedTournamentWith();
    const fetcher = new FakeQuestionFetcher();
    fetcher.tossups.set('q0', makeTossup('q0'));
    const res = await handleTournaments(
      req('GET', '/api/tournaments/1/questions/99', undefined, aliceCookie),
      authStore,
      tStore,
      ctx(),
      fetcher,
    );
    expect(res?.status).toBe(404);
  });

  it('returns the pinned tossup for a player', async () => {
    const { authStore, tStore, bobCookie } = await startedTournamentWith();
    const fetcher = new FakeQuestionFetcher();
    fetcher.tossups.set('q0', makeTossup('q0'));
    const res = await handleTournaments(
      req('GET', '/api/tournaments/1/questions/0', undefined, bobCookie),
      authStore,
      tStore,
      ctx(),
      fetcher,
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      seq: number;
      question_id: string;
      question_kind: string;
      total: number;
      tossup: PublicTossup;
    };
    expect(body.seq).toBe(0);
    expect(body.question_id).toBe('q0');
    expect(body.question_kind).toBe('tossup');
    expect(body.total).toBe(2);
    expect(body.tossup.id).toBe('q0');
  });

  it('returns the pinned bonus when the kind is bonus', async () => {
    const { authStore, tStore, aliceCookie } = await startedTournamentWith(
      'tossups_bonuses',
      [
        { question_id: 't0', question_kind: 'tossup' },
        { question_id: 'b0', question_kind: 'bonus' },
      ],
    );
    const fetcher = new FakeQuestionFetcher();
    fetcher.bonuses.set('b0', makeBonus('b0'));
    const res = await handleTournaments(
      req('GET', '/api/tournaments/1/questions/1', undefined, aliceCookie),
      authStore,
      tStore,
      ctx(),
      fetcher,
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      question_kind: string;
      bonus: PublicBonus;
    };
    expect(body.question_kind).toBe('bonus');
    expect(body.bonus.id).toBe('b0');
  });

  it('caches a resolved question across calls', async () => {
    const { authStore, tStore, bobCookie } = await startedTournamentWith();
    const fetcher = new FakeQuestionFetcher();
    fetcher.tossups.set('q0', makeTossup('q0'));

    await handleTournaments(
      req('GET', '/api/tournaments/1/questions/0', undefined, bobCookie),
      authStore,
      tStore,
      ctx(),
      fetcher,
    );
    await handleTournaments(
      req('GET', '/api/tournaments/1/questions/0', undefined, bobCookie),
      authStore,
      tStore,
      ctx(),
      fetcher,
    );
    expect(fetcher.tossupHits).toBe(1);
  });

  it('returns 502 when the upstream has nothing', async () => {
    const { authStore, tStore, bobCookie } = await startedTournamentWith();
    const fetcher = new FakeQuestionFetcher();
    // No entries added.
    const res = await handleTournaments(
      req('GET', '/api/tournaments/1/questions/0', undefined, bobCookie),
      authStore,
      tStore,
      ctx(),
      fetcher,
    );
    expect(res?.status).toBe(502);
  });

  it('400s a non-integer seq', async () => {
    const { authStore, tStore, aliceCookie } = await startedTournamentWith();
    const fetcher = new FakeQuestionFetcher();
    const res = await handleTournaments(
      req('GET', '/api/tournaments/1/questions/abc', undefined, aliceCookie),
      authStore,
      tStore,
      ctx(),
      fetcher,
    );
    expect(res?.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tournaments/:id/attempts
// ---------------------------------------------------------------------------

function sampleAttemptBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    seq: 0,
    question_id: 'q0',
    given_answer: 'dickens',
    directive: 'accept',
    points: 10,
    powered: false,
    buzz_word_index: 12,
    total_words: 40,
    power_word_index: 7,
    ms_to_answer: 1500,
    ...overrides,
  };
}

describe('POST /api/tournaments/:id/attempts', () => {
  it('401s an anonymous caller', async () => {
    const { authStore, tStore } = await startedTournamentWith();
    const res = await handleTournaments(
      req('POST', '/api/tournaments/1/attempts', sampleAttemptBody()),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(401);
  });

  it('403s a signed-in non-player', async () => {
    const seeded = await startedTournamentWith();
    const authRes = await handleAuth(
      req('POST', '/api/auth/signup', { username: 'carol', password: 'password1' }),
      seeded.authStore,
      ctx(),
    );
    const carolCookie = `session=${sessionCookieOf(authRes as Response) ?? ''}`;
    const res = await handleTournaments(
      req('POST', '/api/tournaments/1/attempts', sampleAttemptBody(), carolCookie),
      seeded.authStore,
      seeded.tStore,
      ctx(),
    );
    expect(res?.status).toBe(403);
  });

  it('404s a missing tournament', async () => {
    const { authStore, tStore, aliceCookie } = await seed();
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/99/attempts',
        sampleAttemptBody(),
        aliceCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });

  it('persists a valid attempt and returns its id', async () => {
    const { authStore, tStore, bobCookie } = await startedTournamentWith();
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/attempts',
        sampleAttemptBody(),
        bobCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as { id: number };
    expect(body.id).toBeGreaterThan(0);
    const rows = await tStore.listAttempts(1);
    expect(rows.length).toBe(1);
    expect(rows[0]?.questionId).toBe('q0');
    expect(rows[0]?.directive).toBe('accept');
    expect(rows[0]?.points).toBe(10);
  });

  it('400s when directive is invalid', async () => {
    const { authStore, tStore, bobCookie } = await startedTournamentWith();
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/attempts',
        sampleAttemptBody({ directive: 'unknown' }),
        bobCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('400s when question_id is missing', async () => {
    const { authStore, tStore, bobCookie } = await startedTournamentWith();
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/attempts',
        sampleAttemptBody({ question_id: '' }),
        bobCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('400s a negative seq', async () => {
    const { authStore, tStore, bobCookie } = await startedTournamentWith();
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/attempts',
        sampleAttemptBody({ seq: -1 }),
        bobCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('accepts a null buzz_word_index (no-buzz end-of-question)', async () => {
    const { authStore, tStore, bobCookie } = await startedTournamentWith();
    const res = await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/attempts',
        sampleAttemptBody({ buzz_word_index: null, powered: false, points: 10 }),
        bobCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const rows = await tStore.listAttempts(1);
    expect(rows[0]?.buzzWordIndex).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// GET /api/tournaments/:id/scoreboard
// ---------------------------------------------------------------------------

describe('GET /api/tournaments/:id/scoreboard', () => {
  it('shows every player with zero points when no attempts have landed', async () => {
    const { authStore, tStore } = await startedTournamentWith();
    const res = await handleTournaments(
      req('GET', '/api/tournaments/1/scoreboard'),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await (res as Response).json()) as {
      scoreboard: Array<{
        user_id: number;
        username: string;
        points: number;
        base_points: number;
        restitution_delta: number;
      }>;
    };
    expect(body.scoreboard.length).toBe(2);
    expect(body.scoreboard.every((e) => e.points === 0)).toBe(true);
    expect(body.scoreboard.map((e) => e.username).sort()).toEqual(['alice', 'bob']);
  });

  it('sums an attempt into the player total', async () => {
    const { authStore, tStore, bobCookie } = await startedTournamentWith();
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/attempts',
        sampleAttemptBody({ points: 15, powered: true }),
        bobCookie,
      ),
      authStore,
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
      scoreboard: Array<{ username: string; points: number; base_points: number }>;
    };
    const bob = body.scoreboard.find((e) => e.username === 'bob');
    expect(bob?.points).toBe(15);
    expect(bob?.base_points).toBe(15);
  });

  it('sorts entries from highest points to lowest', async () => {
    const { authStore, tStore, aliceCookie, bobCookie } = await startedTournamentWith();
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/attempts',
        sampleAttemptBody({ points: 10 }),
        aliceCookie,
      ),
      authStore,
      tStore,
      ctx(),
    );
    await handleTournaments(
      req(
        'POST',
        '/api/tournaments/1/attempts',
        sampleAttemptBody({ points: 15, powered: true, seq: 1, question_id: 'q1' }),
        bobCookie,
      ),
      authStore,
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
      scoreboard: Array<{ username: string; points: number }>;
    };
    expect(body.scoreboard.map((e) => e.username)).toEqual(['bob', 'alice']);
  });

  it('404s a missing tournament', async () => {
    const { authStore, tStore } = await seed();
    const res = await handleTournaments(
      req('GET', '/api/tournaments/99/scoreboard'),
      authStore,
      tStore,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });
});
