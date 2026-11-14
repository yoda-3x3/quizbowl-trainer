import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GESTURE_TTL_MS,
  ImportError,
  MAX_FILE_BYTES,
  assertArchiveUrl,
  fetchArchivePage,
  fetchPacketFile,
  importLocalFile,
  memoryPacketCache,
  resetRequestSpacing,
  userGesture,
} from '../fetchPacket';

const NOW = 1_700_000_000_000;
const URL_OK = 'https://files.quizbowlpackets.com/2316/Round%2001.docx';

/** Frozen clock and a no-op sleep, so the politeness delay costs no wall time. */
const deps = (fetchImpl: typeof fetch, cache = memoryPacketCache()) => ({
  fetchImpl,
  cache,
  now: () => NOW,
  sleep: async () => {},
});

function response(
  body: Uint8Array | string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(body as BodyInit, {
    status: init.status ?? 200,
    headers: init.headers ?? {},
  });
}

beforeEach(() => {
  resetRequestSpacing();
});

describe('host allowlist', () => {
  it('accepts the archive hosts', () => {
    expect(assertArchiveUrl(URL_OK).hostname).toBe('files.quizbowlpackets.com');
    expect(
      assertArchiveUrl('https://www.quizbowlpackets.com/1591/').hostname,
    ).toBe('www.quizbowlpackets.com');
  });

  it('refuses any other host, so this cannot become a generic proxy', () => {
    expect(() => assertArchiveUrl('https://example.com/a.pdf')).toThrow(
      /not a quizbowlpackets/,
    );
  });

  it('refuses plain http', () => {
    expect(() =>
      assertArchiveUrl('http://files.quizbowlpackets.com/1/a.pdf'),
    ).toThrow(/https/);
  });

  it('refuses a malformed url', () => {
    expect(() => assertArchiveUrl('not a url')).toThrow(ImportError);
  });
});

describe('user-initiated requirement', () => {
  it('fetches when the gesture is fresh', async () => {
    const fetchImpl = vi.fn(async () => response(new Uint8Array([1, 2, 3])));
    const out = await fetchPacketFile(
      { url: URL_OK, gesture: userGesture(NOW) },
      deps(fetchImpl as unknown as typeof fetch),
    );
    expect(out.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  /**
   * The gesture expiring is what stops a loop minting one token and reusing it
   * to walk the archive.
   */
  it('refuses a stale gesture', async () => {
    const fetchImpl = vi.fn(async () => response(new Uint8Array([1])));
    await expect(
      fetchPacketFile(
        { url: URL_OK, gesture: userGesture(NOW - GESTURE_TTL_MS - 1) },
        deps(fetchImpl as unknown as typeof fetch),
      ),
    ).rejects.toThrow(/fresh user action/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a gesture from the future', async () => {
    const fetchImpl = vi.fn(async () => response(new Uint8Array([1])));
    await expect(
      fetchPacketFile(
        { url: URL_OK, gesture: userGesture(NOW + 5_000) },
        deps(fetchImpl as unknown as typeof fetch),
      ),
    ).rejects.toThrow(ImportError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('honest identification', () => {
  /**
   * In a browser `User-Agent` is a forbidden header, so the request carries the
   * user's real browser identity. We must never try to set one either way.
   */
  it('sends no User-Agent of its own', async () => {
    let seen: HeadersInit | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seen = init?.headers;
      return response(new Uint8Array([1]));
    });
    await fetchPacketFile(
      { url: URL_OK, gesture: userGesture(NOW) },
      deps(fetchImpl as unknown as typeof fetch),
    );
    const keys = Object.keys((seen ?? {}) as Record<string, string>).map((k) =>
      k.toLowerCase(),
    );
    expect(keys).toEqual(['accept']);
    expect(keys).not.toContain('user-agent');
  });

  it('sends no credentials', async () => {
    let init: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_url: string, i?: RequestInit) => {
      init = i;
      return response(new Uint8Array([1]));
    });
    await fetchPacketFile(
      { url: URL_OK, gesture: userGesture(NOW) },
      deps(fetchImpl as unknown as typeof fetch),
    );
    expect(init?.credentials).toBe('omit');
  });
});

describe('caching', () => {
  it('serves a second request from the cache without touching the network', async () => {
    const cache = memoryPacketCache();
    const fetchImpl = vi.fn(async () => response(new Uint8Array([9])));
    const d = deps(fetchImpl as unknown as typeof fetch, cache);

    await fetchPacketFile({ url: URL_OK, gesture: userGesture(NOW) }, d);
    await fetchPacketFile({ url: URL_OK, gesture: userGesture(NOW) }, d);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('collapses two concurrent requests for the same file into one', async () => {
    const cache = memoryPacketCache();
    const fetchImpl = vi.fn(async () => response(new Uint8Array([9])));
    const d = deps(fetchImpl as unknown as typeof fetch, cache);

    await Promise.all([
      fetchPacketFile({ url: URL_OK, gesture: userGesture(NOW) }, d),
      fetchPacketFile({ url: URL_OK, gesture: userGesture(NOW) }, d),
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('records the filename and fetch time', async () => {
    const cache = memoryPacketCache();
    const fetchImpl = vi.fn(async () => response(new Uint8Array([9])));
    const out = await fetchPacketFile(
      { url: URL_OK, gesture: userGesture(NOW) },
      deps(fetchImpl as unknown as typeof fetch, cache),
    );
    expect(out.filename).toBe('Round 01.docx');
    expect(out.fetchedAt).toBe(NOW);

    const listed = await cache.list();
    expect(listed).toEqual([
      { url: URL_OK, filename: 'Round 01.docx', byteLength: 1, fetchedAt: NOW },
    ]);
  });

  it('can forget one entry and clear the lot', async () => {
    const cache = memoryPacketCache();
    const fetchImpl = vi.fn(async () => response(new Uint8Array([9])));
    const d = deps(fetchImpl as unknown as typeof fetch, cache);

    await fetchPacketFile({ url: URL_OK, gesture: userGesture(NOW) }, d);
    await cache.remove(URL_OK);
    expect(await cache.list()).toEqual([]);

    await fetchPacketFile({ url: URL_OK, gesture: userGesture(NOW) }, d);
    await cache.clear();
    expect(await cache.list()).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('failure handling', () => {
  it('refuses a file larger than the cap before downloading it', async () => {
    const fetchImpl = vi.fn(async () =>
      response(new Uint8Array([1]), {
        headers: { 'content-length': String(MAX_FILE_BYTES + 1) },
      }),
    );
    await expect(
      fetchPacketFile(
        { url: URL_OK, gesture: userGesture(NOW) },
        deps(fetchImpl as unknown as typeof fetch),
      ),
    ).rejects.toThrow(/too large/);
  });

  it('reports the HTTP status', async () => {
    const fetchImpl = vi.fn(async () => response('nope', { status: 404 }));
    await expect(
      fetchPacketFile(
        { url: URL_OK, gesture: userGesture(NOW) },
        deps(fetchImpl as unknown as typeof fetch),
      ),
    ).rejects.toThrow(/HTTP 404/);
  });

  /**
   * A cross-origin read of the archive from a web app may well be blocked.
   * The error has to point the user at the local-file route rather than just
   * saying "failed".
   */
  it('points at the file picker when the request cannot be made', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(
      fetchPacketFile(
        { url: URL_OK, gesture: userGesture(NOW) },
        deps(fetchImpl as unknown as typeof fetch),
      ),
    ).rejects.toThrow(/Choose a file/);
  });

  it('does not cache a failure', async () => {
    const cache = memoryPacketCache();
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(response(new Uint8Array([4])));
    const d = deps(fetchImpl as unknown as typeof fetch, cache);

    await expect(
      fetchPacketFile({ url: URL_OK, gesture: userGesture(NOW) }, d),
    ).rejects.toThrow();
    const out = await fetchPacketFile(
      { url: URL_OK, gesture: userGesture(NOW) },
      d,
    );
    expect(out.bytes).toEqual(new Uint8Array([4]));
  });
});

describe('fetchArchivePage', () => {
  it('returns the page text for the catalogue parser', async () => {
    const fetchImpl = vi.fn(async () => response('<html>catalogue</html>'));
    const out = await fetchArchivePage(
      {
        url: 'https://www.quizbowlpackets.com/1591/',
        gesture: userGesture(NOW),
      },
      deps(fetchImpl as unknown as typeof fetch),
    );
    expect(out).toBe('<html>catalogue</html>');
  });

  it('is subject to the same gesture rule', async () => {
    const fetchImpl = vi.fn(async () => response('x'));
    await expect(
      fetchArchivePage(
        {
          url: 'https://www.quizbowlpackets.com/1591/',
          gesture: userGesture(NOW - GESTURE_TTL_MS - 1),
        },
        deps(fetchImpl as unknown as typeof fetch),
      ),
    ).rejects.toThrow(ImportError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('importLocalFile', () => {
  /** The preferred route: no request to the archive at all. */
  it('reads a file the user picked without any network access', async () => {
    const data = new TextEncoder().encode('packet bytes');
    const out = await importLocalFile({
      name: 'Round 01.docx',
      type: 'application/octet-stream',
      arrayBuffer: async () => data.buffer as ArrayBuffer,
    });
    expect(out.filename).toBe('Round 01.docx');
    expect(new TextDecoder().decode(out.bytes)).toBe('packet bytes');
    expect(out.url).toBe('local:Round 01.docx');
  });

  it('still enforces the size cap', async () => {
    await expect(
      importLocalFile({
        name: 'huge.pdf',
        arrayBuffer: async () => new ArrayBuffer(MAX_FILE_BYTES + 1),
      }),
    ).rejects.toThrow(/too large/);
  });
});
