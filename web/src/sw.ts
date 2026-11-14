/**
 * The service worker. Bundled to `dist/sw.js` by the `serviceWorker` plugin in
 * vite.config.ts, which injects PRECACHE with the hashed asset names.
 *
 * Two routing rules, and they are deliberately opposite:
 *
 * - The app shell is cache-first. It is versioned by content hash, so a cached
 *   copy is never stale: a new build means new filenames and a new cache.
 * - QB Reader API calls are network-first and NEVER fall back to the shell. A
 *   failed call has to surface as a rejected fetch, because `TossupQueue`
 *   catches that and drains the bundled offline pack instead. Answering an API
 *   request with an HTML error page would break that fallback.
 *
 * The bundled question pack itself needs no rule: it is a TypeScript module
 * compiled into the main JS chunk, so precaching the shell precaches it.
 */

/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

/** Replaced at build time with the list of files to precache. */
declare const PRECACHE: readonly string[];
/** Replaced at build time with a hash of the precache list. */
declare const CACHE_VERSION: string;

const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const API_HOST = 'www.qbreader.org';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // One miss (a renamed asset, a flaky CDN) should not fail the whole
      // install and leave the app with no worker at all.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch {
            /* precache miss: the runtime handler will pick it up */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, RUNTIME_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.map((n) => (keep.has(n) ? null : caches.delete(n))));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.hostname === API_HOST) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Never touch the room Worker or the live websocket. Checked after the QB
  // Reader rule on purpose: QB Reader's own paths also start with /api, and
  // this guard is only about the same-origin proxy.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api')) {
    return;
  }

  // Cross-origin anything else is left to the browser.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(shellDocument(req));
    return;
  }

  event.respondWith(cacheFirst(req));
});

/**
 * Network-first, with a cached copy as the consolation prize. If both fail the
 * rejection propagates, which is what makes the bundled-pack fallback work.
 */
async function networkFirst(req: Request): Promise<Response> {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    const hit = await caches.match(req);
    if (hit) return hit;
    throw err;
  }
}

/** Cache-first for hashed assets, icons and audio clips. */
async function cacheFirst(req: Request): Promise<Response> {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(req, res.clone());
  }
  return res;
}

/**
 * Every navigation resolves to the one HTML document. The app is an SPA with no
 * router, so there is nothing else a path could mean.
 */
async function shellDocument(req: Request): Promise<Response> {
  const cached = await caches.match('/index.html');
  if (cached) return cached;
  try {
    return await fetch(req);
  } catch {
    const shell = await caches.match('/');
    if (shell) return shell;
    throw new Error('offline and no cached shell');
  }
}

export {};
