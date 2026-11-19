/**
 * Client bindings for the shared packet store (`/api/packets`).
 *
 * The importer parses in the browser and POSTs the result here so other
 * devices see it. The OAC match screen and anything else that wants to
 * replay a packet lists the shared store and fetches one by id.
 */

import type { Bonus, OacPacket, Tossup } from './types';

export interface ServerPacketData {
  tossups?: Tossup[];
  bonuses?: Bonus[];
  oac?: OacPacket | null;
  /** The original import filename, preserved for user display. */
  filename?: string;
  /** Parser warnings carried over from the import. */
  warnings?: string[];
  kind?: 'standard' | 'oac';
}

export interface ServerPacketEntry {
  id: string;
  name: string;
  uploader_id: number | null;
  uploader_name: string;
  tossup_count: number;
  bonus_count: number;
  created_at: number;
}

export interface ServerPacket extends ServerPacketEntry {
  data: ServerPacketData;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body && typeof body.error === 'string' && body.error.length > 0) {
      return body.error;
    }
  } catch {
    // Non-JSON body; fall through.
  }
  return `request failed (${res.status})`;
}

export async function listServerPackets(): Promise<ServerPacketEntry[]> {
  const res = await fetch('/api/packets', { credentials: 'same-origin' });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { packets: ServerPacketEntry[] };
  return body.packets ?? [];
}

export async function fetchServerPacket(id: string): Promise<ServerPacket> {
  const res = await fetch(`/api/packets/${encodeURIComponent(id)}`, {
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { packet: ServerPacket };
  return body.packet;
}

export async function uploadServerPacket(
  name: string,
  data: ServerPacketData,
): Promise<string> {
  const res = await fetch('/api/packets', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, data }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { id: string };
  return body.id;
}

export async function deleteServerPacket(id: string): Promise<void> {
  const res = await fetch(`/api/packets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(await parseError(res));
}
