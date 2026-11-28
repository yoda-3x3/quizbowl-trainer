/**
 * Worker entry for multiplayer rooms. OWNED FILE.
 *
 * Routes:
 *   POST /api/room                       -> { code }   create a room
 *   GET  /api/room/:code/ws              -> websocket upgrade
 *   GET  /api/room/:code/state           -> snapshot, for debugging
 *   POST /api/auth/signup                -> create an account + session cookie
 *   POST /api/auth/signin                -> session cookie for an existing account
 *   POST /api/auth/signout               -> delete the session + clear the cookie
 *   GET  /api/auth/me                    -> the signed-in user, or 401
 *   GET  /api/tournaments                -> non-finished tournaments with counts
 *   POST /api/tournaments                -> create a tournament (signed-in only)
 *   GET  /api/tournaments/:id            -> tournament + players + questions
 *   POST /api/tournaments/:id/join       -> join as a player (signed-in only)
 *   POST /api/tournaments/:id/start      -> creator sets the question sequence
 *   POST /api/tournaments/:id/protest    -> file a protest on a resolved question
 *   GET  /api/tournaments/:id/protests   -> caller's protests (admin: all)
 *   GET  /api/tournaments/:id/questions/:seq -> next pinned question, resolved
 *   POST /api/tournaments/:id/attempts   -> persist a resolved question's outcome
 *   GET  /api/tournaments/:id/scoreboard -> live totals per player, with deltas
 *   GET  /api/admin/users                -> paginated user list (admin-only)
 *   POST /api/admin/users/:id/role       -> change a user's role (admin-only)
 *   POST /api/admin/users/:id/ban        -> ban + invalidate sessions (admin-only)
 *   POST /api/admin/users/:id/unban      -> clear banned_at (admin-only)
 *   POST /api/admin/users/:id/elo        -> set a user's ELO + rank directly (admin-only)
 *   GET  /api/admin/rooms                -> live-room listing from live_rooms
 *   POST /api/admin/rooms/:code/close    -> mark closed_at + drain the DO
 *   GET  /api/admin/packets              -> stub, packets are client-only
 *   POST /api/admin/packets/:id/remove   -> 404 stub, packets are client-only
 *   GET  /api/admin/protests             -> list protests by state (default pending)
 *   POST /api/admin/protests/:id/resolve -> set a protest's resolution + note
 *   GET  /api/ratings/me                 -> caller's ELO + rank (signed-in only)
 *   GET  /api/ratings/:userId             -> a user's ELO + rank (public)
 *   GET  /api/leaderboard                -> top players by ELO, #1 flagged God
 *   GET  /api/tournaments/:id/bracket     -> bracket state (config + rounds)
 *   POST /api/tournaments/:id/bracket     -> TD seeds the bracket (open tournaments only)
 *   POST /api/tournaments/:id/bracket/matches/:matchId/result  -> TD records a winner
 *   POST /api/tournaments/:id/bracket/matches/:matchId/confirm -> TD confirms advance (manual mode)
 *   POST /api/tournaments/:id/bracket/matches/:matchId/room    -> open/rejoin this match's H2H room
 *   POST /api/quickplay/queue              -> join the public matchmaking queue (pairs immediately if possible)
 *   POST /api/quickplay/queue/leave        -> leave the public queue
 *   GET  /api/quickplay/queue/status       -> whether the caller is still queued
 *   POST /api/quickplay/private            -> create a private (unrated) game, returns an invite code
 *   POST /api/quickplay/private/:code/join -> redeem an invite code, opens the match room
 *   POST /api/tts                         -> MP3 of { text }, for voice mode read-aloud
 *   GET  /api/quickplay/matches/:id        -> a Quick Play match's state (participants only)
 *   POST /api/stats/attempts              -> upload AttemptEvents for per-category stats (signed-in only)
 *   GET  /api/tags?ids=1,2,3               -> earned category tags for those users (public)
 *   GET  /api/profile/:userId              -> public profile: nickname, rank, tags, category stats, recent activity
 *
 * A room code maps to a Durable Object by name, so every client using the same
 * code reaches the same instance no matter which edge location they hit.
 */

import { Room, type Env as RoomEnv } from './room';
import { makeRoomCode } from './protocol';
import { d1Store, handleAuth, type RequestContext } from './auth';
import { d1TournamentStore, handleTournaments } from './tournaments';
import { d1AdminStore, handleAdmin, type RoomCloser } from './admin';
import { d1PacketStore, handlePackets } from './packets';
import { d1RatingStore, handleAdminSetElo, handleRatings } from './ratings';
import { d1BracketStore, handleBrackets, type MatchRoomOpener } from './brackets';
import { d1QuickPlayStore, handleQuickPlay, type QuickPlayRoomOpener } from './quickplay';
import { handleTts, type TtsAi } from './tts';
import { d1ProfileStore, handleProfiles } from './profile';
import { USER_ID_HEADER } from './room';
import { requireUser } from './auth';

export { Room };

/** The full Worker env: the Durable Object plus the D1 database. */
export interface Env extends RoomEnv {
  DB: D1Database;
  /** Shared secret for the Room DO's /__internal/close endpoint. Set with
   *  `wrangler secret put INTERNAL_SECRET` (see web/NOTES.md). */
  INTERNAL_SECRET?: string;
  /** Workers AI, for neural read-aloud (/api/tts). */
  AI?: TtsAi;
}

/**
 * Bridges the admin worker to the Room DO. `index.ts` is the only place that
 * holds the DO namespace and the shared secret; the admin module stays pure.
 */
function roomCloserFor(env: Env): RoomCloser {
  return {
    async close(id: string): Promise<void> {
      const stub = env.ROOM.get(env.ROOM.idFromName(id));
      await stub.fetch('https://do/__internal/close', {
        method: 'POST',
        headers: { 'x-internal-secret': env.INTERNAL_SECRET ?? '' },
      });
    },
  };
}

/**
 * Bridges brackets.ts's "open a match room" endpoint to the Room DO, the
 * same way `roomCloserFor` bridges admin's room closing — brackets.ts stays
 * decoupled from Durable Object specifics.
 */
function matchRoomOpenerFor(env: Env): MatchRoomOpener {
  return {
    async attach(code, info): Promise<void> {
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      await stub.fetch('https://do/__internal/attach-match', {
        method: 'POST',
        headers: {
          'x-internal-secret': env.INTERNAL_SECRET ?? '',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ code, kind: 'bracket', ...info }),
      });
    },
  };
}

/** Same bridge as `matchRoomOpenerFor`, but for Quick Play matches. */
function quickPlayRoomOpenerFor(env: Env): QuickPlayRoomOpener {
  return {
    async attach(code, info): Promise<void> {
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      await stub.fetch('https://do/__internal/attach-match', {
        method: 'POST',
        headers: {
          'x-internal-secret': env.INTERNAL_SECRET ?? '',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ code, kind: 'quickplay', ...info }),
      });
    },
  };
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

    if (url.pathname === '/api/tts') {
      const cache = typeof caches === 'undefined' ? null : caches.default;
      return handleTts(request, env.AI, cache);
    }

    // Auth endpoints. Same-origin because Pages proxies /api to this Worker.
    if (url.pathname.startsWith('/api/auth/')) {
      const response = await handleAuth(request, d1Store(env.DB), contextFrom(request));
      if (response) return response;
    }

    // Admin endpoints. Guarded per-route by requireAdmin; mounted ahead of the
    // tournaments dispatch so /api/admin/protests never falls through.
    if (url.pathname.startsWith('/api/admin')) {
      const authStore = d1Store(env.DB);

      // Set a user's ELO directly, ahead of the generic handleAdmin dispatch
      // (which always returns a Response for any /api/admin/* path, so this
      // has to be caught first). Lives in ratings.ts, not admin.ts, since
      // that module already owns the ratings table end to end.
      const eloAction = /^\/api\/admin\/users\/(\d+)\/elo$/.exec(url.pathname);
      if (eloAction) {
        if (request.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'method not allowed' }), {
            status: 405,
            headers: { 'content-type': 'application/json' },
          });
        }
        const userId = Number(eloAction[1]);
        const ratingStore = d1RatingStore(env.DB);
        return handleAdminSetElo(request, authStore, ratingStore, contextFrom(request), userId);
      }

      const tStore = d1TournamentStore(env.DB);
      const adminStore = d1AdminStore(env.DB);
      const packetStore = d1PacketStore(env.DB);
      const response = await handleAdmin(
        request,
        authStore,
        adminStore,
        tStore,
        packetStore,
        roomCloserFor(env),
        contextFrom(request),
      );
      if (response) return response;
    }

    // Shared packet storage. Any signed-in user can list/upload/fetch; delete
    // is gated to the uploader or an admin inside the handler.
    if (url.pathname.startsWith('/api/packets')) {
      const authStore = d1Store(env.DB);
      const packetStore = d1PacketStore(env.DB);
      const response = await handlePackets(
        request,
        authStore,
        packetStore,
        contextFrom(request),
      );
      if (response) return response;
    }

    // Bracket endpoints. Mounted ahead of the generic tournaments dispatch so
    // /api/tournaments/:id/bracket* is claimed before that dispatch's own
    // depth check would 404 it.
    if (url.pathname.startsWith('/api/tournaments/')) {
      const authStore = d1Store(env.DB);
      const tStore = d1TournamentStore(env.DB);
      const bStore = d1BracketStore(env.DB);
      const ratingStore = d1RatingStore(env.DB);
      const response = await handleBrackets(
        request,
        authStore,
        tStore,
        bStore,
        ratingStore,
        contextFrom(request),
        matchRoomOpenerFor(env),
      );
      if (response) return response;
    }

    // Tournament endpoints. Reuses the auth store for session resolution.
    if (url.pathname.startsWith('/api/tournaments')) {
      const authStore = d1Store(env.DB);
      const tStore = d1TournamentStore(env.DB);
      const response = await handleTournaments(
        request,
        authStore,
        tStore,
        contextFrom(request),
      );
      if (response) return response;
    }

    // ELO ratings + leaderboard. Reuses the auth store for session resolution.
    if (url.pathname.startsWith('/api/ratings') || url.pathname === '/api/leaderboard') {
      const authStore = d1Store(env.DB);
      const ratingStore = d1RatingStore(env.DB);
      const response = await handleRatings(
        request,
        authStore,
        ratingStore,
        contextFrom(request),
      );
      if (response) return response;
    }

    // Per-category stats, category tags and public profiles.
    if (
      url.pathname.startsWith('/api/stats/') ||
      url.pathname === '/api/tags' ||
      url.pathname.startsWith('/api/profile/')
    ) {
      const response = await handleProfiles(
        request,
        d1Store(env.DB),
        d1RatingStore(env.DB),
        d1ProfileStore(env.DB),
        contextFrom(request),
      );
      if (response) return response;
    }

    // Quick Play: public matchmaking (rated) + private invite-code games
    // (unrated). Reuses the auth store for session resolution and the same
    // Room DO as H2H bracket matches.
    if (url.pathname.startsWith('/api/quickplay/')) {
      const authStore = d1Store(env.DB);
      const qpStore = d1QuickPlayStore(env.DB);
      const response = await handleQuickPlay(
        request,
        authStore,
        qpStore,
        contextFrom(request),
        quickPlayRoomOpenerFor(env),
      );
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
      const fwd = new Request(forwarded.toString(), request);
      // Tell the room who this socket belongs to, so it can show the player's
      // tags and link their profile. Any client-sent copy is dropped first;
      // only a session the Worker itself resolved sets it.
      fwd.headers.delete(USER_ID_HEADER);
      if (match[2] === 'ws') {
        const me = await requireUser(request, d1Store(env.DB), Date.now()).catch(() => null);
        if (me) fwd.headers.set(USER_ID_HEADER, String(me.id));
      }
      return stub.fetch(fwd);
    }

    return json({ error: 'not found' }, 404);
  },
};
