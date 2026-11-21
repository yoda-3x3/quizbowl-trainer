/**
 * IndexedDB store for questions a player starred to come back to later.
 *
 * Deliberately a separate, unbounded store from `cache.ts`: that cache is an
 * opportunistic LRU of whatever was fetched and prunes itself at
 * `CACHE_LIMIT`, which is correct for incidental data but wrong for a list
 * the player put together on purpose — nothing here is ever pruned behind
 * their back. A separate database, for the same reason `cache.ts` keeps its
 * own database apart from the attempt log: different failure/lifecycle
 * semantics shouldn't share an upgrade transaction.
 *
 * Every accessor is wrapped the same way as `cache.ts`: `indexedDB` throws in
 * private mode and when site data is blocked, and losing this store must
 * never stop practice. Storage being unavailable falls back to an in-memory
 * copy so the current session still benefits, even though it won't persist.
 */

import type { Tossup } from '../types';

const DB_NAME = 'quizbowl-starred';
const DB_VERSION = 1;
const STORE = 'questions';

interface Row {
  id: string;
  /** epoch ms the question was starred, for a stable most-recent-first order. */
  at: number;
  data: Tossup;
}

let usingFallback = false;
let dbPromise: Promise<IDBDatabase> | null = null;
const memory = new Map<string, Row>();

/** True when storage was unavailable and starred questions live only in memory. */
export function isStarredEphemeral(): boolean {
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
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('at', 'at');
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
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = fn(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

/** Stars a question, or refreshes its starred-at time if already starred. */
export async function star(question: Tossup): Promise<void> {
  const at = Date.now();
  try {
    await tx('readwrite', (s) =>
      s.put({ id: question.id, at, data: question } satisfies Row) as IDBRequest<
        IDBValidKey
      >,
    );
  } catch {
    usingFallback = true;
    memory.set(question.id, { id: question.id, at, data: question });
  }
}

export async function unstar(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
  } catch {
    usingFallback = true;
  }
  memory.delete(id);
}

/** O(1)-ish lookup for a single question, used to render the star toggle. */
export async function isStarred(id: string): Promise<boolean> {
  try {
    const row = await tx<Row | undefined>(
      'readonly',
      (s) => s.get(id) as IDBRequest<Row | undefined>,
    );
    return row !== undefined;
  } catch {
    usingFallback = true;
    return memory.has(id);
  }
}

/** Every starred question, most recently starred first. */
export async function listStarred(): Promise<Tossup[]> {
  try {
    const rows = await tx<Row[]>(
      'readonly',
      (s) => s.getAll() as IDBRequest<Row[]>,
    );
    return rows
      .filter((r) => r && r.data)
      .sort((a, b) => b.at - a.at)
      .map((r) => r.data);
  } catch {
    usingFallback = true;
    return Array.from(memory.values())
      .sort((a, b) => b.at - a.at)
      .map((r) => r.data);
  }
}

export async function starredCount(): Promise<number> {
  try {
    const rows = await tx<Row[]>(
      'readonly',
      (s) => s.getAll() as IDBRequest<Row[]>,
    );
    return rows.length;
  } catch {
    usingFallback = true;
    return memory.size;
  }
}

/** Test seam: resets module state between cases. */
export function __resetStarred(): void {
  memory.clear();
  usingFallback = false;
  dbPromise = null;
}
