/**
 * Client store for the tournament endpoints.
 *
 * The API shapes mirror `workers/room/tournaments.ts`; this module keeps a
 * module-level map of tournaments by id and a list cache so multiple consumers
 * share one request in flight, in the same spirit as the `useAuth` store.
 *
 * Nothing here persists to storage: tournament data is server-authoritative and
 * cheap to refetch when the hub mounts.
 */

import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TournamentFormat = 'tossups' | 'tossups_bonuses';
export type TournamentState = 'open' | 'running' | 'finished' | 'cancelled';
export type QuestionKind = 'tossup' | 'bonus';
export type ProtestClientState = 'pending' | 'accepted' | 'rejected';

export interface TournamentSummary {
  id: number;
  name: string;
  format: TournamentFormat;
  n_tossups: number;
  n_bonuses: number;
  created_by: number;
  creator_username: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  state: TournamentState;
  player_count: number;
}

export interface TournamentPlayer {
  user_id: number;
  username: string;
  team: string;
  joined_at: number;
}

export interface TournamentQuestion {
  seq: number;
  question_id: string;
  question_kind: QuestionKind;
}

export interface TournamentDetail extends TournamentSummary {
  players: TournamentPlayer[];
  questions: TournamentQuestion[];
}

export interface Protest {
  id: number;
  tournament_id: number;
  question_id: string;
  raised_by: number;
  reason: string;
  given_answer: string;
  state: ProtestClientState;
  created_at: number;
  resolved_by: number | null;
  resolved_at: number | null;
  resolved_note: string | null;
}

export interface PublicTossupRow {
  id: string;
  question: string;
  question_sanitized: string;
  answer: string;
  answer_sanitized: string;
  category: string;
  subcategory: string;
  difficulty: number;
  set_name: string;
  set_year: number;
  packet_number: number;
  question_number: number;
}

export interface PublicBonusRow {
  id: string;
  leadin: string;
  leadin_sanitized: string;
  parts: string[];
  parts_sanitized: string[];
  answers: string[];
  answers_sanitized: string[];
  values: number[] | null;
  category: string;
  subcategory: string;
  difficulty: number;
  set_name: string;
}

export type SeqQuestion =
  | {
      seq: number;
      question_id: string;
      question_kind: 'tossup';
      total: number;
      tossup: PublicTossupRow;
    }
  | {
      seq: number;
      question_id: string;
      question_kind: 'bonus';
      total: number;
      bonus: PublicBonusRow;
    };

export type AttemptDirective = 'accept' | 'prompt' | 'reject';

export interface AttemptInput {
  seq: number;
  question_id: string;
  given_answer: string;
  directive: AttemptDirective;
  points: number;
  powered: boolean;
  buzz_word_index: number | null;
  total_words: number;
  power_word_index: number | null;
  ms_to_answer: number | null;
}

export interface ScoreboardEntry {
  user_id: number;
  username: string;
  team: string;
  base_points: number;
  restitution_delta: number;
  points: number;
}

export interface CreateTournamentInput {
  name: string;
  format: TournamentFormat;
  n_tossups: number;
  n_bonuses?: number;
  team?: string;
}

export interface FileProtestInput {
  question_id: string;
  reason: string;
  given_answer?: string;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body && typeof body.error === 'string' && body.error.length > 0) {
      return body.error;
    }
  } catch {
    // ignore
  }
  return `request failed (${res.status})`;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function listTournaments(): Promise<TournamentSummary[]> {
  const body = await getJson<{ tournaments: TournamentSummary[] }>(
    '/api/tournaments',
  );
  return body.tournaments ?? [];
}

export async function fetchTournament(id: number): Promise<TournamentDetail> {
  const body = await getJson<{ tournament: TournamentDetail }>(
    `/api/tournaments/${id}`,
  );
  return body.tournament;
}

export async function createTournament(
  input: CreateTournamentInput,
): Promise<TournamentDetail> {
  const body = await postJson<{ tournament: TournamentDetail }>(
    '/api/tournaments',
    input,
  );
  return body.tournament;
}

export async function joinTournament(
  id: number,
  team: string = '',
): Promise<TournamentDetail> {
  const body = await postJson<{ tournament: TournamentDetail }>(
    `/api/tournaments/${id}/join`,
    { team },
  );
  return body.tournament;
}

export async function startTournament(
  id: number,
  questions: TournamentQuestion[],
): Promise<TournamentDetail> {
  const body = await postJson<{ tournament: TournamentDetail }>(
    `/api/tournaments/${id}/start`,
    { questions },
  );
  return body.tournament;
}

export async function fileProtest(
  tournamentId: number,
  input: FileProtestInput,
): Promise<{ id: number; state: ProtestClientState }> {
  return postJson<{ id: number; state: ProtestClientState }>(
    `/api/tournaments/${tournamentId}/protest`,
    input,
  );
}

export async function listProtests(tournamentId: number): Promise<Protest[]> {
  const body = await getJson<{ protests: Protest[] }>(
    `/api/tournaments/${tournamentId}/protests`,
  );
  return body.protests ?? [];
}

/**
 * Fetch the pinned question at `seq`. The server resolves the stored
 * question id through QB Reader and caches the result, so every player in a
 * tournament sees the same question text in the same order.
 */
export async function fetchTournamentQuestion(
  tournamentId: number,
  seq: number,
): Promise<SeqQuestion> {
  return getJson<SeqQuestion>(
    `/api/tournaments/${tournamentId}/questions/${seq}`,
  );
}

/** Persist a resolved tournament question. The server scores the scoreboard. */
export async function recordAttempt(
  tournamentId: number,
  input: AttemptInput,
): Promise<{ id: number }> {
  return postJson<{ id: number }>(
    `/api/tournaments/${tournamentId}/attempts`,
    input,
  );
}

/** Live scoreboard: base points + any restitution deltas per player. */
export async function fetchScoreboard(
  tournamentId: number,
): Promise<ScoreboardEntry[]> {
  const body = await getJson<{ scoreboard: ScoreboardEntry[] }>(
    `/api/tournaments/${tournamentId}/scoreboard`,
  );
  return body.scoreboard ?? [];
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface TournamentListHandle {
  tournaments: TournamentSummary[];
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
}

/** Fetch the open+running tournaments on mount. A refresh() triggers a reload. */
export function useTournamentList(): TournamentListHandle {
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTournaments(await listTournaments());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tournaments, loading, error, refresh };
}

export interface TournamentHandle {
  tournament: TournamentDetail | null;
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
  /** Optimistic set from a mutation response. */
  update(t: TournamentDetail): void;
}

/** Fetch one tournament by id, reloaded on demand. */
export function useTournament(id: number | null): TournamentHandle {
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(id !== null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (id === null) return;
    setLoading(true);
    try {
      setTournament(await fetchTournament(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id === null) {
      setTournament(null);
      setLoading(false);
      return;
    }
    void refresh();
  }, [id, refresh]);

  const update = useCallback((t: TournamentDetail) => {
    setTournament(t);
    setError(null);
  }, []);

  return { tournament, loading, error, refresh, update };
}
