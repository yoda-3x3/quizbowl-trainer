/**
 * Room websocket client. OWNED FILE.
 *
 * Responsibilities, in order of how easy they are to get wrong:
 *
 *  1. Estimate the offset between this device's clock and the server's, so the
 *     question can be interpolated locally between snapshots instead of
 *     needing a message per word. Uses the median of several ping round trips,
 *     because a single sample on a phone network is noise.
 *  2. Reconnect with backoff, reusing the same playerId so a dropped
 *     connection rejoins the same seat with the same score.
 *  3. Never decide anything. Buzz order, scoring and the answer all come from
 *     the server. This file renders what it is told.
 */

import type {
  ClientMessage,
  RoomSnapshot,
  ServerMessage,
} from '../../workers/room/protocol';

const PLAYER_ID_KEY = 'qb.playerId';
const PING_INTERVAL_MS = 5000;
const PING_SAMPLES = 7;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed';

export interface RoomClientEvents {
  snapshot(s: RoomSnapshot): void;
  message(m: ServerMessage): void;
  connection(state: ConnectionState): void;
}

function readStoredPlayerId(): string | undefined {
  try {
    return localStorage.getItem(PLAYER_ID_KEY) ?? undefined;
  } catch {
    // Private mode. A fresh id each session is an acceptable degradation.
    return undefined;
  }
}

function storePlayerId(id: string): void {
  try {
    localStorage.setItem(PLAYER_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export class RoomClient {
  private ws: WebSocket | null = null;
  private offsets: number[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private closedByUs = false;

  playerId: string | undefined = readStoredPlayerId();
  /** Server time minus local time, in ms. */
  clockOffset = 0;
  snapshot: RoomSnapshot | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly code: string,
    private readonly name: string,
    private readonly events: Partial<RoomClientEvents> = {},
  ) {}

  /** The server's idea of "now", as best this client can tell. */
  serverNow(): number {
    return Date.now() + this.clockOffset;
  }

  connect(): void {
    this.closedByUs = false;
    this.events.connection?.(this.attempts === 0 ? 'connecting' : 'reconnecting');

    // Route through the same same-origin Pages Function proxy as every HTTP
    // /api/* call (functions/api/[[path]].ts forwards the Upgrade header
    // fine — confirmed live). An earlier version special-cased *.pages.dev
    // hosts to bypass the proxy and connect straight to the production
    // `quizbowl-rooms` Worker, on the premise that Pages Functions couldn't
    // forward websocket upgrades; that premise no longer holds, and the
    // bypass silently sent every non-prod environment's live room traffic to
    // production's Durable Objects instead of its own (`prev-`/`qa-`/`dev-
    // quizbowl-rooms`), so match data, scores and ratings for a live room
    // and its reported match result never matched what that environment's
    // HTTP API saw. Always using the proxy keeps WS and HTTP on one path.
    const url = new URL(
      `${this.baseUrl}/api/room/${this.code}/ws`,
      window.location.href,
    );
    url.protocol = url.protocol.replace('http', 'ws');

    let ws: WebSocket;
    try {
      ws = new WebSocket(url.toString());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.attempts = 0;
      this.events.connection?.('connected');
      this.send({ t: 'join', name: this.name, ...(this.playerId ? { playerId: this.playerId } : {}) });
      this.startPinging();
    });

    ws.addEventListener('message', (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handle(msg);
    });

    const dropped = () => {
      this.stopPinging();
      if (this.closedByUs) {
        this.events.connection?.('closed');
        return;
      }
      this.scheduleReconnect();
    };
    ws.addEventListener('close', dropped);
    ws.addEventListener('error', dropped);
  }

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'welcome':
        this.playerId = msg.playerId;
        storePlayerId(msg.playerId);
        this.snapshot = msg.snapshot;
        this.events.snapshot?.(msg.snapshot);
        break;

      case 'state':
        this.snapshot = msg.snapshot;
        this.events.snapshot?.(msg.snapshot);
        break;

      case 'pong': {
        // Standard NTP-style estimate. The server timestamps once, so we
        // assume the round trip is symmetric and split it.
        const rtt = Date.now() - msg.sent;
        const estimate = msg.serverNow + rtt / 2 - Date.now();
        this.offsets.push(estimate);
        if (this.offsets.length > PING_SAMPLES) this.offsets.shift();
        this.clockOffset = median(this.offsets);
        break;
      }

      default:
        break;
    }
    this.events.message?.(msg);
  }

  private startPinging(): void {
    this.stopPinging();
    const ping = () => this.send({ t: 'ping', sent: Date.now() });
    // Three quick samples so the first question is already well synced.
    ping();
    setTimeout(ping, 150);
    setTimeout(ping, 400);
    this.pingTimer = setInterval(ping, PING_INTERVAL_MS);
  }

  private stopPinging(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.attempts += 1;
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** (this.attempts - 1),
    );
    this.events.connection?.('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  start(): void {
    this.send({ t: 'start' });
  }

  buzz(): void {
    this.send({ t: 'buzz' });
  }

  answer(given: string): void {
    this.send({ t: 'answer', given });
  }

  next(): void {
    this.send({ t: 'next' });
  }

  close(): void {
    this.closedByUs = true;
    this.stopPinging();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

/** Create a room and get its code. */
export async function createRoom(baseUrl = ''): Promise<string> {
  const res = await fetch(`${baseUrl}/api/room`, { method: 'POST' });
  if (!res.ok) throw new Error(`could not create room (${res.status})`);
  const body = (await res.json()) as { code?: string };
  if (!body.code) throw new Error('server returned no room code');
  return body.code;
}
