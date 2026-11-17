/**
 * Client store for the admin endpoints.
 *
 * Parallels `tournaments.ts`: a flat set of fetch helpers, one hook per
 * resource that owns the "currently loading / failed / here is the data"
 * state, and mutation functions a screen calls after approving an action.
 *
 * The shapes here mirror `workers/room/admin.ts`. Every endpoint is admin-only
 * on the server; this module keeps no secret of its own and simply reports
 * what the server said.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthRole } from './auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProtestState = 'pending' | 'accepted' | 'rejected';
export type ProtestFilter = ProtestState | 'all';
export type ProtestDecision = 'accepted' | 'rejected';

export interface AdminUser {
  id: number;
  username: string;
  role: AuthRole;
  created_at: number;
  banned_at: number | null;
}

export interface AdminUserList {
  users: AdminUser[];
  page: number;
  pageCount: number;
  total: number;
}

export interface AdminRoom {
  code: string;
  started_at: number | null;
  player_count: number;
}

export interface AdminRoomList {
  rooms: AdminRoom[];
  note?: string;
}

export interface AdminPacket {
  id: string;
  name: string;
  tossup_count: number;
  bonus_count: number;
  imported_at: number;
}

export interface AdminPacketList {
  packets: AdminPacket[];
  note?: string;
}

export interface AdminProtest {
  id: number;
  tournament_id: number;
  tournament_name: string;
  question_id: string;
  raised_by: number;
  raised_by_username: string;
  reason: string;
  given_answer: string;
  state: ProtestState;
  created_at: number;
  resolved_by: number | null;
  resolved_at: number | null;
  resolved_note: string | null;
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
    // Non-JSON body; fall through.
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
// Direct actions
// ---------------------------------------------------------------------------

export interface ListUsersOpts {
  q?: string;
  page?: number;
  limit?: number;
}

export async function listAdminUsers(opts: ListUsersOpts = {}): Promise<AdminUserList> {
  const params = new URLSearchParams();
  if (opts.q && opts.q.length > 0) params.set('q', opts.q);
  if (opts.page !== undefined) params.set('page', String(opts.page));
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  const qs = params.toString();
  const path = `/api/admin/users${qs ? `?${qs}` : ''}`;
  return getJson<AdminUserList>(path);
}

export async function setUserRole(
  userId: number,
  role: AuthRole,
): Promise<AdminUser> {
  const body = await postJson<{ user: AdminUser }>(
    `/api/admin/users/${userId}/role`,
    { role },
  );
  return body.user;
}

export async function banUser(userId: number): Promise<AdminUser> {
  const body = await postJson<{ user: AdminUser }>(
    `/api/admin/users/${userId}/ban`,
    {},
  );
  return body.user;
}

export async function unbanUser(userId: number): Promise<AdminUser> {
  const body = await postJson<{ user: AdminUser }>(
    `/api/admin/users/${userId}/unban`,
    {},
  );
  return body.user;
}

export async function listAdminRooms(): Promise<AdminRoomList> {
  return getJson<AdminRoomList>('/api/admin/rooms');
}

export async function closeAdminRoom(code: string): Promise<void> {
  await postJson<unknown>(`/api/admin/rooms/${encodeURIComponent(code)}/close`, {});
}

export async function listAdminPackets(): Promise<AdminPacketList> {
  return getJson<AdminPacketList>('/api/admin/packets');
}

export async function removeAdminPacket(id: string): Promise<void> {
  await postJson<unknown>(
    `/api/admin/packets/${encodeURIComponent(id)}/remove`,
    {},
  );
}

export async function listAdminProtests(
  state: ProtestFilter = 'pending',
): Promise<AdminProtest[]> {
  const body = await getJson<{ protests: AdminProtest[] }>(
    `/api/admin/protests?state=${state}`,
  );
  return body.protests ?? [];
}

export async function resolveAdminProtest(
  id: number,
  decision: ProtestDecision,
  note?: string,
): Promise<AdminProtest> {
  const body = await postJson<{ protest: AdminProtest }>(
    `/api/admin/protests/${id}/resolve`,
    { decision, note },
  );
  return body.protest;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

interface LoadableHandle<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
}

export interface AdminUsersHandle extends LoadableHandle<AdminUserList> {
  query: string;
  page: number;
  limit: number;
  setQuery(q: string): void;
  setPage(p: number): void;
}

/**
 * Fetch the admin user list. Query and page can be driven from the screen;
 * each change triggers a refetch.
 */
export function useAdminUsers(initialLimit: number = 25): AdminUsersHandle {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminUserList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = initialLimit;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const body = await listAdminUsers({ q: query, page, limit });
      setData(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, [query, page, limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      data,
      loading,
      error,
      refresh,
      query,
      page,
      limit,
      setQuery: (q: string) => {
        setQuery(q);
        setPage(1);
      },
      setPage,
    }),
    [data, loading, error, refresh, query, page, limit],
  );
}

export function useAdminRooms(): LoadableHandle<AdminRoomList> {
  const [data, setData] = useState<AdminRoomList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listAdminRooms());
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

  return { data, loading, error, refresh };
}

export function useAdminPackets(): LoadableHandle<AdminPacketList> {
  const [data, setData] = useState<AdminPacketList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listAdminPackets());
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

  return { data, loading, error, refresh };
}

export interface AdminProtestsHandle extends LoadableHandle<AdminProtest[]> {
  filter: ProtestFilter;
  setFilter(f: ProtestFilter): void;
}

export function useAdminProtests(
  initialFilter: ProtestFilter = 'pending',
): AdminProtestsHandle {
  const [filter, setFilter] = useState<ProtestFilter>(initialFilter);
  const [data, setData] = useState<AdminProtest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listAdminProtests(filter));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh, filter, setFilter };
}
