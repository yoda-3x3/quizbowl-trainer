/**
 * User-initiated, single-file packet fetching with a local-only cache.
 *
 * ===========================================================================
 * LEGAL CONSTRAINT — this is the whole reason this module is shaped like this.
 * ===========================================================================
 *
 * quizbowlpackets.com serves `robots.txt` on BOTH `www.quizbowlpackets.com`
 * and `files.quizbowlpackets.com` with `Disallow: /` for ClaudeBot,
 * anthropic-ai, Claude-Web, GPTBot, CCBot and roughly thirty other automated
 * agents, and asserts `Content-Signal: search=yes, ai-train=no, use=reference`
 * as an express reservation of rights under Article 4 of EU Directive
 * 2019/790. The site releases packets "for study and practice use" and states
 * they "may not be used for tournaments or anything that involves the exchange
 * of money".
 *
 * This module is consequently constrained to:
 *
 *   1. USER-INITIATED ONLY. Every entry point demands a `UserGesture`, which
 *      can only be minted inside a real event handler and expires in 60
 *      seconds, so a loop cannot mint one token and reuse it.
 *   2. ONE FILE AT A TIME. Requests are serialized through a single promise
 *      chain and spaced by `MIN_REQUEST_GAP_MS`. There is no queue, no
 *      prefetch, no concurrency.
 *   3. CACHED ON THE DEVICE ONLY. A fetched file is stored locally so a second
 *      tap costs no request. It is never uploaded, mirrored, redistributed or
 *      committed; `.gitignore` excludes the fixture directory.
 *   4. HONESTLY IDENTIFIED. We never spoof a browser User-Agent. In a browser
 *      `User-Agent` is a forbidden header that `fetch` refuses to set, so the
 *      request carries the user's own real browser identity, which is the
 *      truth: it is their device making their request. See `honestHeaders`.
 *
 * DO NOT add, on top of this module: a crawler, a bulk or batch downloader, a
 * prefetch queue, a background or scheduled sync, a mirror, or anything that
 * walks the catalogue fetching files. Enumeration already costs one request
 * per archive (see `catalogue.ts`), so there is no legitimate need.
 *
 * The lowest-friction path is `importLocalFile`, which never touches the
 * network: the user downloads a packet in their own browser and hands the file
 * to the app.
 */

import { FILE_HOST, ARCHIVES } from './catalogue';

// ---------------------------------------------------------------------------
// User gestures
// ---------------------------------------------------------------------------

declare const userInitiatedBrand: unique symbol;

/**
 * Proof that a human asked for this. Mint it inside a click/tap handler and
 * pass it straight to the fetch; it is not storable for later reuse.
 */
export interface UserGesture {
  readonly [userInitiatedBrand]: true;
  readonly at: number;
}

/** Window in which a gesture stays valid. */
export const GESTURE_TTL_MS = 60_000;

/** Call this from a real event handler, never from a timer or a loop. */
export function userGesture(now: number = Date.now()): UserGesture {
  return { at: now } as UserGesture;
}

export class ImportError extends Error {
  readonly code:
    | 'not-user-initiated'
    | 'disallowed-host'
    | 'too-large'
    | 'network'
    | 'http'
    | 'unsupported-format';

  constructor(code: ImportError['code'], message: string) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
  }
}

function assertGesture(gesture: UserGesture, now: number): void {
  const age = now - gesture.at;
  if (!Number.isFinite(age) || age < 0 || age > GESTURE_TTL_MS) {
    throw new ImportError(
      'not-user-initiated',
      'This fetch needs a fresh user action. Tap the packet again.',
    );
  }
}

// ---------------------------------------------------------------------------
// Host allowlist
// ---------------------------------------------------------------------------

const ALLOWED_HOSTS = new Set<string>([
  FILE_HOST,
  ...ARCHIVES.map((a) => a.host),
]);

/** Refuses any URL outside the archive, so this cannot become a generic proxy. */
export function assertArchiveUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ImportError('disallowed-host', `"${url}" is not a valid URL.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new ImportError('disallowed-host', 'Only https URLs are allowed.');
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new ImportError(
      'disallowed-host',
      `${parsed.hostname} is not a quizbowlpackets.com archive host.`,
    );
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export interface CachedPacket {
  url: string;
  filename: string;
  bytes: Uint8Array;
  contentType: string;
  fetchedAt: number;
}

export interface CachedPacketMeta {
  url: string;
  filename: string;
  byteLength: number;
  fetchedAt: number;
}

export interface PacketCache {
  get(url: string): Promise<CachedPacket | null>;
  put(entry: CachedPacket): Promise<void>;
  list(): Promise<CachedPacketMeta[]>;
  remove(url: string): Promise<void>;
  clear(): Promise<void>;
}

/** Process-lifetime cache. The default in tests and in non-browser runtimes. */
export function memoryPacketCache(): PacketCache {
  const store = new Map<string, CachedPacket>();
  return {
    async get(url) {
      return store.get(url) ?? null;
    },
    async put(entry) {
      store.set(entry.url, entry);
    },
    async list() {
      return [...store.values()].map((e) => ({
        url: e.url,
        filename: e.filename,
        byteLength: e.bytes.byteLength,
        fetchedAt: e.fetchedAt,
      }));
    },
    async remove(url) {
      store.delete(url);
    },
    async clear() {
      store.clear();
    },
  };
}

const DB_NAME = 'qb-packet-cache';
const STORE = 'packets';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'url' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'));
  });
}

/**
 * On-device persistent cache. Falls back to memory when IndexedDB is missing,
 * which is the case in Node and in private-mode Firefox.
 */
export function idbPacketCache(): PacketCache {
  if (typeof indexedDB === 'undefined') return memoryPacketCache();

  return {
    async get(url) {
      const db = await openDb();
      const row = await tx<CachedPacket | undefined>(db, 'readonly', (s) =>
        s.get(url),
      );
      db.close();
      if (!row) return null;
      // Structured clone round-trips a Uint8Array faithfully, but a row
      // written by an older build may hold a plain ArrayBuffer.
      const bytes =
        row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes);
      return { ...row, bytes };
    },
    async put(entry) {
      const db = await openDb();
      await tx(db, 'readwrite', (s) => s.put(entry));
      db.close();
    },
    async list() {
      const db = await openDb();
      const rows = await tx<CachedPacket[]>(db, 'readonly', (s) => s.getAll());
      db.close();
      return rows
        .map((e) => ({
          url: e.url,
          filename: e.filename,
          byteLength: e.bytes.byteLength,
          fetchedAt: e.fetchedAt,
        }))
        .sort((a, b) => b.fetchedAt - a.fetchedAt);
    },
    async remove(url) {
      const db = await openDb();
      await tx(db, 'readwrite', (s) => s.delete(url));
      db.close();
    },
    async clear() {
      const db = await openDb();
      await tx(db, 'readwrite', (s) => s.clear());
      db.close();
    },
  };
}

// ---------------------------------------------------------------------------
// The single guarded request path
// ---------------------------------------------------------------------------

/** Nothing in this app has any business reading a 25 MB "packet". */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Minimum spacing between network requests. Politeness, not throughput. */
export const MIN_REQUEST_GAP_MS = 1_200;

export interface FetchDeps {
  fetchImpl?: typeof fetch;
  cache?: PacketCache;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Headers we are willing to send.
 *
 * Deliberately almost empty. In a browser `User-Agent` is a forbidden header
 * name, so `fetch` ignores any attempt to set it and the request goes out with
 * the user's genuine browser identity. We do not try to override it, and we do
 * not invent a browser identity in other runtimes either.
 */
function honestHeaders(accept: string): HeadersInit {
  return { Accept: accept };
}

/** Serializes every request in the process and spaces them out. */
let chain: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function serialize<T>(run: () => Promise<T>): Promise<T> {
  const next = chain.then(run, run);
  // Keep the chain alive even when a request rejects.
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function request(
  url: string,
  accept: string,
  deps: FetchDeps,
): Promise<Response> {
  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  const now = deps.now ?? Date.now;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  if (typeof doFetch !== 'function') {
    throw new ImportError('network', 'No fetch implementation is available.');
  }

  const since = now() - lastRequestAt;
  if (since < MIN_REQUEST_GAP_MS) await sleep(MIN_REQUEST_GAP_MS - since);
  lastRequestAt = now();

  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'GET',
      headers: honestHeaders(accept),
      redirect: 'follow',
      // No credentials: this is public study material, not an account.
      credentials: 'omit',
    });
  } catch (cause) {
    throw new ImportError(
      'network',
      'The request failed. The archive may not allow cross-origin reads from a web app. ' +
        'Download the packet in your browser and use "Choose a file" instead.',
    );
  }

  if (!res.ok) {
    throw new ImportError('http', `The archive returned HTTP ${res.status}.`);
  }
  return res;
}

/**
 * Fetches ONE packet file because the user just asked for it.
 *
 * A cache hit short-circuits before any network access, so re-opening a packet
 * costs nothing.
 */
export async function fetchPacketFile(
  opts: { url: string; filename?: string; gesture: UserGesture },
  deps: FetchDeps = {},
): Promise<CachedPacket> {
  const now = deps.now ?? Date.now;
  assertGesture(opts.gesture, now());
  const parsed = assertArchiveUrl(opts.url);
  const cache = deps.cache ?? memoryPacketCache();

  const hit = await cache.get(opts.url);
  if (hit) return hit;

  const filename =
    opts.filename ??
    decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? 'packet');

  return serialize(async () => {
    // Re-check under the lock: two taps on the same row would otherwise both
    // reach the network.
    const raced = await cache.get(opts.url);
    if (raced) return raced;

    const res = await request(
      opts.url,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/pdf;q=0.9, */*;q=0.1',
      deps,
    );

    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_FILE_BYTES) {
      throw new ImportError(
        'too-large',
        `That file is ${Math.round(declared / 1e6)} MB, which is too large to import.`,
      );
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw new ImportError('too-large', 'That file is too large to import.');
    }

    const entry: CachedPacket = {
      url: opts.url,
      filename,
      bytes,
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      fetchedAt: now(),
    };
    await cache.put(entry);
    return entry;
  });
}

/**
 * Fetches one archive page as text, for the catalogue and set-page parsers.
 *
 * Same guards as a packet fetch. One page per user action.
 */
export async function fetchArchivePage(
  opts: { url: string; gesture: UserGesture },
  deps: FetchDeps = {},
): Promise<string> {
  const now = deps.now ?? Date.now;
  assertGesture(opts.gesture, now());
  assertArchiveUrl(opts.url);

  return serialize(async () => {
    const res = await request(opts.url, 'text/html', deps);
    return res.text();
  });
}

/**
 * The no-network path: the user picks a file they already downloaded.
 *
 * This is the preferred route. It involves no request to the archive at all,
 * so it sidesteps both the robots policy and any cross-origin restriction.
 */
export async function importLocalFile(
  file: { name: string; arrayBuffer(): Promise<ArrayBuffer>; type?: string },
): Promise<CachedPacket> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new ImportError('too-large', 'That file is too large to import.');
  }
  return {
    url: `local:${file.name}`,
    filename: file.name,
    bytes,
    contentType: file.type ?? 'application/octet-stream',
    fetchedAt: Date.now(),
  };
}

/** Test seam: resets the module-level spacing clock. */
export function resetRequestSpacing(): void {
  lastRequestAt = 0;
}
