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
  buzz,
  createRoom,
  everyoneLockedOut,
  finishReading,
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
import type { ClientMessage, ServerMessage } from './protocol';
import { IDLE_TEARDOWN_MS, toRoomQuestion } from './protocol';
import { judge } from '../../src/engine/judge';
import { buildSchedule } from '../../src/engine/pacing';
import { parseQuestion } from '../../src/engine/power';
import { TossupQueue, defaultFilters } from '../../src/data/qbreader';

export interface Env {
  ROOM: DurableObjectNamespace;
}

const DEFAULT_WPM = 150;
const MAX_PLAYERS = 12;

export class Room implements DurableObject {
  private room: RoomState;
  private sessions = new Map<WebSocket, string>();
  private queue = new TossupQueue(defaultFilters());
  private wpm = DEFAULT_WPM;
  private lastActivity = Date.now();

  constructor(
    private readonly ctx: DurableObjectState,
    _env: Env,
  ) {
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
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith('/state')) {
      return Response.json(snapshot(this.room, Date.now()));
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
      const out = join(this.room, id, String(msg.name ?? '').slice(0, 24), now);
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
    if (stillHere) return;
    await this.commit(leave(this.room, playerId, Date.now()));
  }

  // -------------------------------------------------------------------------
  // Questions
  // -------------------------------------------------------------------------

  private async beginQuestion(now: number): Promise<Outcome> {
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
    await this.rearm();
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
}
