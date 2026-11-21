/**
 * Room state machine. OWNED FILE.
 *
 * Pure and synchronous: no websockets, no storage, no Date.now(). Every
 * function takes `now` explicitly, so the whole protocol is unit-testable
 * without a Workers runtime and without sleeping in tests.
 *
 * Why a Durable Object is the right home for this: a DO processes messages
 * single-threaded, one at a time, so "first buzz wins" is decided by arrival
 * order at one authoritative place. There is no race to lose and no clock to
 * trust on the client. A client's own timer could be paused, throttled or
 * edited in devtools; the server's cannot.
 */

import type {
  MatchSnapshot,
  PlayerView,
  RoomPhase,
  RoomQuestion,
  RoomSnapshot,
  ServerMessage,
  Side,
} from './protocol';
import { ANSWER_WINDOW_MS, PROTOCOL_VERSION } from './protocol';
import { revealedAt } from '../../src/engine/pacing';
import { scoreTossup } from '../../src/engine/scoring';
import type { Directive } from '../../src/types';

export interface PlayerRecord {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  /** Set only in a room attached to a bracket match. */
  side?: Side;
}

/**
 * Present only on a room attached to a bracket match (see brackets.ts and
 * room.ts's `/__internal/attach-match`). `entrantAKey`/`entrantBKey` are the
 * bracket match's own entrant keys (e.g. `u:12` or `t:Alpha`) — kept out of
 * the wire snapshot (MatchSnapshot) since clients only need aggregate scores,
 * but needed by room.ts to report the winner back to recordBracketMatchResult.
 */
export interface RoomMatchState {
  tournamentId: number;
  matchId: number;
  entrantAKey: string;
  entrantBKey: string;
  regulationTossups: number;
  tossupsPlayed: number;
  sideScores: { a: number; b: number };
  /** 'bracket' (default) or 'quickplay'. See MatchSnapshot['kind']. */
  kind: 'bracket' | 'quickplay';
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  players: Record<string, PlayerRecord>;
  question: RoomQuestion | null;
  /** Kept server-side only. Never leaves the room before resolution. */
  answerline: string | null;
  answerSanitized: string | null;
  schedule: number[];
  /** Server epoch ms the clock last (re)started. null while paused. */
  startedAt: number | null;
  /** Elapsed ms banked while the clock is paused. */
  frozenElapsed: number;
  buzzer: string | null;
  buzzWordIndex: number | null;
  answerDeadline: number | null;
  /** Players who have already negged this question. */
  lockedOut: string[];
  reveal: RoomSnapshot['reveal'];
  /** Null for an ordinary ad-hoc room; set for a bracket H2H match room. */
  match: RoomMatchState | null;
}

export function createRoom(code: string): RoomState {
  return {
    code,
    phase: 'lobby',
    players: {},
    question: null,
    answerline: null,
    answerSanitized: null,
    schedule: [],
    startedAt: null,
    frozenElapsed: 0,
    buzzer: null,
    buzzWordIndex: null,
    answerDeadline: null,
    lockedOut: [],
    reveal: null,
    match: null,
  };
}

/**
 * Binds a freshly-created room to a bracket match. Must be called before
 * anyone joins (room.ts does this from `/__internal/attach-match` right
 * after allocating the room code). A room can only ever be attached once;
 * calling this twice is a no-op so a retried request doesn't reset progress.
 */
export function attachMatch(
  s: RoomState,
  info: {
    tournamentId: number;
    matchId: number;
    entrantAKey: string;
    entrantBKey: string;
    regulationTossups: number;
    kind?: 'bracket' | 'quickplay';
  },
): void {
  if (s.match) return;
  s.match = {
    tournamentId: info.tournamentId,
    matchId: info.matchId,
    entrantAKey: info.entrantAKey,
    entrantBKey: info.entrantBKey,
    regulationTossups: info.regulationTossups,
    tossupsPlayed: 0,
    sideScores: { a: 0, b: 0 },
    kind: info.kind ?? 'bracket',
  };
}

/** True once a match room has played its full regulation length. */
export function isMatchOver(s: RoomState): boolean {
  return s.match !== null && s.match.tossupsPlayed >= s.match.regulationTossups;
}

function matchSnapshotOf(s: RoomState): MatchSnapshot | null {
  if (!s.match) return null;
  return {
    tournamentId: s.match.tournamentId,
    matchId: s.match.matchId,
    regulationTossups: s.match.regulationTossups,
    tossupsPlayed: s.match.tossupsPlayed,
    sideScores: { ...s.match.sideScores },
    over: isMatchOver(s),
    kind: s.match.kind,
  };
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

/** Elapsed reading time, accounting for pauses. */
export function elapsedAt(s: RoomState, now: number): number {
  if (s.startedAt === null) return s.frozenElapsed;
  return s.frozenElapsed + (now - s.startedAt);
}

export function revealedNow(s: RoomState, now: number): number {
  if (!s.question) return 0;
  if (s.phase === 'resolved') return s.question.words.length;
  return Math.min(
    revealedAt(s.schedule, elapsedAt(s, now)),
    s.question.words.length,
  );
}

/** True once the whole question has been read out. */
export function isFullyRead(s: RoomState, now: number): boolean {
  return s.question !== null && revealedNow(s, now) >= s.question.words.length;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function playerViews(s: RoomState): PlayerView[] {
  return Object.values(s.players)
    .map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.connected,
      lockedOut: s.lockedOut.includes(p.id),
      ...(p.side ? { side: p.side } : {}),
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function snapshot(s: RoomState, now: number): RoomSnapshot {
  return {
    v: PROTOCOL_VERSION,
    code: s.code,
    phase: s.phase,
    players: playerViews(s),
    question: s.question,
    revealed: revealedNow(s, now),
    serverNow: now,
    clock: { elapsed: elapsedAt(s, now), running: s.startedAt !== null },
    schedule: s.schedule,
    buzzer: s.buzzer,
    answerDeadline: s.answerDeadline,
    reveal: s.reveal,
    match: matchSnapshotOf(s),
  };
}

// ---------------------------------------------------------------------------
// Transitions. Each returns the messages to broadcast.
// ---------------------------------------------------------------------------

export interface Outcome {
  messages: ServerMessage[];
  /** When set, the caller should schedule a wake-up at this server time. */
  wakeAt?: number;
}

const NOTHING: Outcome = { messages: [] };

export function join(
  s: RoomState,
  playerId: string,
  name: string,
  now: number,
  side?: Side,
): Outcome {
  const existing = s.players[playerId];
  if (existing) {
    existing.connected = true;
    existing.name = name || existing.name;
    if (side) existing.side = side;
  } else {
    s.players[playerId] = {
      id: playerId,
      name: name || 'player',
      score: 0,
      connected: true,
      ...(side ? { side } : {}),
    };
  }
  return { messages: [{ t: 'state', snapshot: snapshot(s, now) }] };
}

export function leave(s: RoomState, playerId: string, now: number): Outcome {
  const p = s.players[playerId];
  if (!p) return NOTHING;
  p.connected = false;

  // A disconnect while holding the buzz must not freeze the room forever.
  if (s.buzzer === playerId && s.phase === 'buzzed') {
    return timeout(s, now);
  }
  return { messages: [{ t: 'state', snapshot: snapshot(s, now) }] };
}

export function startQuestion(
  s: RoomState,
  opts: {
    question: RoomQuestion;
    answerline: string;
    answerSanitized: string;
    schedule: number[];
  },
  now: number,
): Outcome {
  s.phase = 'reading';
  s.question = opts.question;
  s.answerline = opts.answerline;
  s.answerSanitized = opts.answerSanitized;
  s.schedule = opts.schedule;
  s.startedAt = now;
  s.frozenElapsed = 0;
  s.buzzer = null;
  s.buzzWordIndex = null;
  s.answerDeadline = null;
  s.lockedOut = [];
  s.reveal = null;

  const last = opts.schedule[opts.schedule.length - 1] ?? 0;
  return {
    messages: [{ t: 'state', snapshot: snapshot(s, now) }],
    wakeAt: now + last,
  };
}

export function buzz(s: RoomState, playerId: string, now: number): Outcome {
  if (s.phase !== 'reading') {
    return {
      messages: [{ t: 'error', message: 'not accepting buzzes' }],
    };
  }
  if (!s.players[playerId]) {
    return { messages: [{ t: 'error', message: 'not in this room' }] };
  }
  if (s.lockedOut.includes(playerId)) {
    return { messages: [{ t: 'error', message: 'locked out on this question' }] };
  }

  // Freeze the clock. Everything after this point reads frozenElapsed.
  const elapsed = elapsedAt(s, now);
  s.frozenElapsed = elapsed;
  s.startedAt = null;

  const revealed = Math.min(
    revealedAt(s.schedule, elapsed),
    s.question?.words.length ?? 0,
  );

  s.phase = 'buzzed';
  s.buzzer = playerId;
  s.buzzWordIndex = Math.max(0, revealed - 1);
  s.answerDeadline = now + ANSWER_WINDOW_MS;

  return {
    messages: [
      {
        t: 'buzz',
        playerId,
        wordIndex: s.buzzWordIndex,
        answerDeadline: s.answerDeadline,
        serverNow: now,
      },
    ],
    wakeAt: s.answerDeadline,
  };
}

/**
 * Apply a judgement to the current buzz. The caller does the judging, so this
 * stays pure and the answer checker lives in one place.
 */
export function applyJudgement(
  s: RoomState,
  playerId: string,
  given: string,
  judgement: { directive: Directive; directedPrompt?: string },
  now: number,
): Outcome {
  if (s.phase !== 'buzzed' || s.buzzer !== playerId) {
    return { messages: [{ t: 'error', message: 'you do not hold the buzz' }] };
  }

  // A prompt does not end the question. Real moderators give you more time, so
  // the window restarts rather than running out mid-clarification.
  if (judgement.directive === 'prompt') {
    s.answerDeadline = now + ANSWER_WINDOW_MS;
    const msg: ServerMessage = {
      t: 'judged',
      playerId,
      given,
      directive: 'prompt',
      points: 0,
      powered: false,
      resolved: false,
      ...(judgement.directedPrompt
        ? { directedPrompt: judgement.directedPrompt }
        : {}),
    };
    return { messages: [msg], wakeAt: s.answerDeadline };
  }

  const correct = judgement.directive === 'accept';
  const outcome = scoreTossup({
    buzzWordIndex: s.buzzWordIndex,
    powerIndex: s.question?.powerIndex ?? null,
    correct,
  });

  const player = s.players[playerId];
  if (player) player.score += outcome.points;

  if (correct) {
    return resolve(s, playerId, outcome.points, outcome.powered, given, now);
  }

  // Negged: that player is out for this question, the clock resumes for
  // everyone else from exactly where it stopped.
  s.lockedOut.push(playerId);
  s.buzzer = null;
  s.buzzWordIndex = null;
  s.answerDeadline = null;

  const messages: ServerMessage[] = [
    {
      t: 'judged',
      playerId,
      given,
      directive: 'reject',
      points: outcome.points,
      powered: false,
      resolved: false,
    },
  ];

  // If the question had already finished reading, nobody else can buzz, so it
  // is over. Otherwise resume.
  if (s.frozenElapsed >= (s.schedule[s.schedule.length - 1] ?? 0)) {
    const done = resolve(s, null, 0, false, given, now);
    return { messages: [...messages, ...done.messages] };
  }

  s.phase = 'reading';
  s.startedAt = now;
  const remaining =
    (s.schedule[s.schedule.length - 1] ?? 0) - s.frozenElapsed;
  messages.push({ t: 'state', snapshot: snapshot(s, now) });
  return { messages, wakeAt: now + Math.max(0, remaining) };
}

/** The answer window expired without a submission. Treated as an incorrect buzz. */
export function timeout(s: RoomState, now: number): Outcome {
  if (s.phase !== 'buzzed' || s.buzzer === null) return NOTHING;
  return applyJudgement(s, s.buzzer, '', { directive: 'reject' }, now);
}

/** Reading finished with nobody buzzing. */
export function finishReading(s: RoomState, now: number): Outcome {
  if (s.phase !== 'reading') return NOTHING;
  if (!isFullyRead(s, now)) return NOTHING;
  return resolve(s, null, 0, false, '', now);
}

/**
 * End the question now with no winner, regardless of how much is left to read.
 * Used when every connected player has negged, since running the clock out
 * with nobody able to buzz just makes everyone wait for nothing.
 */
export function abandonQuestion(s: RoomState, now: number): Outcome {
  if (s.phase !== 'reading' && s.phase !== 'buzzed') return NOTHING;
  return resolve(s, null, 0, false, '', now);
}

function resolve(
  s: RoomState,
  winner: string | null,
  points: number,
  powered: boolean,
  given: string,
  now: number,
): Outcome {
  s.phase = 'resolved';
  s.startedAt = null;
  s.buzzer = null;
  s.answerDeadline = null;
  s.reveal = {
    answerSanitized: s.answerSanitized ?? '',
    winner,
    points,
    powered,
  };

  // Tally toward the match's regulation length and side score. A neg that
  // simply locks a player out without ending the question does NOT reach
  // here (see applyJudgement) — only an actual resolution (someone correct,
  // or nobody left who can buzz) counts as "one tossup played".
  if (s.match) {
    s.match.tossupsPlayed += 1;
    const side = winner ? s.players[winner]?.side : undefined;
    if (side) s.match.sideScores[side] += points;
  }

  const messages: ServerMessage[] = [];
  if (winner) {
    messages.push({
      t: 'judged',
      playerId: winner,
      given,
      directive: 'accept',
      points,
      powered,
      resolved: true,
    });
  }
  messages.push({ t: 'state', snapshot: snapshot(s, now) });
  return { messages };
}

/** Clear the board between questions. */
export function nextQuestion(s: RoomState, now: number): Outcome {
  s.phase = 'lobby';
  s.question = null;
  s.answerline = null;
  s.answerSanitized = null;
  s.schedule = [];
  s.startedAt = null;
  s.frozenElapsed = 0;
  s.buzzer = null;
  s.buzzWordIndex = null;
  s.answerDeadline = null;
  s.lockedOut = [];
  s.reveal = null;
  return { messages: [{ t: 'state', snapshot: snapshot(s, now) }] };
}

/**
 * The single authoritative answer to "when must this room wake up next?".
 *
 * Deriving this from state, rather than threading a `wakeAt` through every
 * transition, is what stops a room hanging. The earlier version only armed an
 * alarm when the new deadline was sooner than a pending one, so a buzz that
 * landed while an older alarm was still outstanding never got an alarm of its
 * own and its answer window never expired.
 */
export function nextWake(s: RoomState, now: number): number | null {
  if (s.phase === 'buzzed') return s.answerDeadline;
  if (s.phase === 'reading') {
    const last = s.schedule[s.schedule.length - 1] ?? 0;
    const remaining = last - elapsedAt(s, now);
    return now + Math.max(0, remaining);
  }
  return null;
}

/** Everyone connected has already negged, so nobody can buzz. */
export function everyoneLockedOut(s: RoomState): boolean {
  const live = Object.values(s.players).filter((p) => p.connected);
  if (live.length === 0) return false;
  return live.every((p) => s.lockedOut.includes(p.id));
}
