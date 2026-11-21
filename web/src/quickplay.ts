/**
 * Client for Quick Play matchmaking (workers/room/quickplay.ts). Like h2h.ts,
 * the returned room code + side feed straight into `useRoom` once a match is
 * found — the game itself plays through the exact same websocket engine as
 * an ordinary room, just with side-aware scoring and ELO reporting.
 */

export interface QuickPlayMatchPublic {
  id: number;
  kind: 'public' | 'private';
  rated: boolean;
  state: 'pending' | 'ready' | 'finished';
  regulation_tossups: number;
  room_code: string | null;
  side: 'a' | 'b' | null;
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

async function postJson<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}

export type JoinQueueResult =
  | { status: 'queued' }
  | { status: 'matched'; match: QuickPlayMatchPublic };

/** Joins the public matchmaking queue; pairs immediately if someone's waiting. */
export function joinQueue(): Promise<JoinQueueResult> {
  return postJson('/api/quickplay/queue');
}

export function leaveQueue(): Promise<{ ok: true }> {
  return postJson('/api/quickplay/queue/leave');
}

/**
 * Also resolves the caller's active match once they've been paired (whether
 * waiting in the public queue, or as a private game's host waiting for
 * someone to redeem the invite) — see quickplay.ts's getActiveMatchFor.
 */
export function queueStatus(): Promise<{ queued: boolean; match: QuickPlayMatchPublic | null }> {
  return getJson('/api/quickplay/queue/status');
}

export interface CreatePrivateResult {
  invite_code: string;
  match: QuickPlayMatchPublic;
}

/** Creates a private (unrated) game and returns its invite code. */
export function createPrivateGame(): Promise<CreatePrivateResult> {
  return postJson('/api/quickplay/private');
}

/** Redeems a private game's invite code, opening the match room. */
export function joinPrivateGame(code: string): Promise<{ match: QuickPlayMatchPublic }> {
  return postJson(`/api/quickplay/private/${encodeURIComponent(code.trim().toUpperCase())}/join`);
}

export function getMatch(id: number): Promise<{ match: QuickPlayMatchPublic }> {
  return getJson(`/api/quickplay/matches/${id}`);
}
