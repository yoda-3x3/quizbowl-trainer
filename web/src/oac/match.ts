/**
 * Ohio Academic Competition match: state machine and scoring.
 *
 * Pure data in, pure data out. Every transition takes `now` as a parameter
 * rather than reading a clock, so a whole match can be simulated in a test and
 * the screen is left with nothing to do but render and dispatch.
 *
 * The format is not quizbowl with different numbers, and the places it differs
 * are the places this file is careful:
 *
 *  - A directed question gives ONE team TWO attempts inside ONE clock. First
 *    attempt correct scores 2, second scores 1. There is no buzzing.
 *  - A steal is worth 1 and runs on what is LEFT of that same clock. If the
 *    directed team burns both attempts in three seconds, the opponent gets
 *    seven, not ten. If the clock ran out, the opponent gets nothing, which is
 *    why "both wrong and time expired" scores zero for everybody.
 *  - There are no negative points anywhere, and no bonus structure at all: no
 *    tossup/bonus pairing, no 30-point bonuses, no power. Every award goes
 *    through `addScore`, which refuses anything that is not a positive finite
 *    number, so a score cannot fall.
 *  - Conferral is legal before, during and after a question. Nothing here
 *    pauses a clock for it or gates input on it; `confer` only counts, so the
 *    UI can show the affordance without the engine punishing its use.
 *  - OAC has no choose-a-category board. The category round is played in the
 *    fixed order exported as OAC_CATEGORY_ORDER. The board belongs to the YSU
 *    television show, which is a different competition.
 */

import type {
  AttemptEvent,
  Directive,
  Judgement,
  OacAlphabetItem,
  OacDirected,
  OacPacket,
  OacTeam,
  OacTossupQ,
} from '../types';
import { OAC_SCORING } from '../types';
import { DEFAULT_STRICTNESS, judge } from '../engine/judge';
import { buildSchedule, revealedAt } from '../engine/pacing';
import { declaredSeconds, directedTeamFor, qbTaxonomyFor } from './convert';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type OacStage = 'idle' | 'category' | 'alphabet' | 'final' | 'complete';

export type OacAwardReason =
  | 'directed-first'
  | 'directed-second'
  | 'steal'
  | 'category-tossup'
  | 'final-tossup'
  | 'alphabet'
  | 'alphabet-perfect';

export interface OacAward {
  team: OacTeam;
  points: number;
  reason: OacAwardReason;
  questionId: string;
  at: number;
}

/** One answer actually offered, scoring or not. The log substrate. */
export interface OacAttemptRecord {
  at: number;
  team: OacTeam;
  questionId: string;
  oacCategory: string;
  kind: 'directed' | 'steal' | 'category-tossup' | 'final-tossup' | 'alphabet';
  given: string;
  directive: Directive | null;
  points: number;
  buzzWordIndex: number | null;
  totalWords: number;
  msToAnswer: number | null;
  prompt: string;
  answer: string;
}

export type OacDirectedPhase = 'ready' | 'running' | 'steal' | 'done';

export interface OacDirectedState {
  questionId: string;
  oacCategory: string;
  question: OacDirected;
  /** The side this question is read to, from the match position. */
  team: OacTeam;
  /** Opponent of `team`; the only side that may steal. */
  opponent: OacTeam;
  seconds: number;
  startedAt: number | null;
  /** Absolute end of the single clock both the attempts and the steal share. */
  deadline: number | null;
  /** Attempts the directed team has spent. A prompt does not spend one. */
  attempts: number;
  stealAttempts: number;
  phase: OacDirectedPhase;
  pendingPrompt: string | null;
  expired: boolean;
  award: OacAward | null;
}

export type OacTossupPhase = 'ready' | 'reading' | 'buzzed' | 'done';

export interface OacTossupState {
  questionId: string;
  oacCategory: string;
  /** Which round this tossup belongs to. Both are worth 2; the log cares. */
  round: 'category' | 'final';
  question: OacTossupQ;
  value: number;
  words: string[];
  schedule: number[];
  /** When the current reading segment began; null while paused on a buzz. */
  readStartedAt: number | null;
  /** Reading time banked from previous segments, so a buzz pauses the reveal. */
  readElapsedMs: number;
  buzz: {
    team: OacTeam;
    at: number;
    wordIndex: number;
    deadline: number;
  } | null;
  /** Sides that have spent their one answer opportunity. */
  used: OacTeam[];
  pendingPrompt: string | null;
  phase: OacTossupPhase;
  award: OacAward | null;
}

export type OacAlphabetPhase = 'ready' | 'running' | 'graded';

export interface OacAlphabetState {
  letter: string;
  items: OacAlphabetItem[];
  seconds: number;
  startedAt: number | null;
  deadline: number | null;
  phase: OacAlphabetPhase;
  /** What each team has written. Same length as `items`, blanks allowed. */
  sheets: Record<OacTeam, string[]>;
  graded: Record<OacTeam, (Directive | null)[]> | null;
}

export interface OacMatchConfig {
  wpm: number;
  strictness: number;
  /**
   * Answer clock after a tossup buzz. OAC publishes no figure for this, so it
   * follows the reader's five seconds.
   */
  tossupAnswerSeconds: number;
  /**
   * Unverified in any rulebook we could obtain, so off by default. Clamped at
   * zero or above like every other award.
   */
  perfectAlphabetBonus: number;
}

export interface OacMatchState {
  packet: OacPacket;
  config: OacMatchConfig;
  scores: Record<OacTeam, number>;
  /** Conferrals used, for the UI. Never affects scoring or the clock. */
  conferrals: Record<OacTeam, number>;
  stage: OacStage;
  /** Index into packet.categoryRound. */
  categoryIndex: number;
  /** Which of the block's three questions: directed, directed, tossup. */
  slot: 0 | 1 | 2;
  finalIndex: number;
  directed: OacDirectedState | null;
  tossup: OacTossupState | null;
  alphabet: OacAlphabetState;
  awards: OacAward[];
  attempts: OacAttemptRecord[];
}

export type OacAction =
  | { type: 'start' }
  | { type: 'buzz'; team: OacTeam }
  | { type: 'answer'; team: OacTeam; given: string }
  | { type: 'confer'; team: OacTeam }
  | { type: 'write'; team: OacTeam; index: number; text: string }
  | { type: 'grade-alphabet' }
  | { type: 'tick' }
  | { type: 'next' };

export const TEAMS: readonly OacTeam[] = ['A', 'B'];

export function other(team: OacTeam): OacTeam {
  return team === 'A' ? 'B' : 'A';
}

// ---------------------------------------------------------------------------
// Scoring guard
// ---------------------------------------------------------------------------

/**
 * The only way points enter a match.
 *
 * OAC has no penalty of any kind, so anything that is not a positive whole
 * number of points is worth zero. This is the single choke point that makes
 * "no code path can produce a negative score" a property of the file rather
 * than a claim about it.
 */
export function clampAward(points: number): number {
  if (!Number.isFinite(points)) return 0;
  if (points <= 0) return 0;
  return Math.floor(points);
}

function addScore(
  scores: Record<OacTeam, number>,
  team: OacTeam,
  points: number,
): Record<OacTeam, number> {
  const safe = clampAward(points);
  if (safe === 0) return scores;
  return { ...scores, [team]: scores[team] + safe };
}

// ---------------------------------------------------------------------------
// Answer checking
// ---------------------------------------------------------------------------

/**
 * Judge against the primary answer and then each acceptable alternate.
 *
 * `judge()` is the sanctioned wrapper around qb-answer-checker and is not
 * reimplemented here. An OAC question carries its answer as plain text rather
 * than a marked-up answerline, so each candidate is checked on its own and the
 * most favourable directive wins. A prompt neither scores nor spends an
 * attempt, which is why it has to survive as a distinct directive.
 */
export function checkOacAnswer(
  question: { answer: string; acceptable: string[] },
  given: string,
  strictness: number = DEFAULT_STRICTNESS,
): Judgement {
  const trimmed = given.trim();
  if (trimmed.length === 0) return { directive: 'reject' };

  let best: Judgement = { directive: 'reject' };
  for (const candidate of [question.answer, ...question.acceptable]) {
    if (candidate.trim().length === 0) continue;
    const j = judge(candidate, trimmed, strictness);
    if (j.directive === 'accept') return j;
    if (j.directive === 'prompt' && best.directive === 'reject') best = j;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export const DEFAULT_OAC_CONFIG: OacMatchConfig = {
  wpm: 160,
  strictness: DEFAULT_STRICTNESS,
  tossupAnswerSeconds: 5,
  perfectAlphabetBonus: OAC_SCORING.perfectAlphabetBonus,
};

export function createMatch(
  packet: OacPacket,
  config: Partial<OacMatchConfig> = {},
): OacMatchState {
  const merged: OacMatchConfig = { ...DEFAULT_OAC_CONFIG, ...config };
  const items = packet.alphabet?.items ?? [];

  return {
    packet,
    config: {
      ...merged,
      perfectAlphabetBonus: clampAward(merged.perfectAlphabetBonus),
    },
    scores: { A: 0, B: 0 },
    conferrals: { A: 0, B: 0 },
    stage: 'idle',
    categoryIndex: 0,
    slot: 0,
    finalIndex: 0,
    directed: null,
    tossup: null,
    alphabet: {
      letter: packet.alphabet?.letter ?? '',
      items,
      seconds: OAC_SCORING.alphabetSeconds,
      startedAt: null,
      deadline: null,
      phase: 'ready',
      sheets: { A: items.map(() => ''), B: items.map(() => '') },
      graded: null,
    },
    awards: [],
    attempts: [],
  };
}

/**
 * Every point a packet puts on the table, which is the 140 the rules quote:
 * ten categories of two directed questions at 2 plus a tossup at 2, then the
 * twenty alphabet items at 2, then the twenty final tossups at 2.
 *
 * It is a ceiling on the value printed in the packet, not on one team's score.
 * Under the alternation rule each side is only READ ten of the twenty directed
 * questions, so the most a single team can reach in a real match is 130: ten
 * directed at 2, ten steals at 1, ten category tossups at 2, a perfect
 * alphabet at 40 and every final tossup at 40.
 */
export function maxAvailableScore(
  packet: OacPacket,
  perfectAlphabetBonus = 0,
): number {
  const category = packet.categoryRound.reduce((sum, block) => {
    const questions: Array<OacDirected | OacTossupQ> = [...block.questions];
    const directed = questions.filter((q) => q.kind === 'directed').length;
    const tossups = questions.filter((q) => q.kind === 'tossup').length;
    return (
      sum +
      directed * OAC_SCORING.directedFirstAttempt +
      tossups * OAC_SCORING.categoryTossup
    );
  }, 0);
  const alphabet =
    (packet.alphabet?.items.length ?? 0) * OAC_SCORING.alphabetItem;
  const final = packet.finalRound.length * OAC_SCORING.finalTossup;
  return category + alphabet + final + clampAward(perfectAlphabetBonus);
}

/** The most one team can actually reach, given it is read half the directed. */
export function maxReachableScore(
  packet: OacPacket,
  perfectAlphabetBonus = 0,
): number {
  const blocks = packet.categoryRound.length;
  const category =
    blocks *
    (OAC_SCORING.directedFirstAttempt +
      OAC_SCORING.steal +
      OAC_SCORING.categoryTossup);
  const alphabet =
    (packet.alphabet?.items.length ?? 0) * OAC_SCORING.alphabetItem;
  const final = packet.finalRound.length * OAC_SCORING.finalTossup;
  return category + alphabet + final + clampAward(perfectAlphabetBonus);
}

// ---------------------------------------------------------------------------
// Clocks and reveal
// ---------------------------------------------------------------------------

/** Milliseconds left on the live clock, or null when none is running. */
export function remainingMs(state: OacMatchState, now: number): number | null {
  const d = state.directed;
  if (d !== null && (d.phase === 'running' || d.phase === 'steal')) {
    if (d.deadline === null) return d.seconds * 1000;
    return Math.max(0, d.deadline - now);
  }
  if (d !== null && d.phase === 'ready') return d.seconds * 1000;

  const t = state.tossup;
  if (t !== null && t.phase === 'buzzed' && t.buzz !== null) {
    return Math.max(0, t.buzz.deadline - now);
  }

  const a = state.alphabet;
  if (state.stage === 'alphabet' && a.phase === 'running' && a.deadline !== null) {
    return Math.max(0, a.deadline - now);
  }
  return null;
}

/** Whole seconds left, for display. */
export function secondsLeft(state: OacMatchState, now: number): number | null {
  const ms = remainingMs(state, now);
  return ms === null ? null : Math.ceil(ms / 1000);
}

export function revealedWordCount(t: OacTossupState, now: number): number {
  if (t.phase === 'ready') return 0;
  const elapsed =
    t.readElapsedMs + (t.readStartedAt === null ? 0 : now - t.readStartedAt);
  return Math.min(t.words.length, revealedAt(t.schedule, elapsed));
}

/** True once every word is out, so the UI can stop saying "reading". */
export function readingComplete(t: OacTossupState, now: number): boolean {
  return revealedWordCount(t, now) >= t.words.length;
}

// ---------------------------------------------------------------------------
// Question setup
// ---------------------------------------------------------------------------

function directedStateFor(
  state: OacMatchState,
  categoryIndex: number,
  slot: 0 | 1,
): OacDirectedState | null {
  const block = state.packet.categoryRound[categoryIndex];
  if (block === undefined) return null;
  const question = block.questions[slot];
  const team = directedTeamFor(categoryIndex, slot);

  return {
    questionId: `cat-${categoryIndex + 1}-q${slot + 1}`,
    oacCategory: block.category,
    question,
    team,
    opponent: other(team),
    // A calculation question declares its own clock in its prompt text; the
    // parsed `seconds` wins when it is sane, the prompt text is the backstop.
    seconds:
      Number.isFinite(question.seconds) && question.seconds > 0
        ? Math.min(120, question.seconds)
        : declaredSeconds(question.prompt),
    startedAt: null,
    deadline: null,
    attempts: 0,
    stealAttempts: 0,
    phase: 'ready',
    pendingPrompt: null,
    expired: false,
    award: null,
  };
}

function tossupStateFor(
  state: OacMatchState,
  question: OacTossupQ,
  questionId: string,
  oacCategory: string,
  value: number,
  round: 'category' | 'final',
): OacTossupState {
  const words = question.prompt.split(/\s+/).filter((w) => w.length > 0);
  return {
    questionId,
    oacCategory,
    round,
    question,
    value,
    words,
    schedule: buildSchedule(words, state.config.wpm),
    readStartedAt: null,
    readElapsedMs: 0,
    buzz: null,
    used: [],
    pendingPrompt: null,
    phase: 'ready',
    award: null,
  };
}

function armCategorySlot(
  state: OacMatchState,
  categoryIndex: number,
  slot: 0 | 1 | 2,
): OacMatchState {
  const block = state.packet.categoryRound[categoryIndex];
  if (block === undefined) {
    return { ...state, stage: 'alphabet', directed: null, tossup: null };
  }

  if (slot === 2) {
    return {
      ...state,
      stage: 'category',
      categoryIndex,
      slot,
      directed: null,
      tossup: tossupStateFor(
        state,
        block.questions[2],
        `cat-${categoryIndex + 1}-tossup`,
        block.category,
        OAC_SCORING.categoryTossup,
        'category',
      ),
    };
  }

  return {
    ...state,
    stage: 'category',
    categoryIndex,
    slot,
    directed: directedStateFor(state, categoryIndex, slot),
    tossup: null,
  };
}

function armFinal(state: OacMatchState, index: number): OacMatchState {
  const question = state.packet.finalRound[index];
  if (question === undefined) {
    return { ...state, stage: 'complete', directed: null, tossup: null };
  }
  return {
    ...state,
    stage: 'final',
    finalIndex: index,
    directed: null,
    tossup: tossupStateFor(
      state,
      question,
      `final-${index + 1}`,
      'Final Round',
      OAC_SCORING.finalTossup,
      'final',
    ),
  };
}

// ---------------------------------------------------------------------------
// Awarding
// ---------------------------------------------------------------------------

function record(
  state: OacMatchState,
  award: OacAward | null,
  attempt: OacAttemptRecord,
): OacMatchState {
  const next: OacMatchState = {
    ...state,
    attempts: [...state.attempts, attempt],
  };
  if (award === null || clampAward(award.points) === 0) return next;
  return {
    ...next,
    scores: addScore(next.scores, award.team, award.points),
    awards: [...next.awards, { ...award, points: clampAward(award.points) }],
  };
}

// ---------------------------------------------------------------------------
// Directed questions
// ---------------------------------------------------------------------------

function expireDirected(d: OacDirectedState, now: number): OacDirectedState {
  if (d.phase !== 'running' && d.phase !== 'steal') return d;
  if (d.deadline === null || now < d.deadline) return d;
  // Out of clock. Nobody scores: the steal rides the remaining clock, and
  // there is none left.
  return { ...d, phase: 'done', expired: true, pendingPrompt: null };
}

function startDirected(d: OacDirectedState, now: number): OacDirectedState {
  if (d.phase !== 'ready') return d;
  return {
    ...d,
    phase: 'running',
    startedAt: now,
    deadline: now + d.seconds * 1000,
  };
}

function answerDirected(
  state: OacMatchState,
  d: OacDirectedState,
  team: OacTeam,
  given: string,
  now: number,
): OacMatchState {
  const live = expireDirected(d, now);
  if (live.phase === 'done' || live.phase === 'ready') {
    return { ...state, directed: live };
  }

  // Only the side that is on the clock can score. An answer from the other
  // bench is not an attempt and is not recorded.
  const entitled = live.phase === 'running' ? live.team : live.opponent;
  if (team !== entitled) return { ...state, directed: live };

  const judgement = checkOacAnswer(
    live.question,
    given,
    state.config.strictness,
  );
  const totalWords = live.question.prompt
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  const baseAttempt: OacAttemptRecord = {
    at: now,
    team,
    questionId: live.questionId,
    oacCategory: live.oacCategory,
    kind: live.phase === 'running' ? 'directed' : 'steal',
    given,
    directive: judgement.directive,
    points: 0,
    buzzWordIndex: null,
    totalWords,
    msToAnswer: live.startedAt === null ? null : Math.round(now - live.startedAt),
    prompt: live.question.prompt,
    answer: live.question.answer,
  };

  // A prompt is not an attempt: it asks for more words on the same clock.
  if (judgement.directive === 'prompt') {
    return record(
      { ...state, directed: { ...live, pendingPrompt: judgement.directedPrompt ?? 'Be more specific' } },
      null,
      baseAttempt,
    );
  }

  if (live.phase === 'steal') {
    const correct = judgement.directive === 'accept';
    const points = correct ? OAC_SCORING.steal : 0;
    const award: OacAward | null = correct
      ? {
          team,
          points,
          reason: 'steal',
          questionId: live.questionId,
          at: now,
        }
      : null;
    return record(
      {
        ...state,
        directed: {
          ...live,
          phase: 'done',
          pendingPrompt: null,
          stealAttempts: live.stealAttempts + 1,
          award: award ?? live.award,
        },
      },
      award,
      { ...baseAttempt, points },
    );
  }

  const attemptNumber = live.attempts + 1;
  if (judgement.directive === 'accept') {
    const points =
      attemptNumber === 1
        ? OAC_SCORING.directedFirstAttempt
        : OAC_SCORING.directedSecondAttempt;
    const award: OacAward = {
      team,
      points,
      reason: attemptNumber === 1 ? 'directed-first' : 'directed-second',
      questionId: live.questionId,
      at: now,
    };
    return record(
      {
        ...state,
        directed: {
          ...live,
          attempts: attemptNumber,
          phase: 'done',
          pendingPrompt: null,
          award,
        },
      },
      award,
      { ...baseAttempt, points },
    );
  }

  // Wrong. Second wrong answer opens the steal, but only on what is left of
  // this one clock.
  const exhausted = attemptNumber >= 2;
  const timeLeft = live.deadline !== null && now < live.deadline;
  return record(
    {
      ...state,
      directed: {
        ...live,
        attempts: attemptNumber,
        pendingPrompt: null,
        phase: exhausted ? (timeLeft ? 'steal' : 'done') : 'running',
        expired: exhausted && !timeLeft,
      },
    },
    null,
    baseAttempt,
  );
}

// ---------------------------------------------------------------------------
// Tossups
// ---------------------------------------------------------------------------

function startTossup(t: OacTossupState, now: number): OacTossupState {
  if (t.phase !== 'ready') return t;
  return { ...t, phase: 'reading', readStartedAt: now, readElapsedMs: 0 };
}

/** A spent opportunity: resume the read, or close the question. */
function afterFailedBuzz(
  t: OacTossupState,
  team: OacTeam,
  now: number,
): OacTossupState {
  const used = t.used.includes(team) ? t.used : [...t.used, team];
  if (used.length >= TEAMS.length) {
    return { ...t, used, buzz: null, pendingPrompt: null, phase: 'done' };
  }
  return {
    ...t,
    used,
    buzz: null,
    pendingPrompt: null,
    phase: 'reading',
    readStartedAt: now,
  };
}

function buzzTossup(
  state: OacMatchState,
  t: OacTossupState,
  team: OacTeam,
  now: number,
): OacMatchState {
  if (t.phase === 'done' || t.phase === 'buzzed') return state;
  if (t.used.includes(team)) return state;

  const live = t.phase === 'ready' ? startTossup(t, now) : t;
  const revealed = revealedWordCount(live, now);

  return {
    ...state,
    tossup: {
      ...live,
      readElapsedMs:
        live.readElapsedMs +
        (live.readStartedAt === null ? 0 : now - live.readStartedAt),
      readStartedAt: null,
      phase: 'buzzed',
      pendingPrompt: null,
      buzz: {
        team,
        at: now,
        wordIndex: Math.max(0, revealed - 1),
        deadline: now + state.config.tossupAnswerSeconds * 1000,
      },
    },
  };
}

function answerTossup(
  state: OacMatchState,
  t: OacTossupState,
  team: OacTeam,
  given: string,
  now: number,
): OacMatchState {
  if (t.phase !== 'buzzed' || t.buzz === null) return state;
  if (t.buzz.team !== team) return state;
  if (now >= t.buzz.deadline) {
    // Clock gone: the opportunity is spent, the answer is not judged.
    return { ...state, tossup: afterFailedBuzz(t, team, now) };
  }

  const judgement = checkOacAnswer(t.question, given, state.config.strictness);
  const attempt: OacAttemptRecord = {
    at: now,
    team,
    questionId: t.questionId,
    oacCategory: t.oacCategory,
    kind: t.round === 'final' ? 'final-tossup' : 'category-tossup',
    given,
    directive: judgement.directive,
    points: 0,
    buzzWordIndex: t.buzz.wordIndex,
    totalWords: t.words.length,
    msToAnswer: Math.round(now - t.buzz.at),
    prompt: t.question.prompt,
    answer: t.question.answer,
  };

  if (judgement.directive === 'prompt') {
    return record(
      {
        ...state,
        tossup: {
          ...t,
          pendingPrompt: judgement.directedPrompt ?? 'Be more specific',
        },
      },
      null,
      attempt,
    );
  }

  if (judgement.directive === 'accept') {
    const award: OacAward = {
      team,
      points: t.value,
      reason: t.round === 'final' ? 'final-tossup' : 'category-tossup',
      questionId: t.questionId,
      at: now,
    };
    return record(
      {
        ...state,
        tossup: {
          ...t,
          used: t.used.includes(team) ? t.used : [...t.used, team],
          buzz: null,
          pendingPrompt: null,
          phase: 'done',
          award,
        },
      },
      award,
      { ...attempt, points: t.value },
    );
  }

  // Wrong. No penalty, ever. The other side still has its one opportunity and
  // the reading picks up where it stopped.
  return record(
    { ...state, tossup: afterFailedBuzz(t, team, now) },
    null,
    attempt,
  );
}

function tickTossup(state: OacMatchState, t: OacTossupState, now: number): OacMatchState {
  if (t.phase === 'buzzed' && t.buzz !== null && now >= t.buzz.deadline) {
    return { ...state, tossup: afterFailedBuzz(t, t.buzz.team, now) };
  }
  return state;
}

// ---------------------------------------------------------------------------
// Alphabet round
// ---------------------------------------------------------------------------

function startAlphabet(a: OacAlphabetState, now: number): OacAlphabetState {
  if (a.phase !== 'ready') return a;
  return {
    ...a,
    phase: 'running',
    startedAt: now,
    deadline: now + a.seconds * 1000,
  };
}

function gradeAlphabet(state: OacMatchState, now: number): OacMatchState {
  const a = state.alphabet;
  if (a.phase === 'graded') return state;

  let next: OacMatchState = state;
  const graded: Record<OacTeam, (Directive | null)[]> = {
    A: a.items.map(() => null),
    B: a.items.map(() => null),
  };

  for (const team of TEAMS) {
    let correct = 0;
    a.items.forEach((item, i) => {
      const given = a.sheets[team][i] ?? '';
      if (given.trim().length === 0) {
        graded[team][i] = null;
        return;
      }
      const judgement = checkOacAnswer(item, given, state.config.strictness);
      graded[team][i] = judgement.directive;
      const accepted = judgement.directive === 'accept';
      if (accepted) correct += 1;
      const points = accepted ? OAC_SCORING.alphabetItem : 0;
      next = record(
        next,
        accepted
          ? {
              team,
              points,
              reason: 'alphabet',
              questionId: `alpha-${item.index}`,
              at: now,
            }
          : null,
        {
          at: now,
          team,
          questionId: `alpha-${item.index}`,
          oacCategory: `Alphabet Round (${a.letter})`,
          kind: 'alphabet',
          given,
          directive: judgement.directive,
          points,
          buzzWordIndex: null,
          totalWords: item.prompt.split(/\s+/).filter((w) => w.length > 0).length,
          msToAnswer: null,
          prompt: item.prompt,
          answer: item.answer,
        },
      );
    });

    // Unverified in any rulebook we could obtain, hence zero by default, hence
    // normally no award at all.
    const bonus = clampAward(state.config.perfectAlphabetBonus);
    if (bonus > 0 && a.items.length > 0 && correct === a.items.length) {
      next = record(
        next,
        {
          team,
          points: bonus,
          reason: 'alphabet-perfect',
          questionId: 'alpha-perfect',
          at: now,
        },
        {
          at: now,
          team,
          questionId: 'alpha-perfect',
          oacCategory: `Alphabet Round (${a.letter})`,
          kind: 'alphabet',
          given: '',
          directive: 'accept',
          points: bonus,
          buzzWordIndex: null,
          totalWords: 0,
          msToAnswer: null,
          prompt: 'Perfect alphabet round',
          answer: '',
        },
      );
    }
  }

  return {
    ...next,
    alphabet: { ...next.alphabet, phase: 'graded', graded },
  };
}

function writeAlphabet(
  state: OacMatchState,
  team: OacTeam,
  index: number,
  text: string,
  now: number,
): OacMatchState {
  const a = state.alphabet;
  if (state.stage !== 'alphabet') return state;
  if (a.phase !== 'running') return state;
  if (a.deadline !== null && now >= a.deadline) return state;
  if (!Number.isInteger(index) || index < 0 || index >= a.items.length) {
    return state;
  }

  const sheet = [...a.sheets[team]];
  sheet[index] = text;
  return { ...state, alphabet: { ...a, sheets: { ...a.sheets, [team]: sheet } } };
}

// ---------------------------------------------------------------------------
// Advancing
// ---------------------------------------------------------------------------

function advance(state: OacMatchState, now: number): OacMatchState {
  switch (state.stage) {
    case 'idle':
      return armCategorySlot(state, 0, 0);
    case 'category': {
      if (state.slot < 2) {
        const slot = (state.slot + 1) as 1 | 2;
        return armCategorySlot(state, state.categoryIndex, slot);
      }
      const nextCategory = state.categoryIndex + 1;
      if (nextCategory < state.packet.categoryRound.length) {
        return armCategorySlot(state, nextCategory, 0);
      }
      return { ...state, stage: 'alphabet', directed: null, tossup: null };
    }
    case 'alphabet': {
      // Leaving the worksheet always grades it, so no round can be skipped
      // past without its points being settled.
      const graded = gradeAlphabet(state, now);
      return armFinal(graded, 0);
    }
    case 'final': {
      const nextIndex = state.finalIndex + 1;
      if (nextIndex < state.packet.finalRound.length) {
        return armFinal(state, nextIndex);
      }
      return { ...state, stage: 'complete', directed: null, tossup: null };
    }
    case 'complete':
      return state;
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function reduce(
  state: OacMatchState,
  action: OacAction,
  now: number,
): OacMatchState {
  switch (action.type) {
    case 'start': {
      if (state.stage === 'idle') {
        const armed = armCategorySlot(state, 0, 0);
        return reduce(armed, { type: 'start' }, now);
      }
      if (state.stage === 'alphabet') {
        return { ...state, alphabet: startAlphabet(state.alphabet, now) };
      }
      if (state.directed !== null) {
        return { ...state, directed: startDirected(state.directed, now) };
      }
      if (state.tossup !== null) {
        return { ...state, tossup: startTossup(state.tossup, now) };
      }
      return state;
    }

    case 'buzz': {
      // Buzzing exists on pyramidal tossups only. Directed questions are read
      // to one team and are not buzzable.
      if (state.tossup === null) return state;
      return buzzTossup(state, state.tossup, action.team, now);
    }

    case 'answer': {
      if (state.stage === 'alphabet') {
        return state;
      }
      if (state.directed !== null) {
        return answerDirected(
          state,
          state.directed,
          action.team,
          action.given,
          now,
        );
      }
      if (state.tossup !== null) {
        return answerTossup(state, state.tossup, action.team, action.given, now);
      }
      return state;
    }

    case 'confer': {
      // Legal before, during and after a question. It costs nothing, pauses
      // nothing and locks nothing; it is counted only so the UI can show it.
      return {
        ...state,
        conferrals: {
          ...state.conferrals,
          [action.team]: state.conferrals[action.team] + 1,
        },
      };
    }

    case 'write':
      return writeAlphabet(state, action.team, action.index, action.text, now);

    case 'grade-alphabet':
      return state.stage === 'alphabet' ? gradeAlphabet(state, now) : state;

    case 'tick': {
      if (state.directed !== null) {
        const next = expireDirected(state.directed, now);
        return next === state.directed ? state : { ...state, directed: next };
      }
      if (state.tossup !== null) {
        return tickTossup(state, state.tossup, now);
      }
      if (
        state.stage === 'alphabet' &&
        state.alphabet.phase === 'running' &&
        state.alphabet.deadline !== null &&
        now >= state.alphabet.deadline
      ) {
        return gradeAlphabet(state, now);
      }
      return state;
    }

    case 'next':
      return advance(state, now);

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

/** Which side may answer right now, or null when nobody may. */
export function onTheClock(state: OacMatchState, now: number): OacTeam | null {
  const d = state.directed;
  if (d !== null) {
    const live = expireDirected(d, now);
    if (live.phase === 'running') return live.team;
    if (live.phase === 'steal') return live.opponent;
    return null;
  }
  const t = state.tossup;
  if (t !== null && t.phase === 'buzzed' && t.buzz !== null) {
    return now < t.buzz.deadline ? t.buzz.team : null;
  }
  return null;
}

export function currentCategory(state: OacMatchState): string | null {
  if (state.stage !== 'category') return null;
  return state.packet.categoryRound[state.categoryIndex]?.category ?? null;
}

export function isMatchComplete(state: OacMatchState): boolean {
  return state.stage === 'complete';
}

export function leader(state: OacMatchState): OacTeam | 'tie' {
  if (state.scores.A === state.scores.B) return 'tie';
  return state.scores.A > state.scores.B ? 'A' : 'B';
}

/**
 * An attempt as an AttemptEvent, so OAC play feeds the same log every other
 * mode writes to and the Learn tab needs no special case. OAC categories are
 * mapped onto the app taxonomy; the OAC name is kept as the subcategory when
 * there is no closer fit.
 */
export function toAttemptEvent(
  r: OacAttemptRecord,
  setName: string,
  difficulty = 3,
): AttemptEvent {
  const taxonomy = qbTaxonomyFor(r.oacCategory);
  return {
    id: `oac-${r.questionId}-${r.team}-${r.at}`,
    at: r.at,
    mode: 'oac',
    questionId: r.questionId,
    category: taxonomy.category,
    subcategory: taxonomy.subcategory,
    difficulty,
    buzzWordIndex: r.buzzWordIndex,
    totalWords: r.totalWords,
    // OAC has no power mark anywhere in the format.
    powerWordIndex: null,
    givenAnswer: r.given,
    directive: r.directive,
    points: clampAward(r.points),
    msToAnswer: r.msToAnswer,
    questionSnapshot: {
      questionSanitized: r.prompt,
      answerSanitized: r.answer,
      setName,
    },
  };
}
