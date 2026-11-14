/**
 * IndexedDB cache for fetched questions.
 *
 * `qbreader.ts` already falls back to the bundled offline pack when the network
 * is down, but it never keeps the questions it fetched, so a player who has
 * drilled a thousand tossups on wifi still drops back to the same 40 bundled
 * ones on a bus. This store keeps what was fetched so the offline pool grows
 * with use, and it is the only offline source for bonuses, which have no
 * bundled pack at all.
 *
 * Deliberately a separate database from the attempt log: the log owns
 * `quizbowl-trainer` v1 and bumping its version from here would race its
 * upgrade transaction. A cache miss is also harmless, which the log's rows are
 * not, so the two want different failure handling.
 *
 * Every accessor is wrapped: `indexedDB` throws in private mode and when site
 * data is blocked, and losing the cache must never stop practice. When storage
 * is unavailable we keep a bounded in-memory copy instead so the current
 * session still benefits.
 */

import type { Bonus, Tossup } from '../types';

const DB_NAME = 'quizbowl-cache';
const DB_VERSION = 1;
const TOSSUPS = 'tossups';
const BONUSES = 'bonuses';

/** Per-store ceiling. Oldest rows are pruned first. */
export const CACHE_LIMIT = 600;

type Kind = typeof TOSSUPS | typeof BONUSES;

interface Row<T> {
  id: string;
  /** epoch ms the row was written, used for pruning and freshness display. */
  at: number;
  data: T;
}

let usingFallback = false;
let dbPromise: Promise<IDBDatabase> | null = null;

const memory: { tossups: Row<Tossup>[]; bonuses: Row<Bonus>[] } = {
  tossups: [],
  bonuses: [],
};

/** True when storage was unavailable and the cache lives only in memory. */
export function isCacheEphemeral(): boolean {
  return usingFallback;
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'));
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [TOSSUPS, BONUSES]) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'id' });
          store.createIndex('at', 'at');
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
    req.onblocked = () => reject(new Error('indexedDB blocked'));
  }).catch((err) => {
    usingFallback = true;
    dbPromise = null;
    throw err;
  }) as Promise<IDBDatabase>;

  return dbPromise;
}

function tx<T>(
  store: Kind,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = fn(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

// The two buckets hold different payloads, so callers re-narrow. Going via
// unknown keeps that honest rather than pretending one array is the other.
function memoryBucket<T>(store: Kind): Row<T>[] {
  return (store === TOSSUPS ? memory.tossups : memory.bonuses) as unknown as Row<T>[];
}

function putMemory<T extends { id: string }>(store: Kind, items: T[]): void {
  const bucket = memoryBucket<T>(store);
  const at = Date.now();
  for (const item of items) {
    const existing = bucket.findIndex((r) => r.id === item.id);
    const row: Row<T> = { id: item.id, at, data: item };
    if (existing >= 0) bucket[existing] = row;
    else bucket.push(row);
  }
  bucket.sort((a, b) => a.at - b.at);
  if (bucket.length > CACHE_LIMIT) bucket.splice(0, bucket.length - CACHE_LIMIT);
}

async function put<T extends { id: string }>(
  store: Kind,
  items: T[],
): Promise<void> {
  if (items.length === 0) return;
  const at = Date.now();
  try {
    await Promise.all(
      items.map((item) =>
        tx(store, 'readwrite', (s) =>
          s.put({ id: item.id, at, data: item } satisfies Row<T>) as IDBRequest<
            IDBValidKey
          >,
        ),
      ),
    );
    await prune(store);
  } catch {
    usingFallback = true;
    putMemory(store, items);
  }
}

async function readAll<T>(store: Kind): Promise<T[]> {
  try {
    const rows = await tx<Row<T>[]>(
      store,
      'readonly',
      (s) => s.getAll() as IDBRequest<Row<T>[]>,
    );
    // Newest first: a player is likeliest to want what they just played with.
    return rows
      .filter((r) => r && r.data)
      .sort((a, b) => b.at - a.at)
      .map((r) => r.data);
  } catch {
    usingFallback = true;
    return memoryBucket<T>(store)
      .slice()
      .sort((a, b) => b.at - a.at)
      .map((r) => r.data);
  }
}

/** Drops the oldest rows once a store passes CACHE_LIMIT. */
async function prune(store: Kind): Promise<void> {
  try {
    const keys = await tx<Row<unknown>[]>(
      store,
      'readonly',
      (s) => s.getAll() as IDBRequest<Row<unknown>[]>,
    );
    if (keys.length <= CACHE_LIMIT) return;
    const doomed = keys
      .sort((a, b) => a.at - b.at)
      .slice(0, keys.length - CACHE_LIMIT);
    await Promise.all(
      doomed.map((row) =>
        tx(store, 'readwrite', (s) => s.delete(row.id) as IDBRequest<undefined>),
      ),
    );
  } catch {
    // Pruning is housekeeping; a failure must not surface to the player.
  }
}

export function cacheTossups(items: Tossup[]): Promise<void> {
  return put(TOSSUPS, items);
}

export function cacheBonuses(items: Bonus[]): Promise<void> {
  return put(BONUSES, items);
}

export function cachedTossups(): Promise<Tossup[]> {
  return readAll<Tossup>(TOSSUPS);
}

export function cachedBonuses(): Promise<Bonus[]> {
  return readAll<Bonus>(BONUSES);
}

export interface CacheCounts {
  tossups: number;
  bonuses: number;
}

export async function cacheCounts(): Promise<CacheCounts> {
  const [t, b] = await Promise.all([cachedTossups(), cachedBonuses()]);
  return { tossups: t.length, bonuses: b.length };
}

export async function clearCache(): Promise<void> {
  memory.tossups = [];
  memory.bonuses = [];
  for (const store of [TOSSUPS, BONUSES] as Kind[]) {
    try {
      await tx(store, 'readwrite', (s) => s.clear() as IDBRequest<undefined>);
    } catch {
      // Memory copy is already gone.
    }
  }
}

/**
 * Picks the first cached question whose id is not in `seen`, or the oldest one
 * if every cached question has been played. Used as the last resort when the
 * network is down and the bundled pack is exhausted.
 */
export function pickUnseen<T extends { id: string }>(
  items: T[],
  seen: Set<string>,
): T | null {
  for (const item of items) {
    if (!seen.has(item.id)) return item;
  }
  return items.length > 0 ? (items[items.length - 1] ?? null) : null;
}

/** Test seam: resets module state between cases. */
export function __resetCache(): void {
  memory.tossups = [];
  memory.bonuses = [];
  usingFallback = false;
  dbPromise = null;
}
