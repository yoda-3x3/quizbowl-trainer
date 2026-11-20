/**
 * Tests for bracket seeding math, generation, and the bracket endpoints.
 *
 * Mirrors tournaments.test.ts / ratings.test.ts: in-memory store shims run
 * the endpoints without a D1 harness.
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
  handleTournaments,
  type ProtestRow,
  type AttemptRow,
  type TournamentPlayerRow,
  type TournamentQuestionRow,
  type TournamentRow,
  type TournamentState,
  type TournamentStore,
} from '../tournaments';
import {
  buildEntrants,
  confirmBracketMatch,
  generateBracket,
  handleBrackets,
  nextPowerOfTwo,
  orderEntrants,
  recordBracketMatchResult,
  seedOrder,
  type BracketConfigRow,
  type BracketMatchRow,
  type BracketStore,
  type Entrant,
  type MatchPatch,
  type NewBracketMatch,
} from '../brackets';
import { type RatingRow, type RatingStore } from '../ratings';

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
    return [...this.tournaments.values()].filter((t) => t.state !== 'finished').map((t) => ({ ...t }));
  }
  async setTournamentState(id: number, state: TournamentState, startedAt: number | null, finishedAt: number | null): Promise<void> {
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
    const row = this.players.find((p) => p.tournamentId === tournamentId && p.userId === userId);
    return row ? { ...row } : null;
  }
  async listPlayers(tournamentId: number): Promise<TournamentPlayerRow[]> {
    return this.players.filter((p) => p.tournamentId === tournamentId).map((p) => ({ ...p }));
  }
  async addQuestions(tournamentId: number, qs: ReadonlyArray<Omit<TournamentQuestionRow, 'tournamentId'>>): Promise<void> {
    for (const q of qs) this.questions.push({ tournamentId, ...q });
  }
  async listQuestions(tournamentId: number): Promise<TournamentQuestionRow[]> {
    return this.questions.filter((q) => q.tournamentId === tournamentId).map((q) => ({ ...q }));
  }
  async createProtest(p: Omit<ProtestRow, 'id'>): Promise<number> {
    const id = this.nextProtestId++;
    this.protests.push({ ...p, id });
    return id;
  }
  async listProtestsForUser(tournamentId: number, userId: number): Promise<ProtestRow[]> {
    return this.protests.filter((p) => p.tournamentId === tournamentId && p.raisedBy === userId).map((p) => ({ ...p }));
  }
  async listProtestsForTournament(tournamentId: number): Promise<ProtestRow[]> {
    return this.protests.filter((p) => p.tournamentId === tournamentId).map((p) => ({ ...p }));
  }
  async createAttempt(a: Omit<AttemptRow, 'id'>): Promise<number> {
    const id = this.nextAttemptId++;
    this.attempts.push({ ...a, id });
    return id;
  }
  async listAttempts(tournamentId: number): Promise<AttemptRow[]> {
    return this.attempts.filter((a) => a.tournamentId === tournamentId).map((a) => ({ ...a }));
  }
  async findAttemptForProtest(): Promise<AttemptRow | null> {
    return null;
  }
  async applyAttemptRestitution(): Promise<void> {
    /* unused here */
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

class MemoryBracketStore implements BracketStore {
  private nextId = 1;
  public configs = new Map<number, BracketConfigRow>();
  public matches: BracketMatchRow[] = [];

  async getConfig(tournamentId: number): Promise<BracketConfigRow | null> {
    const c = this.configs.get(tournamentId);
    return c ? { ...c } : null;
  }
  async createConfig(row: BracketConfigRow): Promise<void> {
    this.configs.set(row.tournamentId, { ...row });
  }
  async createMatches(rows: ReadonlyArray<NewBracketMatch>): Promise<void> {
    for (const r of rows) {
      this.matches.push({ ...r, id: this.nextId++ });
    }
  }
  async listMatches(tournamentId: number): Promise<BracketMatchRow[]> {
    return this.matches
      .filter((m) => m.tournamentId === tournamentId)
      .sort((a, b) => a.round - b.round || a.slot - b.slot)
      .map((m) => ({ ...m }));
  }
  async updateMatch(id: number, patch: MatchPatch): Promise<void> {
    const m = this.matches.find((x) => x.id === id);
    if (!m) return;
    Object.assign(m, patch);
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

interface World {
  authStore: MemoryAuthStore;
  tStore: MemoryTournamentStore;
  bStore: MemoryBracketStore;
  ratingStore: MemoryRatingStore;
  hostCookie: string;
  hostId: number;
  playerIds: number[];
  playerCookies: string[];
}

/** Signs up a host + `n` players and has them all join an open tournament. */
async function seedOpenTournament(n: number, now = NOW): Promise<World & { tournamentId: number }> {
  const authStore = new MemoryAuthStore();
  const tStore = new MemoryTournamentStore();
  const bStore = new MemoryBracketStore();
  const ratingStore = new MemoryRatingStore();

  const hostRes = await handleAuth(
    req('POST', '/api/auth/signup', { username: 'host', password: 'password1' }),
    authStore,
    ctx({ now }),
  );
  const hostCookie = `session=${sessionCookieOf(hostRes as Response) ?? ''}`;
  const host = await authStore.findUserByUsername('host');

  const playerIds: number[] = [];
  const playerCookies: string[] = [];
  for (let i = 0; i < n; i++) {
    const res = await handleAuth(
      req('POST', '/api/auth/signup', { username: `player${i}`, password: 'password1' }),
      authStore,
      ctx({ now }),
    );
    const cookie = `session=${sessionCookieOf(res as Response) ?? ''}`;
    const u = await authStore.findUserByUsername(`player${i}`);
    playerIds.push(u?.id ?? 0);
    playerCookies.push(cookie);
  }

  const createRes = await handleTournaments(
    req('POST', '/api/tournaments', { name: 'Bracket Test', format: 'tossups', n_tossups: 1 }, hostCookie),
    authStore,
    tStore,
    ctx({ now }),
  );
  const createBody = (await createRes?.json()) as { tournament: { id: number } };
  const tournamentId = createBody.tournament.id;

  for (const cookie of playerCookies) {
    await handleTournaments(req('POST', `/api/tournaments/${tournamentId}/join`, {}, cookie), authStore, tStore, ctx({ now }));
  }

  return { authStore, tStore, bStore, ratingStore, hostCookie, hostId: host?.id ?? 0, playerIds, playerCookies, tournamentId };
}

afterEach(() => {
  __resetRateLimit();
});

// ---------------------------------------------------------------------------
// Pure math
// ---------------------------------------------------------------------------

describe('nextPowerOfTwo', () => {
  it('rounds up to the nearest power of two', () => {
    expect(nextPowerOfTwo(1)).toBe(1);
    expect(nextPowerOfTwo(2)).toBe(2);
    expect(nextPowerOfTwo(3)).toBe(4);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(8)).toBe(8);
    expect(nextPowerOfTwo(9)).toBe(16);
  });
});

describe('seedOrder', () => {
  it('pairs 1v2 for a 2-bracket', () => {
    expect(seedOrder(2)).toEqual([1, 2]);
  });
  it('pairs 1v4, 2v3 for a 4-bracket', () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
  });
  it('produces the standard 8-bracket seeding', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe('buildEntrants', () => {
  it('groups players by team and keeps solo players separate', () => {
    const players: TournamentPlayerRow[] = [
      { tournamentId: 1, userId: 1, team: 'Alpha', joinedAt: 1 },
      { tournamentId: 1, userId: 2, team: 'Alpha', joinedAt: 2 },
      { tournamentId: 1, userId: 3, team: '', joinedAt: 3 },
    ];
    const entrants = buildEntrants(players, (uid) => `user${uid}`);
    expect(entrants).toHaveLength(2);
    const alpha = entrants.find((e) => e.key === 't:Alpha');
    const solo = entrants.find((e) => e.key === 'u:3');
    expect(alpha?.memberUserIds).toEqual([1, 2]);
    expect(alpha?.label).toBe('Alpha');
    expect(solo?.memberUserIds).toEqual([3]);
    expect(solo?.label).toBe('user3');
  });
});

describe('orderEntrants', () => {
  const entrants: Entrant[] = [
    { key: 'a', label: 'A', memberUserIds: [1], seed: 0 },
    { key: 'b', label: 'B', memberUserIds: [2], seed: 0 },
    { key: 'c', label: 'C', memberUserIds: [3], seed: 0 },
  ];

  it('sorts by ELO descending', () => {
    const elo = new Map([['a', 500], ['b', 900], ['c', 100]]);
    const ordered = orderEntrants(entrants, 'elo', elo, null);
    expect(ordered.map((e) => e.key)).toEqual(['b', 'a', 'c']);
    expect(ordered[0]?.seed).toBe(1);
  });

  it('applies an exact manual order', () => {
    const ordered = orderEntrants(entrants, 'manual', new Map(), ['c', 'a', 'b']);
    expect(ordered.map((e) => e.key)).toEqual(['c', 'a', 'b']);
  });

  it('rejects a manual order missing an entrant', () => {
    expect(() => orderEntrants(entrants, 'manual', new Map(), ['a', 'b'])).toThrow();
  });

  it('rejects a manual order with an unknown key', () => {
    expect(() => orderEntrants(entrants, 'manual', new Map(), ['a', 'b', 'zzz'])).toThrow();
  });

  it('shuffles deterministically with an injected RNG', () => {
    const ordered = orderEntrants(entrants, 'random', new Map(), null, () => 0);
    expect(ordered).toHaveLength(3);
    expect(new Set(ordered.map((e) => e.key))).toEqual(new Set(['a', 'b', 'c']));
  });
});

describe('generateBracket', () => {
  it('builds one match for 2 entrants with no further rounds', () => {
    const entrants: Entrant[] = [
      { key: 'a', label: 'A', memberUserIds: [1], seed: 1 },
      { key: 'b', label: 'B', memberUserIds: [2], seed: 2 },
    ];
    const { matches, totalRounds } = generateBracket(entrants, 1, NOW);
    expect(totalRounds).toBe(1);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.state).toBe('ready');
  });

  it('gives the top seed a bye for 3 entrants and pre-resolves it', () => {
    const entrants: Entrant[] = [
      { key: 'a', label: 'A', memberUserIds: [1], seed: 1 },
      { key: 'b', label: 'B', memberUserIds: [2], seed: 2 },
      { key: 'c', label: 'C', memberUserIds: [3], seed: 3 },
    ];
    const { matches, totalRounds } = generateBracket(entrants, 1, NOW);
    expect(totalRounds).toBe(2);
    // bracketSize=4: seedOrder [1,4,2,3] -> slot0: seed1 vs seed4(bye), slot1: seed2 vs seed3
    const round1 = matches.filter((m) => m.round === 1);
    expect(round1).toHaveLength(2);
    const byeMatch = round1.find((m) => m.entrantBKey === null);
    expect(byeMatch?.entrantAKey).toBe('a');
    expect(byeMatch?.winnerKey).toBe('a');
    expect(byeMatch?.state).toBe('finished');
    const realMatch = round1.find((m) => m.entrantBKey !== null);
    expect(realMatch?.state).toBe('ready');
    const round2 = matches.filter((m) => m.round === 2);
    expect(round2).toHaveLength(1);
    expect(round2[0]?.state).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// recordBracketMatchResult / confirmBracketMatch
// ---------------------------------------------------------------------------

describe('recordBracketMatchResult', () => {
  it('auto-advances and rates a solo 1v1 match', async () => {
    const bStore = new MemoryBracketStore();
    const ratingStore = new MemoryRatingStore();
    await bStore.createConfig({ tournamentId: 1, seedingMode: 'manual', advanceMode: 'auto', eloMin: null, eloMax: null, createdAt: NOW });
    await bStore.createMatches([
      { tournamentId: 1, round: 1, slot: 0, entrantAKey: 'u:1', entrantALabel: 'p1', entrantBKey: 'u:2', entrantBLabel: 'p2', winnerKey: null, state: 'ready', createdAt: NOW, finishedAt: null },
      { tournamentId: 1, round: 1, slot: 1, entrantAKey: 'u:3', entrantALabel: 'p3', entrantBKey: 'u:4', entrantBLabel: 'p4', winnerKey: null, state: 'ready', createdAt: NOW, finishedAt: null },
      { tournamentId: 1, round: 2, slot: 0, entrantAKey: null, entrantALabel: null, entrantBKey: null, entrantBLabel: null, winnerKey: null, state: 'pending', createdAt: NOW, finishedAt: null },
    ]);
    const matches = await bStore.listMatches(1);
    const slot0 = matches[0]!;

    const result = await recordBracketMatchResult(bStore, ratingStore, 1, slot0.id, 'u:1', NOW);
    expect(result.ok).toBe(true);

    const after = await bStore.listMatches(1);
    const updatedSlot0 = after.find((m) => m.id === slot0.id)!;
    expect(updatedSlot0.state).toBe('finished');
    const round2 = after.find((m) => m.round === 2)!;
    expect(round2.entrantAKey).toBe('u:1');
    expect(round2.state).toBe('pending'); // slot1 hasn't finished yet

    // ELO was applied for the solo match.
    expect((await ratingStore.getRating(1))?.wins).toBe(1);
    expect((await ratingStore.getRating(2))?.losses).toBe(1);
  });

  it('parks the result in awaiting_confirm for manual advance mode', async () => {
    const bStore = new MemoryBracketStore();
    const ratingStore = new MemoryRatingStore();
    await bStore.createConfig({ tournamentId: 1, seedingMode: 'manual', advanceMode: 'manual', eloMin: null, eloMax: null, createdAt: NOW });
    await bStore.createMatches([
      { tournamentId: 1, round: 1, slot: 0, entrantAKey: 'u:1', entrantALabel: 'p1', entrantBKey: 'u:2', entrantBLabel: 'p2', winnerKey: null, state: 'ready', createdAt: NOW, finishedAt: null },
      { tournamentId: 1, round: 2, slot: 0, entrantAKey: null, entrantALabel: null, entrantBKey: null, entrantBLabel: null, winnerKey: null, state: 'pending', createdAt: NOW, finishedAt: null },
    ]);
    const [match] = await bStore.listMatches(1);

    const result = await recordBracketMatchResult(bStore, ratingStore, 1, match!.id, 'u:1', NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.match.state).toBe('awaiting_confirm');

    // Not propagated yet, and no ELO yet either.
    const afterResult = await bStore.listMatches(1);
    expect(afterResult.find((m) => m.round === 2)?.entrantAKey).toBeNull();
    expect(await ratingStore.getRating(1)).toBeNull();

    const confirmed = await confirmBracketMatch(bStore, ratingStore, 1, match!.id, NOW + 1);
    expect(confirmed.ok).toBe(true);
    const afterConfirm = await bStore.listMatches(1);
    expect(afterConfirm.find((m) => m.round === 2)?.entrantAKey).toBe('u:1');
    expect((await ratingStore.getRating(1))?.wins).toBe(1);
  });

  it('rejects a winner_key that is not one of the match entrants', async () => {
    const bStore = new MemoryBracketStore();
    const ratingStore = new MemoryRatingStore();
    await bStore.createConfig({ tournamentId: 1, seedingMode: 'manual', advanceMode: 'auto', eloMin: null, eloMax: null, createdAt: NOW });
    await bStore.createMatches([
      { tournamentId: 1, round: 1, slot: 0, entrantAKey: 'u:1', entrantALabel: 'p1', entrantBKey: 'u:2', entrantBLabel: 'p2', winnerKey: null, state: 'ready', createdAt: NOW, finishedAt: null },
    ]);
    const [match] = await bStore.listMatches(1);
    const result = await recordBracketMatchResult(bStore, ratingStore, 1, match!.id, 'u:999', NOW);
    expect(result.ok).toBe(false);
  });

  it('does not rate a team match', async () => {
    const bStore = new MemoryBracketStore();
    const ratingStore = new MemoryRatingStore();
    await bStore.createConfig({ tournamentId: 1, seedingMode: 'manual', advanceMode: 'auto', eloMin: null, eloMax: null, createdAt: NOW });
    await bStore.createMatches([
      { tournamentId: 1, round: 1, slot: 0, entrantAKey: 't:Alpha', entrantALabel: 'Alpha', entrantBKey: 't:Beta', entrantBLabel: 'Beta', winnerKey: null, state: 'ready', createdAt: NOW, finishedAt: null },
    ]);
    const [match] = await bStore.listMatches(1);
    const result = await recordBracketMatchResult(bStore, ratingStore, 1, match!.id, 't:Alpha', NOW);
    expect(result.ok).toBe(true);
    expect(ratingStore.rows.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

describe('handleBrackets', () => {
  it('404s when there is no bracket yet', async () => {
    const w = await seedOpenTournament(2);
    const res = await handleBrackets(
      req('GET', `/api/tournaments/${w.tournamentId}/bracket`),
      w.authStore,
      w.tStore,
      w.bStore,
      w.ratingStore,
      ctx(),
    );
    expect(res?.status).toBe(404);
  });

  it('lets only the TD or an admin create the bracket', async () => {
    const w = await seedOpenTournament(4);
    const res = await handleBrackets(
      req('POST', `/api/tournaments/${w.tournamentId}/bracket`, { seeding_mode: 'random' }, w.playerCookies[0]),
      w.authStore,
      w.tStore,
      w.bStore,
      w.ratingStore,
      ctx(),
    );
    expect(res?.status).toBe(403);
  });

  it('seeds a manual bracket and returns rounds', async () => {
    // seedOpenTournament's host also auto-joins as a player (tournaments.ts
    // behavior), so 3 joiners + the host = 4 entrants.
    const w = await seedOpenTournament(3);
    const manualSeeds = [w.hostId, ...w.playerIds].map((id) => `u:${id}`);
    const res = await handleBrackets(
      req('POST', `/api/tournaments/${w.tournamentId}/bracket`, { seeding_mode: 'manual', manual_seeds: manualSeeds }, w.hostCookie),
      w.authStore,
      w.tStore,
      w.bStore,
      w.ratingStore,
      ctx(),
    );
    expect(res?.status).toBe(200);
    const body = (await res?.json()) as { bracket: { rounds: Array<{ round: number; matches: unknown[] }> } };
    expect(body.bracket.rounds).toHaveLength(2);
    expect(body.bracket.rounds[0]?.matches).toHaveLength(2);
    expect(body.bracket.rounds[1]?.matches).toHaveLength(1);
  });

  it('refuses a second bracket on the same tournament', async () => {
    const w = await seedOpenTournament(1);
    const manualSeeds = [w.hostId, ...w.playerIds].map((id) => `u:${id}`);
    await handleBrackets(
      req('POST', `/api/tournaments/${w.tournamentId}/bracket`, { seeding_mode: 'manual', manual_seeds: manualSeeds }, w.hostCookie),
      w.authStore,
      w.tStore,
      w.bStore,
      w.ratingStore,
      ctx(),
    );
    const res = await handleBrackets(
      req('POST', `/api/tournaments/${w.tournamentId}/bracket`, { seeding_mode: 'manual', manual_seeds: manualSeeds }, w.hostCookie),
      w.authStore,
      w.tStore,
      w.bStore,
      w.ratingStore,
      ctx(),
    );
    expect(res?.status).toBe(409);
  });

  it('rejects seeding when an entrant falls outside the ELO band', async () => {
    const w = await seedOpenTournament(2);
    await w.ratingStore.upsertRating({ userId: w.playerIds[0]!, elo: 2000, wins: 0, losses: 0, updatedAt: NOW });
    const res = await handleBrackets(
      req('POST', `/api/tournaments/${w.tournamentId}/bracket`, { seeding_mode: 'random', elo_max: 1000 }, w.hostCookie),
      w.authStore,
      w.tStore,
      w.bStore,
      w.ratingStore,
      ctx(),
    );
    expect(res?.status).toBe(400);
  });

  it('end to end: seed, play both rounds, crown a champion with ELO applied', async () => {
    const w = await seedOpenTournament(3);
    const manualSeeds = [w.hostId, ...w.playerIds].map((id) => `u:${id}`);
    const seedRes = await handleBrackets(
      req('POST', `/api/tournaments/${w.tournamentId}/bracket`, { seeding_mode: 'manual', manual_seeds: manualSeeds }, w.hostCookie),
      w.authStore,
      w.tStore,
      w.bStore,
      w.ratingStore,
      ctx(),
    );
    const seedBody = (await seedRes?.json()) as {
      bracket: { rounds: Array<{ round: number; matches: Array<{ id: number; entrant_a: { key: string } | null }> }> };
    };
    const round1 = seedBody.bracket.rounds.find((r) => r.round === 1)!;

    for (const m of round1.matches) {
      const winnerKey = m.entrant_a!.key;
      const res = await handleBrackets(
        req('POST', `/api/tournaments/${w.tournamentId}/bracket/matches/${m.id}/result`, { winner_key: winnerKey }, w.hostCookie),
        w.authStore,
        w.tStore,
        w.bStore,
        w.ratingStore,
        ctx(),
      );
      expect(res?.status).toBe(200);
    }

    const midRes = await handleBrackets(
      req('GET', `/api/tournaments/${w.tournamentId}/bracket`),
      w.authStore,
      w.tStore,
      w.bStore,
      w.ratingStore,
      ctx(),
    );
    const midBody = (await midRes?.json()) as {
      bracket: { rounds: Array<{ round: number; matches: Array<{ id: number; state: string; entrant_a: { key: string } | null }> }> };
    };
    const round2 = midBody.bracket.rounds.find((r) => r.round === 2)!;
    expect(round2.matches[0]?.state).toBe('ready');

    const finalMatchId = round2.matches[0]!.id;
    const championKey = round2.matches[0]!.entrant_a!.key;
    const finalRes = await handleBrackets(
      req('POST', `/api/tournaments/${w.tournamentId}/bracket/matches/${finalMatchId}/result`, { winner_key: championKey }, w.hostCookie),
      w.authStore,
      w.tStore,
      w.bStore,
      w.ratingStore,
      ctx(),
    );
    expect(finalRes?.status).toBe(200);

    // Two solo matches finished in round 1 plus the final = 3 rated results.
    const championUserId = Number(championKey.split(':')[1]);
    const championRating = await w.ratingStore.getRating(championUserId);
    expect(championRating?.wins).toBe(2);
  });
});
