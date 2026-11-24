/**
 * Client store for the ELO ratings + rank endpoints.
 *
 * Mirrors tournaments.ts: thin fetch wrappers plus a couple of hooks. The rank
 * shape (tier, subrank, label, is_god) is computed server-side in
 * workers/room/ratings.ts, so this module never duplicates the ELO or
 * tier-boundary math — it only renders what the server already decided.
 */

import { useCallback, useEffect, useState } from 'react';

export interface RankPublic {
  tier: string;
  subrank: number | null;
  label: string;
  is_god: boolean;
}

export interface RatingPublic {
  user_id: number;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  rank: RankPublic;
}

export interface LeaderboardEntry extends RatingPublic {
  position: number;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body && typeof body.error === 'string' && body.error.length > 0) {
      return body.error;
    }
  } catch {
    // Non-JSON body, fall through.
  }
  return `request failed (${res.status})`;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}

/** Admin-only: set a user's ELO directly, which recomputes their rank too
 * (rank is a pure function of ELO server-side). Wins/losses are untouched. */
export async function setUserElo(userId: number, elo: number): Promise<RatingPublic> {
  const res = await fetch(`/api/admin/users/${userId}/elo`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ elo }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { rating: RatingPublic };
  return body.rating;
}

export async function fetchMyRating(): Promise<RatingPublic> {
  const body = await getJson<{ rating: RatingPublic }>('/api/ratings/me');
  return body.rating;
}

export async function fetchRating(userId: number): Promise<RatingPublic> {
  const body = await getJson<{ rating: RatingPublic }>(`/api/ratings/${userId}`);
  return body.rating;
}

export async function fetchLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const body = await getJson<{ leaderboard: LeaderboardEntry[] }>(
    `/api/leaderboard?limit=${limit}`,
  );
  return body.leaderboard ?? [];
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface MyRatingHandle {
  rating: RatingPublic | null;
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
}

/** The signed-in user's own rating. Returns nulls (no fetch) when signed out. */
export function useMyRating(signedIn: boolean): MyRatingHandle {
  const [rating, setRating] = useState<RatingPublic | null>(null);
  const [loading, setLoading] = useState(signedIn);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!signedIn) {
      setRating(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRating(await fetchMyRating());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rating, loading, error, refresh };
}

export interface LeaderboardHandle {
  entries: LeaderboardEntry[];
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
}

export function useLeaderboard(limit = 50): LeaderboardHandle {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await fetchLeaderboard(limit));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { entries, loading, error, refresh };
}
