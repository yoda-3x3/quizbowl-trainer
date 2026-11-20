/**
 * Client for opening an H2H bracket match's room (workers/room/brackets.ts's
 * `/bracket/matches/:id/room`). The returned room code and side feed straight
 * into `useRoom` — the match plays through the exact same websocket engine as
 * an ordinary Rooms.tsx room, just with side-aware scoring.
 */

export interface OpenMatchRoomResult {
  room_code: string;
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

export async function openMatchRoom(
  tournamentId: number,
  matchId: number,
): Promise<OpenMatchRoomResult> {
  const res = await fetch(`/api/tournaments/${tournamentId}/bracket/matches/${matchId}/room`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as OpenMatchRoomResult;
}
