/**
 * Wire protocol for multiplayer rooms. OWNED FILE.
 *
 * Shared by the Durable Object and the browser client, so both sides compile
 * against one definition and a change breaks the build rather than production.
 */

import type { Tossup } from '../../src/types';

export const PROTOCOL_VERSION = 1;

/** Room codes are 4 characters from an alphabet with no confusable glyphs. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

export const ANSWER_WINDOW_MS = 5000;
export const TICK_MS = 250;
/** A room with no connections for this long is torn down. */
export const IDLE_TEARDOWN_MS = 30 * 60 * 1000;

export type RoomPhase = 'lobby' | 'reading' | 'buzzed' | 'resolved';

/** Which side of an H2H bracket match a player is on. Unset in an ordinary room. */
export type Side = 'a' | 'b';

export interface PlayerView {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  /** Already negged this question, so cannot buzz again on it. */
  lockedOut: boolean;
  /** Set only in a room attached to a bracket match (see `attachMatch`). */
  side?: Side;
}

/**
 * Present only on a room attached to a bracket match (see workers/room/
 * brackets.ts). Side scores are aggregated here so an H2H match plays like an
 * ordinary room (same buzz-lockout engine, same scoring) while still
 * resolving to a single side-vs-side winner for the bracket.
 */
export interface MatchSnapshot {
  tournamentId: number;
  matchId: number;
  regulationTossups: number;
  tossupsPlayed: number;
  sideScores: { a: number; b: number };
  /** True once `tossupsPlayed` reaches `regulationTossups`. */
  over: boolean;
  /**
   * 'bracket' (the default, for back-compat with existing H2H bracket match
   * rooms) or 'quickplay' for a standalone Quick Play match. Tells room.ts's
   * reportMatchResultIfOver which store to report the winner to.
   */
  kind: 'bracket' | 'quickplay';
}

/** The question as the room sees it. The answer is never sent while reading. */
export interface RoomQuestion {
  id: string;
  words: string[];
  powerIndex: number | null;
  category: string;
  subcategory: string;
  difficulty: number;
  setName: string;
}

export interface RoomSnapshot {
  v: number;
  code: string;
  phase: RoomPhase;
  players: PlayerView[];
  question: RoomQuestion | null;
  /** Authoritative count of words revealed at `serverNow`. */
  revealed: number;
  /** Server clock when this snapshot was built, for offset estimation. */
  serverNow: number;
  /**
   * Enough for a client to interpolate between snapshots instead of waiting
   * for a message per word. `elapsed` is reading time consumed at `serverNow`;
   * `running` is false while the clock is paused for a buzz.
   */
  clock: { elapsed: number; running: boolean };
  /** Cumulative due-time per word, in ms. Empty outside a question. */
  schedule: number[];
  /** Who holds the buzz, if anyone. */
  buzzer: string | null;
  /** Server time the buzzer's answer window closes. */
  answerDeadline: number | null;
  /** Populated only once the question is resolved. */
  reveal: {
    answerSanitized: string;
    winner: string | null;
    points: number;
    powered: boolean;
  } | null;
  /** Null for an ordinary ad-hoc room; set for a bracket H2H match room. */
  match: MatchSnapshot | null;
}

// ---------------------------------------------------------------------------
// Client to server
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { t: 'join'; name: string; playerId?: string; side?: Side }
  | { t: 'start' }
  | { t: 'buzz' }
  | { t: 'answer'; given: string }
  | { t: 'next' }
  | { t: 'ping'; sent: number };

// ---------------------------------------------------------------------------
// Server to client
// ---------------------------------------------------------------------------

export type ServerMessage =
  | { t: 'welcome'; playerId: string; snapshot: RoomSnapshot }
  | { t: 'state'; snapshot: RoomSnapshot }
  | { t: 'tick'; revealed: number; serverNow: number }
  | {
      t: 'buzz';
      playerId: string;
      wordIndex: number;
      answerDeadline: number;
      serverNow: number;
    }
  | {
      t: 'judged';
      playerId: string;
      given: string;
      directive: 'accept' | 'prompt' | 'reject';
      directedPrompt?: string;
      points: number;
      powered: boolean;
      /** True when the question is over. A prompt leaves it open. */
      resolved: boolean;
    }
  | { t: 'pong'; sent: number; serverNow: number }
  | { t: 'closed'; reason: string }
  | { t: 'error'; message: string };

/** Serialize a question for the wire, dropping anything that spoils it. */
export function toRoomQuestion(
  t: Tossup,
  words: string[],
  powerIndex: number | null,
): RoomQuestion {
  return {
    id: t.id,
    words,
    powerIndex,
    category: t.category,
    subcategory: t.subcategory,
    difficulty: t.difficulty,
    setName: t.setName,
  };
}

export function makeRoomCode(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = Math.floor(random() * CODE_ALPHABET.length);
    out += CODE_ALPHABET[idx] ?? 'A';
  }
  return out;
}
