/**
 * Pages Function: proxy every `/api/*` request to the Rooms Worker.
 *
 * Cloudflare Pages does not call a sibling Worker automatically. This
 * catch-all forwards the request verbatim (method, headers, body, and the
 * WebSocket upgrade intent) to the `quizbowl-rooms` Worker and returns the
 * response as-is.
 *
 * `WORKER_ORIGIN` is a Pages environment variable (e.g.
 * `https://quizbowl-rooms.<account>.workers.dev`). If it's missing, this
 * returns a 500 that names the fix so the front-end doesn't just see a blank
 * failure.
 *
 * WebSocket pass-through works because Cloudflare's `fetch` carries the
 * upgrade when the original `Request` is handed back to it; constructing a
 * new `Request` and manually copying headers drops it. So we clone the
 * request against a new URL and let the runtime handle the handshake.
 */

interface Env {
  WORKER_ORIGIN?: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const origin = env.WORKER_ORIGIN;
  if (!origin) {
    return new Response(
      'Pages Function misconfigured: set WORKER_ORIGIN in the Pages project.\n',
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, origin);

  // Rebuilding the Request with the new URL preserves the original body and
  // header set, including the `Upgrade: websocket` handshake. A naive
  // `new Response(fetch(url, { headers, body }))` loses the upgrade intent
  // and the Rooms websocket silently 400s.
  const upstream = new Request(target.toString(), request);

  return fetch(upstream);
};
