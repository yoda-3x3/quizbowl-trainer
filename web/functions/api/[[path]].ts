/**
 * Pages Function: proxy every `/api/*` request to the Rooms Worker.
 *
 * Cloudflare Pages does not call a sibling Worker automatically. This
 * catch-all route forwards the request verbatim (method, headers, body) to
 * the deployed `quizbowl-rooms` Worker and returns its response.
 *
 * `WORKER_ORIGIN` is set in the Pages project settings (e.g.
 * `https://quizbowl-rooms.<account>.workers.dev`). Falls back to a
 * placeholder in dev so the error is obvious.
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

  // Preserve method, headers, and body. Cookie must carry through so the
  // Worker can resolve the session.
  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
    body:
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : request.body,
    redirect: 'manual',
  };

  const upstream = await fetch(target.toString(), init);

  // Return a new Response so Pages doesn't try to reuse the upstream body
  // in a way that hits "Body is unusable" edge cases.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
};
