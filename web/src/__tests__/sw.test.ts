/**
 * Service worker routing, exercised against the real built `dist/sw.js`.
 *
 * The worker is an IIFE for the browser, so the test evaluates it inside a
 * hand-rolled fake of the bits of the SW global it touches. That is heavier
 * than unit-testing exported functions, but the thing worth protecting is the
 * routing decision itself: an API call that fails has to REJECT, because
 * `TossupQueue` reads a rejection as "go to the bundled pack". If it ever
 * started resolving with the cached HTML shell, offline practice would break
 * with no test failing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const SW = join(process.cwd(), 'dist/sw.js');

interface FetchHandler {
  (event: FakeFetchEvent): void;
}

interface FakeFetchEvent {
  request: FakeRequest;
  respondWith(r: Promise<Response> | Response): void;
}

interface FakeRequest {
  url: string;
  method: string;
  mode: string;
}

class FakeCache {
  readonly store = new Map<string, string>();
  async put(req: FakeRequest | string, res: { body: string }) {
    this.store.set(typeof req === 'string' ? req : req.url, res.body);
  }
  async add() {
    /* install path is not what this test covers */
  }
  async match(req: FakeRequest | string) {
    const key = typeof req === 'string' ? req : req.url;
    const body = this.store.get(key);
    return body === undefined ? undefined : { body, from: 'cache' };
  }
}

/** Loads dist/sw.js and returns its fetch handler plus the fake caches. */
function loadWorker(opts: { fetch: (req: FakeRequest) => Promise<unknown> }) {
  const handlers = new Map<string, FetchHandler>();
  const cache = new FakeCache();
  const sandbox = {
    self: {
      addEventListener: (t: string, fn: FetchHandler) => handlers.set(t, fn),
      location: { origin: 'https://app.example' },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
      match: async (r: FakeRequest | string) => cache.match(r),
    },
    fetch: opts.fetch,
    Request: class {
      url: string;
      constructor(url: string) {
        this.url = url;
      }
    },
    URL,
  };
  runInNewContext(readFileSync(SW, 'utf8'), sandbox);
  const onFetch = handlers.get('fetch');
  if (!onFetch) throw new Error('worker registered no fetch handler');
  return { onFetch, cache };
}

/** Drives one request through the handler. Resolves to null if unhandled. */
function route(
  onFetch: FetchHandler,
  req: Partial<FakeRequest> & { url: string },
): Promise<unknown> | null {
  let out: Promise<unknown> | null = null;
  onFetch({
    request: { method: 'GET', mode: 'no-cors', ...req },
    respondWith: (r) => {
      out = Promise.resolve(r);
    },
  });
  return out;
}

// The worker only exists after a build. Skipping beats failing on a clean
// checkout; `npm run build && npm test` is the run that proves these rules.
describe.skipIf(!existsSync(SW))('service worker', () => {
  it('precaches the shell, the manifest and every icon', () => {
    const code = readFileSync(SW, 'utf8');
    for (const path of [
      '/index.html',
      '/manifest.webmanifest',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon-maskable-512.png',
    ]) {
      expect(code).toContain(path);
    }
    // The build injects the hashed app bundle, which carries the bundled
    // offline question pack with it.
    expect(code).toMatch(/\/assets\/index-[\w-]+\.js/);
    expect(code).toMatch(/\/assets\/index-[\w-]+\.css/);
  });

  it('serves the shell cache-first, without touching the network', async () => {
    let hits = 0;
    const { onFetch, cache } = loadWorker({
      fetch: async () => {
        hits++;
        return { ok: true, type: 'basic', body: 'network', clone: () => ({ body: 'network' }) };
      },
    });
    await cache.put({ url: 'https://app.example/assets/app.js', method: 'GET', mode: 'no-cors' }, { body: 'cached' });
    const res = (await route(onFetch, { url: 'https://app.example/assets/app.js' })) as {
      body: string;
    };
    expect(res.body).toBe('cached');
    expect(hits).toBe(0);
  });

  it('is network-first for QB Reader and caches what it gets', async () => {
    const { onFetch, cache } = loadWorker({
      fetch: async () => ({
        ok: true,
        type: 'basic',
        body: 'fresh',
        clone: () => ({ body: 'fresh' }),
      }),
    });
    const url = 'https://www.qbreader.org/api/random-tossup?number=1';
    await cache.put({ url, method: 'GET', mode: 'no-cors' }, { body: 'stale' });
    const res = (await route(onFetch, { url })) as { body: string };
    expect(res.body).toBe('fresh');
    expect(cache.store.get(url)).toBe('fresh');
  });

  it('REJECTS a failed API call rather than serving the shell, so the bundled pack takes over', async () => {
    const { onFetch } = loadWorker({
      fetch: async () => {
        throw new TypeError('offline');
      },
    });
    const pending = route(onFetch, {
      url: 'https://www.qbreader.org/api/random-tossup?number=1',
    });
    await expect(pending).rejects.toThrow('offline');
  });

  it('falls back to a cached API response before rejecting', async () => {
    const { onFetch, cache } = loadWorker({
      fetch: async () => {
        throw new TypeError('offline');
      },
    });
    const url = 'https://www.qbreader.org/api/random-tossup?number=1';
    await cache.put({ url, method: 'GET', mode: 'no-cors' }, { body: 'yesterday' });
    const res = (await route(onFetch, { url })) as { body: string };
    expect(res.body).toBe('yesterday');
  });

  it('serves the fresh index on a navigation when the network is up', async () => {
    const { onFetch, cache } = loadWorker({
      fetch: async () => ({ ok: true, body: '<!doctype html><!-- fresh -->', clone() { return this; } }),
    });
    await cache.put('/index.html', { body: '<!doctype html><!-- stale -->' });
    const res = (await route(onFetch, {
      url: 'https://app.example/anything/deep',
      mode: 'navigate',
    })) as { body: string };
    expect(res.body).toBe('<!doctype html><!-- fresh -->');
  });

  it('falls back to the cached index when offline, SPA style', async () => {
    const { onFetch, cache } = loadWorker({
      fetch: async () => {
        throw new TypeError('offline');
      },
    });
    await cache.put('/index.html', { body: '<!doctype html>' });
    const res = (await route(onFetch, {
      url: 'https://app.example/anything/deep',
      mode: 'navigate',
    })) as { body: string };
    expect(res.body).toBe('<!doctype html>');
  });

  it('keeps its hands off POSTs, /api and other origins', async () => {
    const { onFetch } = loadWorker({ fetch: async () => ({ ok: true }) });
    expect(route(onFetch, { url: 'https://app.example/x', method: 'POST' })).toBe(null);
    expect(route(onFetch, { url: 'https://app.example/api/room/abc' })).toBe(null);
    expect(route(onFetch, { url: 'https://cdn.example/font.woff2' })).toBe(null);
  });
});
