/**
 * Worker entry for multiplayer rooms. OWNED FILE.
 *
 * Routes:
 *   POST /api/room                 -> { code }   create a room
 *   GET  /api/room/:code/ws        -> websocket upgrade
 *   GET  /api/room/:code/state     -> snapshot, for debugging
 *   POST /api/auth/signup          -> create an account + session cookie
 *   POST /api/auth/signin          -> session cookie for an existing account
 *   POST /api/auth/signout         -> delete the session + clear the cookie
 *   GET  /api/auth/me              -> the signed-in user, or 401
 *
 * A room code maps to a Durable Object by name, so every client using the same
 * code reaches the same instance no matter which edge location they hit.
 */

import { Room, type Env as RoomEnv } from './room';
import { makeRoomCode } from './protocol';
import { d1Store, handleAuth, type RequestContext } from './auth';

export { Room };

/** The full Worker env: the Durable Object plus the D1 database. */
export interface Env extends RoomEnv {
  DB: D1Database;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

interface CfRequest extends Request {
  cf?: { colo?: string } & Record<string, unknown>;
}

function contextFrom(request: Request): RequestContext {
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '0.0.0.0';
  const colo = (request as CfRequest).cf?.colo ?? 'local';
  return { ip: ip.toLowerCase(), colo, now: Date.now() };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Auth endpoints. Same-origin because Pages proxies /api to this Worker.
    if (url.pathname.startsWith('/api/auth/')) {
      const response = await handleAuth(request, d1Store(env.DB), contextFrom(request));
      if (response) return response;
    }

    // Create a room. The code is generated server-side so two clients cannot
    // race onto the same one by choosing it themselves.
    if (request.method === 'POST' && url.pathname === '/api/room') {
      const code = makeRoomCode();
      return json({ code });
    }

    const match = /^\/api\/room\/([A-Za-z0-9]{4})\/(ws|state)$/.exec(
      url.pathname,
    );
    if (match) {
      const code = (match[1] ?? '').toUpperCase();
      const id = env.ROOM.idFromName(code);
      const stub = env.ROOM.get(id);

      // Pass the code through so a cold object can name itself.
      const forwarded = new URL(request.url);
      forwarded.searchParams.set('code', code);
      return stub.fetch(new Request(forwarded.toString(), request));
    }

    return json({ error: 'not found' }, 404);
  },
};
