/**
 * The attempt event log. OWNED FILE.
 *
 * Append-only. This is the single source of truth for every statistic in the
 * app; nothing persists pre-computed counters.
 *
 * The legacy Python app stored 14 flat counters, which made missed-question
 * review, per-category weakness and buzz-point distributions impossible to
 * build after the fact. An event log makes all of them derivable, and the cost
 * is a few hundred KB for a year of heavy practice.
 *
 * IndexedDB with an in-memory fallback: the accessor throws in private mode and
 * when site data is blocked, and a trainer that loses the current session
 * because storage was unavailable is worse than one that keeps it in RAM.
 */

import type { AttemptEvent } from '../types';

const DB_NAME = 'quizbowl-trainer';
const DB_VERSION = 1;
const STORE = 'attempts';

let memoryFallback: AttemptEvent[] = [];
let usingFallback = false;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
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
        store.createIndex('subcategory', 'subcategory');
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
  fn: (store: IDBObjectStore) => IDBRequest<T>,
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

/** True when storage was unavailable and events live only in memory. */
export function isEphemeral(): boolean {
  return usingFallback;
}

export async function append(e: AttemptEvent): Promise<void> {
  try {
    await tx('readwrite', (store) => store.put(e) as IDBRequest<IDBValidKey>);
  } catch {
    usingFallback = true;
    memoryFallback.push(e);
  }
}

export async function all(): Promise<AttemptEvent[]> {
  try {
    const rows = await tx<AttemptEvent[]>(
      'readonly',
      (store) => store.getAll() as IDBRequest<AttemptEvent[]>,
    );
    // Oldest first, so trend calculations can walk forward.
    return rows.sort((a, b) => a.at - b.at);
  } catch {
    usingFallback = true;
    return [...memoryFallback].sort((a, b) => a.at - b.at);
  }
}

export async function clear(): Promise<void> {
  memoryFallback = [];
  try {
    await tx('readwrite', (store) => store.clear() as IDBRequest<undefined>);
  } catch {
    // Memory already cleared above.
  }
}

/** Test seam: lets unit tests drive the derivations without a browser. */
export function __setMemoryLog(events: AttemptEvent[]): void {
  memoryFallback = [...events];
  usingFallback = true;
  dbPromise = null;
}
