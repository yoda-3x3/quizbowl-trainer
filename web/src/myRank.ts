/**
 * One shared copy of the signed-in user's rating for the whole shell.
 *
 * The top-bar badge, the rank backdrop and the rank loading screen all need
 * the same `/api/ratings/me` answer; `useMyRating` in rank.ts fetches once per
 * component, which would triple the request on every tab switch. This store
 * fetches once per signed-in user, refetches when the window regains focus
 * (a match elsewhere may have moved the ELO), and clears on sign-out.
 *
 * Also holds a small username -> rating map built from the leaderboard, for
 * screens (H2H rooms) whose player list only carries display names.
 */

import { useEffect, useState } from 'react';
import { fetchLeaderboard, fetchMyRating, type RatingPublic } from './rank';
import { useAuth } from './auth';

let mine: RatingPublic | null = null;
let mineFor: number | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(r: RatingPublic | null) => void>();

function publish(r: RatingPublic | null): void {
  mine = r;
  for (const l of listeners) l(r);
}

/** Refetch the signed-in user's rating now (e.g. after a rated match). */
export async function refreshMyRank(): Promise<void> {
  if (mineFor === null) return;
  const forUser = mineFor;
  try {
    const r = await fetchMyRating();
    if (mineFor === forUser) publish(r);
  } catch {
    // Keep the last known rating; the badge is cosmetic.
  }
}

function ensureFor(userId: number | null): void {
  if (userId === mineFor) return;
  mineFor = userId;
  if (userId === null) {
    publish(null);
    return;
  }
  publish(null);
  inflight = refreshMyRank().finally(() => {
    inflight = null;
  });
}

let focusBound = false;
function bindFocus(): void {
  if (focusBound || typeof window === 'undefined') return;
  focusBound = true;
  window.addEventListener('focus', () => {
    if (!inflight) void refreshMyRank();
  });
}

/** The signed-in user's rating, or null while signed out / loading. */
export function useMyRank(): RatingPublic | null {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const [value, setValue] = useState<RatingPublic | null>(mineFor === userId ? mine : null);

  useEffect(() => {
    const listen = (r: RatingPublic | null) => setValue(r);
    listeners.add(listen);
    bindFocus();
    ensureFor(userId);
    setValue(mineFor === userId ? mine : null);
    return () => {
      listeners.delete(listen);
    };
  }, [userId]);

  return value;
}

// ---------------------------------------------------------------------------
// Ratings by username (for rooms, whose players carry only a name)
// ---------------------------------------------------------------------------

const BOARD_TTL_MS = 60_000;
let board: Map<string, RatingPublic> | null = null;
let boardAt = 0;
let boardInflight: Promise<Map<string, RatingPublic>> | null = null;

async function loadBoard(): Promise<Map<string, RatingPublic>> {
  if (board && Date.now() - boardAt < BOARD_TTL_MS) return board;
  if (!boardInflight) {
    boardInflight = fetchLeaderboard(200)
      .then((entries) => {
        const map = new Map<string, RatingPublic>();
        for (const e of entries) map.set(e.username.toLowerCase(), e);
        board = map;
        boardAt = Date.now();
        return map;
      })
      .catch(() => board ?? new Map<string, RatingPublic>())
      .finally(() => {
        boardInflight = null;
      });
  }
  return boardInflight;
}

/** Ratings for the given usernames, looked up on the (cached) leaderboard.
 *  Unrated players are simply absent from the map. */
export function useRanksByName(names: readonly string[]): Map<string, RatingPublic> {
  const [map, setMap] = useState<Map<string, RatingPublic>>(board ?? new Map());
  const key = names.map((n) => n.toLowerCase()).sort().join('|');

  useEffect(() => {
    if (!key) return;
    let live = true;
    void loadBoard().then((m) => {
      if (live) setMap(m);
    });
    return () => {
      live = false;
    };
  }, [key]);

  return map;
}

export function rankForName(
  map: Map<string, RatingPublic>,
  name: string,
): RatingPublic | undefined {
  return map.get(name.toLowerCase());
}

/** Test-only. */
export function __resetMyRank(): void {
  mine = null;
  mineFor = null;
  inflight = null;
  listeners.clear();
  board = null;
  boardAt = 0;
  boardInflight = null;
}
