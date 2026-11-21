/**
 * The Room Durable Object. OWNED FILE.
 *
 * One instance per room code. Cloudflare routes every message for a code to
 * the same instance and runs them one at a time, which is what makes "first
 * buzz wins" decidable without locks or timestamps from untrusted clients.
 *
 * Design note on the word clock. The server does NOT stream a message per
 * word: that would be several messages per second per client for no gain.
 * Instead each state message carries `serverNow` and the schedule, clients
 * measure their clock offset with ping/pong, and they interpolate locally.
 * Rendering is therefore smooth and identical across devices, while the only
 * thing that actually has to be authoritative, the ORDER OF BUZZES, is decided
 * here by arrival order. A client that pauses, throttles or edits its own timer
 * changes nothing about when its buzz is recorded.
 *
 * The server also fetches the question itself rather than letting a client
 * supply it. If the host's browser chose the question, the host would know the
 * answer before anyone else.
 */

import {
  abandonQuestion,
  applyJudgement,
  attachMatch,
  buzz,
  createRoom,
  everyoneLockedOut,
  finishReading,
  isMatchOver,
  join,
  leave,
  nextQuestion,
  nextWake,
  snapshot,
  startQuestion,
  timeout,
  type Outcome,
  type RoomState,
} from './engine';
import type { ClientMessage, ServerMessage, Side } from './protocol';
import { IDLE_TEARDOWN_MS, toRoomQuestion } from './protocol';
import { judge } from '../../src/engine/judge';
import { buildSchedule } from '../../src/engine/pacing';
import { parseQuestion } from '../../src/engine/power';
import { TossupQueue, defaultFilters } from '../../src/data/qbreader';
import { d1BracketStore, recordBracketMatchResult } from './brackets';
import { d1RatingStore } from './ratings';
import { d1QuickPlayStore, recordQuickPlayMatchResult } from './quickplay';

export interface Env {
  ROOM: DurableObjectNamespace;
  /** D1 database binding for the live-rooms index. Optional so solo-practice
   * tests that stand up the DO without a D1 binding still work. */
  DB?: D1Database;
  /** Shared secret required by `/__internal/close` and `/__internal/attach-match`.
   * Optional for the same reason; a missing secret simply refuses every
   * internal request. */
  INTERNAL_SECRET?: string;
}

const DEFAULT_WPM = 150;
const MAX_PLAYERS = 12;
/** How often the DO is allowed to re-touch the live-rooms row on heartbeat.
 * Lower than the admin list's 2-minute staleness window with plenty of slack. */
const HEARTBEAT_MS = 20_000;

export class Room implements DurableObject {
  private room: RoomState;
  private sessions = new Map<WebSocket, string>();
  private queue = new TossupQueue(defaultFilters());
  private wpm = DEFAULT_WPM;
  private lastActivity = Date.now();
  private env: Env;
  /** True once we've written the create row for this DO lifetime. */
  private registered = false;
  private lastHeartbeat = 0;
  /** Player count last written to D1, so we skip no-op updates. */
  private lastWrittenPlayerCount = -1;

  constructor(
    private readonly ctx: DurableObjectState,
    env: Env,
  ) {
    this.env = env;
    this.room = createRoom('????');
    void this.ctx.blockConcurrencyWhile(async () => {
      const saved = await this.ctx.storage.get<RoomState>('room');
      if (saved) {
        this.room = saved;
        // Nobody is connected across a hibernation, and a frozen clock must
        // not resume on its own when the object wakes.
        for (const p of Object.values(this.room.players)) p.connected = false;
        this.room.startedAt = null;
      }
      const wpm = await this.ctx.storage.get<number>('wpm');
      if (typeof wpm === 'number') this.wpm = wpm;
    });
  }

  // -------------------------------------------------------------------------
  // HTTP / websocket entry
  // -------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/ws')) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      if (this.sessions.size >= MAX_PLAYERS) {
        return new Response('room full', { status: 503 });
      }

      const code = url.searchParams.get('code') ?? this.room.code;
      if (this.room.code === '????') this.room.code = code.toUpperCase();

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();
      this.wire(server);
      // Registering happens here (rather than on the first `join` message) so a
      // room that accepts a socket but is torn down before anyone names
      // themselves still has a last_seen that the admin sweep can age out.
      await this.registerLive(Date.now());
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith('/state')) {
      return Response.json(snapshot(this.room, Date.now()));
    }

    // Internal: the admin worker sets closed_at and then calls this to drain
    // immediately instead of waiting for the next heartbeat. The secret header
    // is compared to env.INTERNAL_SECRET and never surfaces in a response.
    if (url.pathname.endsWith('/__internal/close')) {
      const presented = request.headers.get('x-internal-secret') ?? '';
      const expected = this.env.INTERNAL_SECRET ?? '';
      if (expected.length === 0 || !constantTimeEquals(presented, expected)) {
        return new Response('forbidden', { status: 403 });
      }
      await this.drainAndClose('closed by admin');
      return Response.json({ ok: true });
    }

    // Internal: brackets.ts's "open a match room" endpoint calls this once,
    // right after allocating a fresh room code, to bind this DO instance to a
    // specific bracket match. attachMatch() is itself idempotent, so a retried
    // request here is harmless.
    if (url.pathname.endsWith('/__internal/attach-match')) {
      const presented = request.headers.get('x-internal-secret') ?? '';
      const expected = this.env.INTERNAL_SECRET ?? '';
      if (expected.length === 0 || !constantTimeEquals(presented, expected)) {
        return new Response('forbidden', { status: 403 });
      }
      const body = (await request.json()) as {
        code?: string;
        tournamentId?: number;
        matchId?: number;
        entrantAKey?: string;
        entrantBKey?: string;
        regulationTossups?: number;
        kind?: 'bracket' | 'quickplay';
      };
      if (this.room.code === '????' && typeof body.code === 'string') {
        this.room.code = body.code.toUpperCase();
      }
      attachMatch(this.room, {
        tournamentId: Number(body.tournamentId) || 0,
        matchId: Number(body.matchId),
        entrantAKey: String(body.entrantAKey ?? ''),
        entrantBKey: String(body.entrantBKey ?? ''),
        regulationTossups: Number(body.regulationTossups) || 20,
        kind: body.kind,
      });
      await this.ctx.storage.put('room', this.room);
      return Response.json({ ok: true });
    }

    return new Response('not found', { status: 404 });
  }

  // -------------------------------------------------------------------------
  // Session plumbing
  // -------------------------------------------------------------------------

  private wire(ws: WebSocket): void {
    ws.addEventListener('message', (ev: MessageEvent) => {
      void this.onMessage(ws, ev);
    });
    const close = () => void this.onClose(ws);
    ws.addEventListener('close', close);
    ws.addEventListener('error', close);
  }

  private async onMessage(ws: WebSocket, ev: MessageEvent): Promise<void> {
    this.lastActivity = Date.now();
    // Heartbeat: touch the live-rooms row periodically, and check for an admin
    // close. Either side of this call can throw; `heartbeat` swallows its own
    // errors so a D1 outage never breaks a live room.
    await this.heartbeat(this.lastActivity);
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(ev.data)) as ClientMessage;
    } catch {
      this.sendTo(ws, { t: 'error', message: 'bad message' });
      return;
    }

    const now = Date.now();
    const playerId = this.sessions.get(ws);

    // Join is the only message allowed before the socket has a player.
    if (msg.t === 'join') {
      const id = msg.playerId?.trim() || crypto.randomUUID();
      this.sessions.set(ws, id);
      const side: Side | undefined = msg.side === 'a' || msg.side === 'b' ? msg.side : undefined;
      const out = join(this.room, id, String(msg.name ?? '').slice(0, 24), now, side);
      this.sendTo(ws, {
        t: 'welcome',
        playerId: id,
        snapshot: snapshot(this.room, now),
      });
      await this.commit(out, ws);
      return;
    }

    if (!playerId) {
      this.sendTo(ws, { t: 'error', message: 'join first' });
      return;
    }

    switch (msg.t) {
      case 'ping':
        this.sendTo(ws, { t: 'pong', sent: msg.sent, serverNow: now });
        return;

      case 'start':
        await this.commit(await this.beginQuestion(now), ws);
        return;

      case 'buzz':
        await this.commit(buzz(this.room, playerId, now), ws);
        return;

      case 'answer': {
        if (this.room.buzzer !== playerId) {
          this.sendTo(ws, { t: 'error', message: 'you do not hold the buzz' });
          return;
        }
        const line = this.room.answerline ?? this.room.answerSanitized ?? '';
        const verdict = judge(line, String(msg.given ?? ''));
        await this.commit(
          applyJudgement(this.room, playerId, String(msg.given ?? ''), verdict, now),
          ws,
        );
        return;
      }

      case 'next':
        await this.commit(nextQuestion(this.room, now), ws);
        return;

      default:
        this.sendTo(ws, { t: 'error', message: 'unknown message' });
    }
  }

  private async onClose(ws: WebSocket): Promise<void> {
    const playerId = this.sessions.get(ws);
    this.sessions.delete(ws);
    if (!playerId) return;
    // Only mark away if they have no other socket open.
    const stillHere = [...this.sessions.values()].includes(playerId);
    if (stillHere) {
      await this.touchLive(Date.now());
      return;
    }
    await this.commit(leave(this.room, playerId, Date.now()));
    // Last socket out: remove the row so the admin list never shows a ghost.
    if (this.sessions.size === 0) await this.deregisterLive();
  }

  // -------------------------------------------------------------------------
  // Questions
  // -------------------------------------------------------------------------

  private async beginQuestion(now: number): Promise<Outcome> {
    if (isMatchOver(this.room)) {
      return { messages: [{ t: 'error', message: 'this match has finished its regulation tossups' }] };
    }
    const tossup = await this.queue.next();
    if (!tossup) {
      return { messages: [{ t: 'error', message: 'no questions available' }] };
    }
    const parsed = parseQuestion(tossup.questionSanitized);
    const schedule = buildSchedule(parsed.words, this.wpm);

    return startQuestion(
      this.room,
      {
        question: toRoomQuestion(tossup, parsed.words, parsed.powerIndex),
        answerline: tossup.answer,
        answerSanitized: tossup.answerSanitized,
        schedule,
      },
      now,
    );
  }

  // -------------------------------------------------------------------------
  // Alarms drive the two deadlines: the answer window and end of reading.
  // -------------------------------------------------------------------------

  async alarm(): Promise<void> {
    const now = Date.now();

    if (
      this.room.phase === 'buzzed' &&
      this.room.answerDeadline !== null &&
      now >= this.room.answerDeadline
    ) {
      await this.commit(timeout(this.room, now));
      return;
    }

    if (this.room.phase === 'reading') {
      const out = finishReading(this.room, now);
      if (out.messages.length > 0) {
        await this.commit(out);
        return;
      }
    }

    // Tear the room down if it has been quiet for a long time.
    if (this.sessions.size === 0 && now - this.lastActivity > IDLE_TEARDOWN_MS) {
      await this.ctx.storage.deleteAll();
      await this.deregisterLive();
      return;
    }

    // This alarm fired early for a deadline that has since moved. Re-arm for
    // the real one, or the room waits forever.
    await this.rearm();
  }

  // -------------------------------------------------------------------------
  // Commit: broadcast, persist, and arm the next alarm
  // -------------------------------------------------------------------------

  /**
   * @param origin when given, `error` messages go only to that socket. An
   *   error is a reply to one player's action; broadcasting it told everyone
   *   in the room that somebody's buzz lost.
   */
  private async commit(out: Outcome, origin?: WebSocket): Promise<void> {
    for (const m of out.messages) {
      if (m.t === 'error' && origin) this.sendTo(origin, m);
      else this.broadcast(m);
    }

    // If everyone who could still buzz has negged, the question is over even
    // though the clock is technically still running.
    if (this.room.phase === 'reading' && everyoneLockedOut(this.room)) {
      const done = abandonQuestion(this.room, Date.now());
      for (const m of done.messages) this.broadcast(m);
    }

    await this.ctx.storage.put('room', this.room);
    // A commit may have changed the connected player count; keep the live row
    // honest. Safe to await: `touchLive` degrades to a no-op on D1 errors.
    await this.touchLive(Date.now());
    await this.reportMatchResultIfOver(Date.now());
    await this.rearm();
  }

  /**
   * Once a match room's regulation tossups are all played, report the side
   * with the higher score to whichever store the match belongs to (bracket
   * or Quick Play). Both `recordBracketMatchResult` and
   * `recordQuickPlayMatchResult` already refuse a match that isn't 'ready',
   * so a retried/duplicate call here (e.g. after a DO hibernation) is
   * harmless — no separate "already reported" flag needed.
   *
   * A bracket tie reports nothing; the TD resolves it by hand via the
   * bracket panel. A Quick Play tie still reports (as "finished" with no
   * winner and no rating change) since there's no TD to resolve it —
   * leaving it 'ready' forever would strand both players' match history.
   */
  private async reportMatchResultIfOver(now: number): Promise<void> {
    if (!this.env.DB) return;
    const match = this.room.match;
    if (!match || !isMatchOver(this.room)) return;
    const { a, b } = match.sideScores;

    if (match.kind === 'quickplay') {
      const winnerUserId = a === b ? null : userIdOf(a > b ? match.entrantAKey : match.entrantBKey);
      try {
        await recordQuickPlayMatchResult(
          d1QuickPlayStore(this.env.DB),
          d1RatingStore(this.env.DB),
          match.matchId,
          winnerUserId,
          now,
        );
      } catch (err) {
        console.error('quick play match result report failed', err);
      }
      return;
    }

    if (a === b) return;
    const winnerKey = a > b ? match.entrantAKey : match.entrantBKey;
    try {
      await recordBracketMatchResult(
        d1BracketStore(this.env.DB),
        d1RatingStore(this.env.DB),
        match.tournamentId,
        match.matchId,
        winnerKey,
        now,
      );
    } catch (err) {
      console.error('bracket match result report failed', err);
    }
  }

  /**
   * Set the alarm from room state, every time. Never conditional on what is
   * already pending: a stale alarm that fires early must still leave the room
   * with an alarm for its real next deadline.
   */
  private async rearm(): Promise<void> {
    const wake = nextWake(this.room, Date.now());
    if (wake === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const existing = await this.ctx.storage.getAlarm();
    if (existing !== wake) await this.ctx.storage.setAlarm(wake);
  }

  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.sessions.keys()) {
      try {
        ws.send(payload);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }

  private sendTo(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      this.sessions.delete(ws);
    }
  }

  // -------------------------------------------------------------------------
  // Live-rooms index (D1-backed) and admin-driven close.
  //
  // Writes here must never break a room. Every path catches its own errors so
  // a D1 outage degrades cleanly to "the admin dashboard won't list this
  // room" rather than "nobody can play".
  // -------------------------------------------------------------------------

  private connectedCount(): number {
    // Count distinct player ids across open sockets. A player reconnecting on
    // a second tab must not be counted twice.
    const ids = new Set<string>();
    for (const id of this.sessions.values()) ids.add(id);
    return ids.size;
  }

  private async registerLive(now: number): Promise<void> {
    if (!this.env.DB) return;
    if (this.room.code === '????') return;
    const count = this.connectedCount();
    try {
      await this.env.DB.prepare(
        `INSERT INTO live_rooms (id, created_at, last_seen, player_count)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen,
                                         player_count = excluded.player_count`,
      )
        .bind(this.room.code, now, now, count)
        .run();
      this.registered = true;
      this.lastHeartbeat = now;
      this.lastWrittenPlayerCount = count;
    } catch (err) {
      console.error('live_rooms register failed', err);
    }
  }

  /**
   * Write the row's `last_seen` and (if changed) `player_count`. Also reads
   * back `closed_at` and triggers a drain if the admin marked this room for
   * closure since the last heartbeat.
   */
  private async touchLive(now: number): Promise<void> {
    if (!this.env.DB) return;
    if (this.room.code === '????') return;
    const count = this.connectedCount();
    const sameCount = count === this.lastWrittenPlayerCount;
    const tooSoon = now - this.lastHeartbeat < HEARTBEAT_MS;
    if (sameCount && tooSoon) return;
    try {
      const row = await this.env.DB.prepare(
        `INSERT INTO live_rooms (id, created_at, last_seen, player_count)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen,
                                         player_count = excluded.player_count
           RETURNING closed_at`,
      )
        .bind(this.room.code, now, now, count)
        .first<{ closed_at: number | null }>();
      this.registered = true;
      this.lastHeartbeat = now;
      this.lastWrittenPlayerCount = count;
      if (row && row.closed_at !== null) {
        await this.drainAndClose('closed by admin');
      }
    } catch (err) {
      console.error('live_rooms touch failed', err);
    }
  }

  private async heartbeat(now: number): Promise<void> {
    await this.touchLive(now);
  }

  private async deregisterLive(): Promise<void> {
    if (!this.env.DB) return;
    if (!this.registered && this.room.code === '????') return;
    try {
      await this.env.DB.prepare('DELETE FROM live_rooms WHERE id = ?')
        .bind(this.room.code)
        .run();
    } catch (err) {
      console.error('live_rooms deregister failed', err);
    }
    this.registered = false;
    this.lastWrittenPlayerCount = -1;
  }

  /**
   * Broadcast a closed message to every connected client, close every socket,
   * and clear the row. Idempotent: calling this on a room with no sockets
   * simply deletes the row.
   */
  private async drainAndClose(reason: string): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const payload = JSON.stringify({ t: 'closed', reason } as ServerMessage);
      for (const ws of [...this.sessions.keys()]) {
        try {
          ws.send(payload);
        } catch {
          // ignored: we're about to close anyway
        }
        try {
          ws.close(1000, 'closed by admin');
        } catch {
          // ignored
        }
      }
      this.sessions.clear();
      await this.deregisterLive();
    });
  }
}

/** Parses a Quick Play entrant key (`u:<id>`) back into a user id, or null. */
function userIdOf(key: string): number | null {
  const m = /^u:(\d+)$/.exec(key);
  return m && m[1] !== undefined ? Number(m[1]) : null;
}

/**
 * Length-prefixed constant-time string compare. Used so an attacker racing
 * `/__internal/close` cannot time-measure byte-by-byte to recover
 * `INTERNAL_SECRET`.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
