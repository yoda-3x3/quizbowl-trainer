/**
 * Tests for the client tournament store.
 *
 * Stubs global fetch so each action exercises its request shape, happy path
 * response parsing, and error surface. Hooks are exercised through the module
 * exports and the setState path rather than a renderer, since no jsdom is set
 * up in this project.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTournament,
  fetchTournament,
  fileProtest,
  joinTournament,
  listProtests,
  listTournaments,
  startTournament,
  type TournamentDetail,
} from '../tournaments';

interface MockResponse {
  ok: boolean;
  status?: number;
  body?: unknown;
  errorJson?: boolean;
}

function mockFetch(responses: MockResponse[]): ReturnType<typeof vi.fn> {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push([String(input), init]);
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return {
      ok: next.ok,
      status: next.status ?? (next.ok ? 200 : 400),
      json: async () => {
        if (next.errorJson) throw new Error('bad json');
        return next.body;
      },
    } as unknown as Response;
  });
  (fn as unknown as { calls: typeof calls }).calls = calls;
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function sampleDetail(overrides: Partial<TournamentDetail> = {}): TournamentDetail {
  return {
    id: 1,
    name: 'Sample',
    format: 'tossups',
    n_tossups: 3,
    n_bonuses: 0,
    created_by: 1,
    creator_username: 'alice',
    created_at: 1_700_000_000_000,
    started_at: null,
    finished_at: null,
    state: 'open',
    player_count: 1,
    players: [
      { user_id: 1, username: 'alice', team: '', joined_at: 1_700_000_000_000 },
    ],
    questions: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

describe('listTournaments', () => {
  it('GETs /api/tournaments and returns the array', async () => {
    const fetchMock = mockFetch([
      { ok: true, body: { tournaments: [sampleDetail({ id: 7 })] } },
    ]);
    const list = await listTournaments();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(7);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/tournaments');
  });

  it('returns an empty array when the response omits tournaments', async () => {
    mockFetch([{ ok: true, body: {} }]);
    const list = await listTournaments();
    expect(list).toEqual([]);
  });

  it('throws with the server error string on a non-2xx', async () => {
    mockFetch([{ ok: false, status: 500, body: { error: 'boom' } }]);
    await expect(listTournaments()).rejects.toThrow('boom');
  });

  it('throws a generic error when the body is not JSON', async () => {
    mockFetch([{ ok: false, status: 500, errorJson: true }]);
    await expect(listTournaments()).rejects.toThrow('request failed (500)');
  });
});

describe('fetchTournament', () => {
  it('GETs /api/tournaments/:id and unwraps tournament', async () => {
    const fetchMock = mockFetch([
      { ok: true, body: { tournament: sampleDetail({ id: 42 }) } },
    ]);
    const t = await fetchTournament(42);
    expect(t.id).toBe(42);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/tournaments/42');
  });
});

describe('createTournament', () => {
  it('POSTs the body and returns the detail', async () => {
    const fetchMock = mockFetch([
      { ok: true, body: { tournament: sampleDetail({ name: 'New' }) } },
    ]);
    const t = await createTournament({
      name: 'New',
      format: 'tossups',
      n_tossups: 3,
      team: 'Red',
    });
    expect(t.name).toBe('New');
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe('/api/tournaments');
    const init = call?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'New',
      format: 'tossups',
      n_tossups: 3,
      team: 'Red',
    });
  });

  it('bubbles up the server error on 400', async () => {
    mockFetch([{ ok: false, status: 400, body: { error: 'bad name' } }]);
    await expect(
      createTournament({ name: '', format: 'tossups', n_tossups: 3 }),
    ).rejects.toThrow('bad name');
  });
});

describe('joinTournament', () => {
  it('POSTs the team to /join', async () => {
    const fetchMock = mockFetch([
      { ok: true, body: { tournament: sampleDetail() } },
    ]);
    await joinTournament(7, 'Blue');
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe('/api/tournaments/7/join');
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
      team: 'Blue',
    });
  });

  it('defaults team to empty string', async () => {
    const fetchMock = mockFetch([
      { ok: true, body: { tournament: sampleDetail() } },
    ]);
    await joinTournament(7);
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toEqual({ team: '' });
  });
});

describe('startTournament', () => {
  it('POSTs the question list', async () => {
    const fetchMock = mockFetch([
      { ok: true, body: { tournament: sampleDetail({ state: 'running' }) } },
    ]);
    const questions = [
      { seq: 0, question_id: 'q0', question_kind: 'tossup' as const },
      { seq: 1, question_id: 'q1', question_kind: 'tossup' as const },
    ];
    const t = await startTournament(3, questions);
    expect(t.state).toBe('running');
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.questions).toEqual(questions);
  });
});

describe('fileProtest', () => {
  it('POSTs question_id, reason, given_answer', async () => {
    const fetchMock = mockFetch([
      { ok: true, body: { id: 5, state: 'pending' } },
    ]);
    const res = await fileProtest(9, {
      question_id: 'q0',
      reason: 'a reason long enough',
      given_answer: 'dickens',
    });
    expect(res).toEqual({ id: 5, state: 'pending' });
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toEqual({
      question_id: 'q0',
      reason: 'a reason long enough',
      given_answer: 'dickens',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/tournaments/9/protest');
  });

  it('raises the server message on 429', async () => {
    mockFetch([
      { ok: false, status: 429, body: { error: 'too many protests, try again later' } },
    ]);
    await expect(
      fileProtest(1, { question_id: 'q0', reason: 'xxxxxxxxxxx' }),
    ).rejects.toThrow('too many protests');
  });
});

describe('listProtests', () => {
  it('GETs /api/tournaments/:id/protests', async () => {
    const fetchMock = mockFetch([{ ok: true, body: { protests: [] } }]);
    const rows = await listProtests(1);
    expect(rows).toEqual([]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/tournaments/1/protests');
  });

  it('returns an empty array when the body omits the field', async () => {
    mockFetch([{ ok: true, body: {} }]);
    expect(await listProtests(1)).toEqual([]);
  });
});
