/**
 * Client side of category tags and public profiles.
 *
 * - `syncAttempts` uploads this device's AttemptEvent log (src/engine/log.ts)
 *   to POST /api/stats/attempts for the signed-in user. The server dedupes on
 *   the event id, so re-sending is harmless; a per-user high-water mark in
 *   localStorage just keeps each sync small.
 * - `useTags` batches GET /api/tags lookups for whatever names are on screen
 *   (leaderboard, room, H2H) behind a short-lived cache.
 * - Profiles are addressed by the hash route `#/u/<id>` (see App.tsx), which
 *   is the stable URL anything outside the app — a future forum, a shared
 *   link — can point at. `profileUrl()` builds it.
 *
 * Tag rules and stats math live on the server (workers/room/profile.ts); this
 * module only renders what it returns.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { all } from './engine/log';
import type { AttemptEvent } from './types';
import type { RankPublic } from './rank';

export type TagKind = 'category' | 'top' | 'meta';

export interface Tag {
  id: string;
  label: string;
  kind: TagKind;
  description: string;
  categories: string[];
}

export interface CategoryMetrics {
  category: string;
  heard: number;
  correct: number;
  tossups: number;
  powers: number;
  negs: number;
  accuracy: number;
  power_rate: number;
  neg_rate: number;
  avg_buzz: number | null;
}

export interface ProfileRecentAttempt {
  at: number;
  mode: string;
  category: string;
  correct: boolean;
  powered: boolean;
  neg: boolean;
  points: number;
}

export interface ProfileRecentMatch {
  id: number;
  finished_at: number;
  won: boolean;
  rated: boolean;
  opponent_id: number | null;
  opponent: string;
}

export interface PublicProfile {
  user_id: number;
  username: string;
  joined_at: number;
  rating: { elo: number; wins: number; losses: number; rank: RankPublic };
  tags: Tag[];
  totals: { heard: number; correct: number; tossups: number; powers: number; accuracy: number; power_rate: number };
  categories: CategoryMetrics[];
  recent_attempts: ProfileRecentAttempt[];
  recent_matches: ProfileRecentMatch[];
  url: string;
}

async function errorOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // Non-JSON body.
  }
  return `request failed (${res.status})`;
}

export async function fetchProfile(userId: number): Promise<PublicProfile> {
  const res = await fetch(`/api/profile/${userId}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(await errorOf(res));
  return ((await res.json()) as { profile: PublicProfile }).profile;
}

// ---------------------------------------------------------------------------
// Routing: #/u/<id>
// ---------------------------------------------------------------------------

const PROFILE_HASH = /^#\/u\/(\d+)$/;

/** The in-app URL of a profile. Stable: safe to link from outside the app. */
export function profileUrl(userId: number): string {
  return `/#/u/${userId}`;
}

export function profileIdFromHash(hash: string): number | null {
  const m = PROFILE_HASH.exec(hash);
  const n = m ? Number(m[1]) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function openProfile(userId: number): void {
  window.location.hash = `/u/${userId}`;
}

export function closeProfile(): void {
  if (profileIdFromHash(window.location.hash) === null) return;
  // Drop the hash without leaving a "#" behind or adding a history entry.
  history.replaceState(null, '', window.location.pathname + window.location.search);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** The profile currently routed to, or null. */
export function useProfileRoute(): number | null {
  const [id, setId] = useState<number | null>(() =>
    typeof window === 'undefined' ? null : profileIdFromHash(window.location.hash),
  );
  useEffect(() => {
    const on = () => setId(profileIdFromHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return id;
}

// ---------------------------------------------------------------------------
// Tags, batched + cached
// ---------------------------------------------------------------------------

const TAG_TTL_MS = 60_000;
const tagCache = new Map<number, { tags: Tag[]; at: number }>();

export async function fetchTags(ids: number[]): Promise<Record<number, Tag[]>> {
  const now = Date.now();
  const out: Record<number, Tag[]> = {};
  const missing: number[] = [];
  for (const id of ids) {
    const hit = tagCache.get(id);
    if (hit && now - hit.at < TAG_TTL_MS) out[id] = hit.tags;
    else missing.push(id);
  }
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    const res = await fetch(`/api/tags?ids=${chunk.join(',')}`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(await errorOf(res));
    const body = (await res.json()) as { tags: Record<string, Tag[]> };
    for (const id of chunk) {
      const tags = body.tags[String(id)] ?? [];
      tagCache.set(id, { tags, at: now });
      out[id] = tags;
    }
  }
  return out;
}

/** Earned tags for the given user ids. Ids that are null/undefined are skipped. */
export function useTags(ids: Array<number | null | undefined>): Record<number, Tag[]> {
  const key = useMemo(
    () =>
      [...new Set(ids.filter((n): n is number => typeof n === 'number' && n > 0))]
        .sort((a, b) => a - b)
        .join(','),
    [ids],
  );
  const [tags, setTags] = useState<Record<number, Tag[]>>({});
  useEffect(() => {
    if (!key) return;
    let live = true;
    fetchTags(key.split(',').map(Number))
      .then((t) => {
        if (live) setTags(t);
      })
      .catch(() => {
        // Tags are decoration; a failed lookup just shows none.
      });
    return () => {
      live = false;
    };
  }, [key]);
  return tags;
}

// ---------------------------------------------------------------------------
// Attempt sync
// ---------------------------------------------------------------------------

const SYNC_CHUNK = 200;
const syncKey = (userId: number) => `qb.statsSync.${userId}`;

function readMark(userId: number): number {
  try {
    const n = Number(localStorage.getItem(syncKey(userId)));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeMark(userId: number, at: number): void {
  try {
    localStorage.setItem(syncKey(userId), String(at));
  } catch {
    // Storage blocked: the next sync re-sends and the server dedupes.
  }
}

/** The fields the server keeps. Answer and question text never leave the device. */
function slim(e: AttemptEvent) {
  return {
    id: e.id,
    at: e.at,
    mode: e.mode,
    category: e.category,
    buzzWordIndex: e.buzzWordIndex,
    totalWords: e.totalWords,
    powerWordIndex: e.powerWordIndex,
    directive: e.directive,
    points: e.points,
  };
}

let syncing: Promise<number> | null = null;

/**
 * Uploads every event at or after the stored high-water mark. Returns how
 * many the server newly stored. Concurrent calls share one run.
 */
export function syncAttempts(userId: number): Promise<number> {
  if (syncing) return syncing;
  syncing = (async () => {
    const mark = readMark(userId);
    // `>=` so events sharing the mark's millisecond are re-sent, not skipped.
    const pending = (await all()).filter((e) => e.at >= mark);
    let inserted = 0;
    for (let i = 0; i < pending.length; i += SYNC_CHUNK) {
      const chunk = pending.slice(i, i + SYNC_CHUNK);
      const res = await fetch('/api/stats/attempts', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: chunk.map(slim) }),
      });
      if (!res.ok) throw new Error(await errorOf(res));
      inserted += Number(((await res.json()) as { inserted?: number }).inserted ?? 0);
      const last = chunk[chunk.length - 1];
      if (last) writeMark(userId, last.at);
    }
    if (inserted > 0) tagCache.delete(userId);
    return inserted;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

const SYNC_EVERY_MS = 60_000;

/** Keeps the signed-in user's server stats current: on sign-in, every minute, and when the tab is hidden. */
export function useStatsSync(userId: number | null | undefined): void {
  const run = useCallback(() => {
    if (!userId) return;
    void syncAttempts(userId).catch(() => {
      // Offline or signed out mid-flight; the next tick retries.
    });
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    run();
    const t = window.setInterval(run, SYNC_EVERY_MS);
    const onVis = () => {
      if (document.visibilityState === 'hidden') run();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [userId, run]);
}
