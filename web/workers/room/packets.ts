/**
 * Packet persistence endpoints.
 *
 * The importer parses in the browser (see src/import/). After a successful
 * parse the host POSTs the result here so other devices can replay it: packets
 * are shared across all users of the deployment. The admin dashboard lists
 * them from the same table.
 *
 * Shape mirrors auth/tournaments/admin: a PacketStore interface with a D1
 * implementation and an in-memory shim for tests.
 */

import {
  requireUser,
  type AuthStore,
  type RequestContext,
  type StoredUser,
} from './auth';

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

export interface PacketRow {
  id: string;
  uploaderId: number | null;
  name: string;
  /** Serialised JSON of the parsed packet. */
  data: string;
  createdAt: number;
  tossupCount: number;
  bonusCount: number;
}

export interface PacketListEntry {
  id: string;
  uploader_id: number | null;
  uploader_name: string;
  name: string;
  tossup_count: number;
  bonus_count: number;
  created_at: number;
}

/** Row shape for the list endpoint — `data` is omitted on purpose. */
export type PacketSummaryRow = Omit<PacketRow, 'data'>;

export interface PacketStore {
  insert(row: PacketRow): Promise<void>;
  /** Lists packets without the serialized body; one body is 10kb-1mb. */
  list(): Promise<PacketSummaryRow[]>;
  find(id: string): Promise<PacketRow | null>;
  delete(id: string): Promise<boolean>;
}

/** 1 MiB cap on a packet body, matching the brief. */
export const MAX_PACKET_BYTES = 1024 * 1024;
/** Cap on the uploader-provided packet name; enough for "2019 PACE NSC r12". */
export const PACKET_NAME_MAX = 200;

// ---------------------------------------------------------------------------
// D1 store
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowToPacket(row: Record<string, unknown>): PacketRow {
  return {
    id: String(row.id ?? ''),
    uploaderId: numOrNull(row.uploader_id),
    name: String(row.name ?? ''),
    data: String(row.data ?? ''),
    createdAt: num(row.created_at),
    tossupCount: num(row.tossup_count),
    bonusCount: num(row.bonus_count),
  };
}

export function d1PacketStore(db: D1Database): PacketStore {
  return {
    async insert(row) {
      await db
        .prepare(
          `INSERT INTO packets
             (id, uploader_id, name, data, created_at, tossup_count, bonus_count)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          row.id,
          row.uploaderId,
          row.name,
          row.data,
          row.createdAt,
          row.tossupCount,
          row.bonusCount,
        )
        .run();
    },
    async list() {
      // No `data` column: a listing of 500+ packets at ~40KB each would
      // otherwise balloon the Worker response past its memory cap.
      const res = await db
        .prepare(
          `SELECT id, uploader_id, name, created_at,
                  tossup_count, bonus_count
             FROM packets
             ORDER BY created_at DESC`,
        )
        .all<Record<string, unknown>>();
      return (res.results ?? []).map((row) => ({
        id: String(row.id ?? ''),
        uploaderId: numOrNull(row.uploader_id),
        name: String(row.name ?? ''),
        createdAt: num(row.created_at),
        tossupCount: num(row.tossup_count),
        bonusCount: num(row.bonus_count),
      }));
    },
    async find(id) {
      const row = await db
        .prepare(
          `SELECT id, uploader_id, name, data, created_at,
                  tossup_count, bonus_count
             FROM packets WHERE id = ?`,
        )
        .bind(id)
        .first<Record<string, unknown>>();
      return row ? rowToPacket(row) : null;
    },
    async delete(id) {
      const res = await db
        .prepare('DELETE FROM packets WHERE id = ?')
        .bind(id)
        .run();
      const changes =
        (res.meta as { changes?: number } | undefined)?.changes ?? -1;
      if (changes >= 0) return changes > 0;
      // Fall back to a read on older local wrangler drivers.
      return (await this.find(id)) === null;
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function newPacketId(now: number): string {
  // 8-byte random suffix is enough to make a collision implausible; prefixing
  // the millisecond timestamp keeps rows roughly ordered in indexes that use
  // id as a tiebreaker.
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  let hex = '';
  for (const b of buf) hex += b.toString(16).padStart(2, '0');
  return `${now.toString(36)}-${hex}`;
}

interface UploadBody {
  name?: unknown;
  data?: unknown;
}

function countTossups(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.tossups)) return obj.tossups.length;
  return 0;
}

function countBonuses(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.bonuses)) return obj.bonuses.length;
  return 0;
}

async function readUploadBody(request: Request): Promise<
  | { ok: true; body: UploadBody; raw: string }
  | { ok: false; status: number; error: string }
> {
  const raw = await request.text();
  if (raw.length > MAX_PACKET_BYTES) {
    return {
      ok: false,
      status: 413,
      error: `packet exceeds ${MAX_PACKET_BYTES} byte cap`,
    };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, status: 400, error: 'invalid body' };
    }
    return { ok: true, body: parsed as UploadBody, raw };
  } catch {
    return { ok: false, status: 400, error: 'invalid json' };
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

async function handleUpload(
  request: Request,
  authStore: AuthStore,
  packets: PacketStore,
  ctx: RequestContext,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);

  const read = await readUploadBody(request);
  if (!read.ok) return json({ error: read.error }, read.status);
  const { body } = read;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return json({ error: 'name is required' }, 400);
  if (name.length > PACKET_NAME_MAX) {
    return json(
      { error: `name cannot exceed ${PACKET_NAME_MAX} characters` },
      400,
    );
  }
  if (!body.data || typeof body.data !== 'object') {
    return json({ error: 'data must be an object' }, 400);
  }

  const dataJson = JSON.stringify(body.data);
  // Belt and braces: the raw body cap already bounds this, but a huge `name`
  // plus a huge `data` could in principle push the persisted blob past the
  // cap. Re-check the serialised data on its own.
  if (new Blob([dataJson]).size > MAX_PACKET_BYTES) {
    return json(
      { error: `packet data exceeds ${MAX_PACKET_BYTES} byte cap` },
      413,
    );
  }

  const id = newPacketId(ctx.now);
  await packets.insert({
    id,
    uploaderId: me.id,
    name,
    data: dataJson,
    createdAt: ctx.now,
    tossupCount: countTossups(body.data),
    bonusCount: countBonuses(body.data),
  });
  return json({ id });
}

async function handleList(
  request: Request,
  authStore: AuthStore,
  packets: PacketStore,
  ctx: RequestContext,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);

  const rows = await packets.list();
  const uploaderIds = new Set<number>();
  for (const r of rows) if (r.uploaderId != null) uploaderIds.add(r.uploaderId);
  const names = new Map<number, string>();
  for (const uid of uploaderIds) {
    const u = await authStore.findUserById(uid);
    if (u) names.set(uid, u.username);
  }
  const entries: PacketListEntry[] = rows.map((r) => ({
    id: r.id,
    uploader_id: r.uploaderId,
    uploader_name:
      r.uploaderId != null ? (names.get(r.uploaderId) ?? '') : '',
    name: r.name,
    tossup_count: r.tossupCount,
    bonus_count: r.bonusCount,
    created_at: r.createdAt,
  }));
  return json({ packets: entries });
}

async function handleGet(
  request: Request,
  authStore: AuthStore,
  packets: PacketStore,
  ctx: RequestContext,
  id: string,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);

  const row = await packets.find(id);
  if (!row) return json({ error: 'packet not found' }, 404);

  let data: unknown;
  try {
    data = JSON.parse(row.data);
  } catch {
    return json({ error: 'stored packet is malformed' }, 500);
  }
  const uploader = row.uploaderId != null
    ? await authStore.findUserById(row.uploaderId)
    : null;
  return json({
    packet: {
      id: row.id,
      uploader_id: row.uploaderId,
      uploader_name: uploader ? uploader.username : '',
      name: row.name,
      tossup_count: row.tossupCount,
      bonus_count: row.bonusCount,
      created_at: row.createdAt,
      data,
    },
  });
}

async function handleDelete(
  request: Request,
  authStore: AuthStore,
  packets: PacketStore,
  ctx: RequestContext,
  id: string,
): Promise<Response> {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json({ error: 'not signed in' }, 401);

  const row = await packets.find(id);
  if (!row) return json({ error: 'packet not found' }, 404);

  const isUploader = row.uploaderId === me.id;
  const isAdmin = me.role === 'admin';
  if (!isUploader && !isAdmin) {
    return json({ error: 'forbidden' }, 403);
  }
  await packets.delete(id);
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Admin-side (for /api/admin/packets family). Exposed separately so the admin
// router owns its own dispatch and permission check.
// ---------------------------------------------------------------------------

export async function listAdminPackets(
  packets: PacketStore,
  authStore: AuthStore,
): Promise<PacketListEntry[]> {
  const rows = await packets.list();
  const names = new Map<number, string>();
  for (const r of rows) {
    if (r.uploaderId == null || names.has(r.uploaderId)) continue;
    const u = await authStore.findUserById(r.uploaderId);
    if (u) names.set(r.uploaderId, u.username);
  }
  return rows.map((r) => ({
    id: r.id,
    uploader_id: r.uploaderId,
    uploader_name:
      r.uploaderId != null ? (names.get(r.uploaderId) ?? '') : '',
    name: r.name,
    tossup_count: r.tossupCount,
    bonus_count: r.bonusCount,
    created_at: r.createdAt,
  }));
}

export async function removeAdminPacket(
  packets: PacketStore,
  id: string,
): Promise<boolean> {
  const row = await packets.find(id);
  if (!row) return false;
  await packets.delete(id);
  return true;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Handle an /api/packets[/:id] request. Returns null when the path does not
 * match so the caller can fall through to other routers.
 */
export async function handlePackets(
  request: Request,
  authStore: AuthStore,
  packets: PacketStore,
  ctx: RequestContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/packets')) return null;

  if (path === '/api/packets') {
    if (request.method === 'GET') {
      return handleList(request, authStore, packets, ctx);
    }
    if (request.method === 'POST') {
      return handleUpload(request, authStore, packets, ctx);
    }
    return json({ error: 'method not allowed' }, 405);
  }

  const idMatch = /^\/api\/packets\/([^/]+)$/.exec(path);
  if (idMatch) {
    const id = decodeURIComponent(idMatch[1] ?? '');
    if (request.method === 'GET') {
      return handleGet(request, authStore, packets, ctx, id);
    }
    if (request.method === 'DELETE') {
      return handleDelete(request, authStore, packets, ctx, id);
    }
    return json({ error: 'method not allowed' }, 405);
  }

  return json({ error: 'not found' }, 404);
}

// Re-export for tests that construct a StoredUser directly.
export type { StoredUser };
