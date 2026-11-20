/**
 * Client store for the bracket endpoints (workers/room/brackets.ts).
 *
 * Bracket mode is purely additive: a tournament has a bracket if and only if
 * `fetchBracket` doesn't 404. There's no "mode" field on the tournament
 * itself — the TD can seed a bracket for any open tournament from its detail
 * page (see BracketPanel.tsx).
 */

import { useCallback, useEffect, useState } from 'react';

export type SeedingMode = 'random' | 'elo' | 'manual';
export type AdvanceMode = 'auto' | 'manual';
export type MatchState = 'pending' | 'ready' | 'awaiting_confirm' | 'finished';

export interface BracketMatch {
  id: number;
  round: number;
  slot: number;
  entrant_a: { key: string; label: string } | null;
  entrant_b: { key: string; label: string } | null;
  winner_key: string | null;
  state: MatchState;
}

export interface Bracket {
  seeding_mode: SeedingMode;
  advance_mode: AdvanceMode;
  elo_min: number | null;
  elo_max: number | null;
  rounds: Array<{ round: number; matches: BracketMatch[] }>;
}

export interface CreateBracketInput {
  seeding_mode: SeedingMode;
  advance_mode: AdvanceMode;
  elo_min?: number;
  elo_max?: number;
  manual_seeds?: string[];
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body && typeof body.error === 'string' && body.error.length > 0) return body.error;
  } catch {
    // Non-JSON body, fall through.
  }
  return `request failed (${res.status})`;
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

/** Null (not an error) when the tournament has no bracket yet. */
export async function fetchBracket(tournamentId: number): Promise<Bracket | null> {
  const res = await fetch(`/api/tournaments/${tournamentId}/bracket`, { credentials: 'same-origin' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { bracket: Bracket };
  return body.bracket;
}

export async function createBracket(tournamentId: number, input: CreateBracketInput): Promise<Bracket> {
  const body = await postJson<{ bracket: Bracket }>(`/api/tournaments/${tournamentId}/bracket`, input);
  return body.bracket;
}

export async function recordBracketResult(
  tournamentId: number,
  matchId: number,
  winnerKey: string,
): Promise<BracketMatch> {
  const body = await postJson<{ match: BracketMatch }>(
    `/api/tournaments/${tournamentId}/bracket/matches/${matchId}/result`,
    { winner_key: winnerKey },
  );
  return body.match;
}

export async function confirmBracketMatch(tournamentId: number, matchId: number): Promise<BracketMatch> {
  const body = await postJson<{ match: BracketMatch }>(
    `/api/tournaments/${tournamentId}/bracket/matches/${matchId}/confirm`,
    {},
  );
  return body.match;
}

export interface BracketHandle {
  bracket: Bracket | null;
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
}

export function useBracket(tournamentId: number): BracketHandle {
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBracket(await fetchBracket(tournamentId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { bracket, loading, error, refresh };
}
