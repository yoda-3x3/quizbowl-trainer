/**
 * Match engine tests.
 *
 * The format's scoring is unusual enough that these tests are written as rule
 * statements: two attempts in one clock, a steal on what is left of that clock,
 * no penalty anywhere, no bonus of any kind. The last two describe the whole
 * match: a full simulated three rounds against a hand-computed score, and a
 * fuzz run that asserts no sequence of actions can push a score down or below
 * zero.
 */

import { describe, expect, it } from 'vitest';
import type { OacAlphabetItem, OacTeam } from '../../types';
import { OAC_SCORING } from '../../types';
import {
  clampAward,
  createMatch,
  isMatchComplete,
  leader,
  maxAvailableScore,
  maxReachableScore,
  onTheClock,
  reduce,
  remainingMs,
  revealedWordCount,
  secondsLeft,
  toAttemptEvent,
  TEAMS,
  type OacAction,
  type OacMatchConfig,
  type OacMatchState,
} from '../match';
import { makePacket, WRONG } from './fixture';

const T0 = 1_700_000_000_000;

function newMatch(config: Partial<OacMatchConfig> = {}): OacMatchState {
  return createMatch(makePacket(), config);
}

/** Arm and start the first directed question of the match. */
function firstDirected(config: Partial<OacMatchConfig> = {}): OacMatchState {
  let s = reduce(newMatch(config), { type: 'next' }, T0);
  s = reduce(s, { type: 'start' }, T0);
  return s;
}

function directedOf(s: OacMatchState) {
  const d = s.directed;
  if (d === null) throw new Error('expected a directed question');
  return d;
}

function tossupOf(s: OacMatchState) {
  const t = s.tossup;
  if (t === null) throw new Error('expected a tossup');
  return t;
}

// ---------------------------------------------------------------------------
// Directed questions
// ---------------------------------------------------------------------------

describe('directed questions', () => {
  it('reads the first directed question of category 1 to team A', () => {
    const s = firstDirected();
    expect(directedOf(s).team).toBe('A');
    expect(onTheClock(s, T0 + 1000)).toBe('A');
  });

  it('alternates which side takes the first directed question', () => {
    let s = reduce(newMatch(), { type: 'next' }, T0);
    const sides: OacTeam[] = [];
    let now = T0;
    while (s.stage === 'category') {
      if (s.slot === 0) sides.push(directedOf(s).team);
      now += 100;
      s = reduce(s, { type: 'next' }, now);
    }
    expect(sides).toEqual(['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B']);
  });

  it('gives a ten second clock, and no buzzing', () => {
    const s = firstDirected();
    expect(directedOf(s).seconds).toBe(OAC_SCORING.directedSeconds);
    expect(secondsLeft(s, T0)).toBe(10);
    // Buzzing is a tossup mechanic; it cannot touch a directed question.
    const buzzed = reduce(s, { type: 'buzz', team: 'B' }, T0 + 500);
    expect(buzzed).toBe(s);
    expect(buzzed.tossup).toBeNull();
  });

  it('honours the longer clock a calculation question declares', () => {
    // Mathematics is category 2. Its first directed question carries seconds,
    // its second leaves them unset so the prompt text has to be read.
    let s = reduce(newMatch(), { type: 'next' }, T0);
    let now = T0;
    while (!(s.stage === 'category' && s.categoryIndex === 1 && s.slot === 0)) {
      now += 100;
      s = reduce(s, { type: 'next' }, now);
    }
    expect(s.packet.categoryRound[1]?.category).toBe('Mathematics');
    expect(directedOf(s).seconds).toBe(20);

    s = reduce(s, { type: 'next' }, now + 100);
    expect(s.slot).toBe(1);
    expect(directedOf(s).question.seconds).toBe(0);
    expect(directedOf(s).seconds).toBe(20);
  });

  it('scores 2 for a correct first attempt', () => {
    const s0 = firstDirected();
    const d = directedOf(s0);
    const s = reduce(
      s0,
      { type: 'answer', team: d.team, given: d.question.answer },
      T0 + 1200,
    );
    expect(s.scores).toEqual({ A: OAC_SCORING.directedFirstAttempt, B: 0 });
    expect(s.awards.map((a) => a.reason)).toEqual(['directed-first']);
    expect(directedOf(s).phase).toBe('done');
  });

  it('scores 1 for a correct second attempt, inside the same clock', () => {
    const s0 = firstDirected();
    const d = directedOf(s0);
    let s = reduce(s0, { type: 'answer', team: d.team, given: WRONG }, T0 + 1000);
    expect(s.scores).toEqual({ A: 0, B: 0 });
    expect(directedOf(s).attempts).toBe(1);
    expect(directedOf(s).phase).toBe('running');
    // Still the original clock, not a new one.
    expect(remainingMs(s, T0 + 1000)).toBe(9000);

    s = reduce(
      s,
      { type: 'answer', team: d.team, given: d.question.answer },
      T0 + 3000,
    );
    expect(s.scores).toEqual({ A: OAC_SCORING.directedSecondAttempt, B: 0 });
    expect(s.awards.map((a) => a.reason)).toEqual(['directed-second']);
  });

  it('gives the opponent a 1 point steal on the REMAINING clock', () => {
    const s0 = firstDirected();
    const d = directedOf(s0);
    let s = reduce(s0, { type: 'answer', team: d.team, given: WRONG }, T0 + 1000);
    s = reduce(s, { type: 'answer', team: d.team, given: WRONG }, T0 + 2000);

    expect(directedOf(s).phase).toBe('steal');
    expect(onTheClock(s, T0 + 2000)).toBe(d.opponent);
    // Eight seconds of the original ten, not a fresh ten.
    expect(remainingMs(s, T0 + 2000)).toBe(8000);
    expect(remainingMs(s, T0 + 2000)).not.toBe(d.seconds * 1000);

    s = reduce(
      s,
      { type: 'answer', team: d.opponent, given: d.question.answer },
      T0 + 9000,
    );
    expect(s.scores[d.opponent]).toBe(OAC_SCORING.steal);
    expect(s.scores[d.team]).toBe(0);
    expect(s.awards.map((a) => a.reason)).toEqual(['steal']);
  });

  it('lets nobody score when both attempts are wrong and the clock expires', () => {
    const s0 = firstDirected();
    const d = directedOf(s0);
    let s = reduce(s0, { type: 'answer', team: d.team, given: WRONG }, T0 + 1000);
    s = reduce(s, { type: 'answer', team: d.team, given: WRONG }, T0 + 2000);
    expect(directedOf(s).phase).toBe('steal');

    // The steal window is what is left of the clock, so it dies with the clock.
    const expired = T0 + d.seconds * 1000 + 1;
    s = reduce(s, { type: 'tick' }, expired);
    expect(directedOf(s).phase).toBe('done');
    expect(remainingMs(s, expired)).toBeNull();
    expect(onTheClock(s, expired)).toBeNull();

    // A correct steal after time is not a steal.
    s = reduce(
      s,
      { type: 'answer', team: d.opponent, given: d.question.answer },
      expired + 50,
    );
    expect(s.scores).toEqual({ A: 0, B: 0 });
    expect(s.awards).toHaveLength(0);
  });

  it('cannot be answered at all once the clock has expired', () => {
    const s0 = firstDirected();
    const d = directedOf(s0);
    const expired = T0 + d.seconds * 1000 + 1;
    const s = reduce(
      s0,
      { type: 'answer', team: d.team, given: d.question.answer },
      expired,
    );
    expect(s.scores).toEqual({ A: 0, B: 0 });
    expect(directedOf(s).expired).toBe(true);
  });

  it('allows exactly two attempts, and ignores a third', () => {
    const s0 = firstDirected();
    const d = directedOf(s0);
    let s = reduce(s0, { type: 'answer', team: d.team, given: WRONG }, T0 + 500);
    s = reduce(s, { type: 'answer', team: d.team, given: WRONG }, T0 + 1500);
    const before = s;
    s = reduce(
      s,
      { type: 'answer', team: d.team, given: d.question.answer },
      T0 + 2500,
    );
    expect(s.scores).toEqual(before.scores);
    expect(s.attempts).toHaveLength(before.attempts.length);
  });

  it('ignores an answer from the side that is not on the clock', () => {
    const s0 = firstDirected();
    const d = directedOf(s0);
    const s = reduce(
      s0,
      { type: 'answer', team: d.opponent, given: d.question.answer },
      T0 + 1000,
    );
    expect(s.scores).toEqual({ A: 0, B: 0 });
    expect(s.attempts).toHaveLength(0);
  });

  it('treats a prompt as neither an attempt nor a score', () => {
    // A directed answerline that prompts: the alternate is accept-level here,
    // so drive the prompt path through a question whose answer prompts.
    const packet = makePacket();
    const block = packet.categoryRound[0];
    if (block === undefined) throw new Error('bad fixture');
    block.questions[0] = {
      ...block.questions[0],
      answer: '<b><u>Bill Clinton</u></b> [prompt on <u>Clinton</u>]',
      acceptable: [],
    };
    let s = reduce(createMatch(packet), { type: 'next' }, T0);
    s = reduce(s, { type: 'start' }, T0);
    const d = directedOf(s);

    s = reduce(s, { type: 'answer', team: d.team, given: 'Clinton' }, T0 + 1000);
    expect(directedOf(s).attempts).toBe(0);
    expect(directedOf(s).pendingPrompt).not.toBeNull();
    expect(s.scores).toEqual({ A: 0, B: 0 });

    // Clock untouched, and the full answer still scores the first attempt.
    expect(remainingMs(s, T0 + 1000)).toBe(9000);
    s = reduce(
      s,
      { type: 'answer', team: d.team, given: 'Bill Clinton' },
      T0 + 2000,
    );
    expect(s.scores[d.team]).toBe(OAC_SCORING.directedFirstAttempt);
  });
});

// ---------------------------------------------------------------------------
// Conferral
// ---------------------------------------------------------------------------

describe('conferral', () => {
  it('is always legal and never pauses the clock or blocks input', () => {
    const s0 = firstDirected();
    const d = directedOf(s0);
    const before = remainingMs(s0, T0 + 3000);

    let s = reduce(s0, { type: 'confer', team: d.team }, T0 + 3000);
    s = reduce(s, { type: 'confer', team: d.opponent }, T0 + 3000);
    expect(remainingMs(s, T0 + 3000)).toBe(before);
    expect(s.conferrals).toEqual({ A: 1, B: 1 });
    expect(s.scores).toEqual({ A: 0, B: 0 });
    expect(onTheClock(s, T0 + 3000)).toBe(d.team);

    // Answering after a conferral still scores normally.
    s = reduce(
      s,
      { type: 'answer', team: d.team, given: d.question.answer },
      T0 + 4000,
    );
    expect(s.scores[d.team]).toBe(OAC_SCORING.directedFirstAttempt);
  });
});

// ---------------------------------------------------------------------------
// Category tossups
// ---------------------------------------------------------------------------

function firstCategoryTossup(): { state: OacMatchState; now: number } {
  let s = reduce(newMatch(), { type: 'next' }, T0);
  let now = T0;
  while (!(s.stage === 'category' && s.slot === 2)) {
    now += 100;
    s = reduce(s, { type: 'next' }, now);
  }
  s = reduce(s, { type: 'start' }, now);
  return { state: s, now };
}

describe('category tossups', () => {
  it('is worth 2 points and reveals word by word', () => {
    const { state, now } = firstCategoryTossup();
    const t = tossupOf(state);
    expect(t.value).toBe(OAC_SCORING.categoryTossup);
    expect(revealedWordCount(t, now)).toBe(1);
    expect(revealedWordCount(t, now + 2000)).toBeGreaterThan(1);
    expect(revealedWordCount(t, now + 600_000)).toBe(t.words.length);
  });

  it('pauses the reveal on a buzz and resumes it after a miss', () => {
    const { state, now } = firstCategoryTossup();
    let s = reduce(state, { type: 'buzz', team: 'A' }, now + 2000);
    const atBuzz = revealedWordCount(tossupOf(s), now + 2000);
    expect(tossupOf(s).phase).toBe('buzzed');
    // Frozen while the buzzing team answers, however long they take.
    expect(revealedWordCount(tossupOf(s), now + 4000)).toBe(atBuzz);

    s = reduce(s, { type: 'answer', team: 'A', given: WRONG }, now + 3000);
    expect(tossupOf(s).phase).toBe('reading');
    expect(tossupOf(s).used).toEqual(['A']);
    expect(revealedWordCount(tossupOf(s), now + 3000)).toBe(atBuzz);
    expect(revealedWordCount(tossupOf(s), now + 6000)).toBeGreaterThan(atBuzz);
    // No penalty for the miss.
    expect(s.scores).toEqual({ A: 0, B: 0 });
  });

  it('gives each side one opportunity and no more', () => {
    const { state, now } = firstCategoryTossup();
    const answer = tossupOf(state).question.answer;
    let s = reduce(state, { type: 'buzz', team: 'A' }, now + 1000);
    s = reduce(s, { type: 'answer', team: 'A', given: WRONG }, now + 1500);

    // A has spent its chance; buzzing again changes nothing.
    const ignored = reduce(s, { type: 'buzz', team: 'A' }, now + 2000);
    expect(ignored).toBe(s);

    s = reduce(s, { type: 'buzz', team: 'B' }, now + 2500);
    s = reduce(s, { type: 'answer', team: 'B', given: answer }, now + 3000);
    expect(s.scores).toEqual({ A: 0, B: OAC_SCORING.categoryTossup });
    expect(tossupOf(s).phase).toBe('done');
  });

  it('closes the question when both sides miss', () => {
    const { state, now } = firstCategoryTossup();
    let s = reduce(state, { type: 'buzz', team: 'A' }, now + 1000);
    s = reduce(s, { type: 'answer', team: 'A', given: WRONG }, now + 1200);
    s = reduce(s, { type: 'buzz', team: 'B' }, now + 1400);
    s = reduce(s, { type: 'answer', team: 'B', given: WRONG }, now + 1600);
    expect(tossupOf(s).phase).toBe('done');
    expect(s.scores).toEqual({ A: 0, B: 0 });
  });

  it('spends the opportunity when the answer clock runs out', () => {
    const { state, now } = firstCategoryTossup();
    const s0 = reduce(state, { type: 'buzz', team: 'A' }, now + 1000);
    const dead = now + 1000 + state.config.tossupAnswerSeconds * 1000 + 1;
    const s = reduce(s0, { type: 'tick' }, dead);
    expect(tossupOf(s).used).toEqual(['A']);
    expect(tossupOf(s).phase).toBe('reading');
    expect(s.scores).toEqual({ A: 0, B: 0 });
  });

  it('ignores an answer from a side that does not hold the buzz', () => {
    const { state, now } = firstCategoryTossup();
    const answer = tossupOf(state).question.answer;
    const s0 = reduce(state, { type: 'buzz', team: 'A' }, now + 1000);
    const s = reduce(s0, { type: 'answer', team: 'B', given: answer }, now + 1200);
    expect(s).toBe(s0);
    expect(s.scores).toEqual({ A: 0, B: 0 });
  });
});

// ---------------------------------------------------------------------------
// Alphabet round
// ---------------------------------------------------------------------------

function toAlphabet(config: Partial<OacMatchConfig> = {}): {
  state: OacMatchState;
  now: number;
} {
  let s = reduce(newMatch(config), { type: 'next' }, T0);
  let now = T0;
  while (s.stage === 'category') {
    now += 100;
    s = reduce(s, { type: 'next' }, now);
  }
  expect(s.stage).toBe('alphabet');
  s = reduce(s, { type: 'start' }, now);
  return { state: s, now };
}

function writeSheet(
  s: OacMatchState,
  team: OacTeam,
  now: number,
  answerFor: (item: OacAlphabetItem, i: number) => string,
): OacMatchState {
  let next = s;
  next.alphabet.items.forEach((item, i) => {
    next = reduce(
      next,
      { type: 'write', team, index: i, text: answerFor(item, i) },
      now + i,
    );
  });
  return next;
}

describe('alphabet round', () => {
  it('is twenty items and four minutes, identical for both teams', () => {
    const { state, now } = toAlphabet();
    const a = state.alphabet;
    expect(a.items).toHaveLength(OAC_SCORING.alphabetItemCount);
    expect(a.items).toHaveLength(20);
    expect(a.seconds).toBe(OAC_SCORING.alphabetSeconds);
    expect(a.seconds).toBe(4 * 60);
    expect(remainingMs(state, now)).toBe(240_000);
    expect(a.letter).toBe('S');

    // One question list, two blank sheets against it.
    expect(a.sheets.A).toHaveLength(a.items.length);
    expect(a.sheets.B).toHaveLength(a.items.length);
    expect(a.sheets.A).toEqual(a.sheets.B);

    // Every answer files under the announced letter.
    for (const item of a.items) {
      expect(item.answer.charAt(0).toUpperCase()).toBe(a.letter);
    }
  });

  it('scores both teams the same for the same sheet', () => {
    const { state, now } = toAlphabet();
    let s = writeSheet(state, 'A', now, (item) => item.answer);
    s = writeSheet(s, 'B', now + 100, (item) => item.answer);
    s = reduce(s, { type: 'grade-alphabet' }, now + 1000);

    const perfect = OAC_SCORING.alphabetItemCount * OAC_SCORING.alphabetItem;
    expect(perfect).toBe(40);
    expect(s.scores).toEqual({ A: perfect, B: perfect });
    expect(s.alphabet.graded?.A).toEqual(s.alphabet.graded?.B);
  });

  it('scores two points an item and nothing for a blank or a miss', () => {
    const { state, now } = toAlphabet();
    let s = writeSheet(state, 'A', now, (item, i) => {
      if (i < 5) return item.answer;
      if (i < 10) return WRONG;
      return '';
    });
    s = reduce(s, { type: 'grade-alphabet' }, now + 1000);
    expect(s.scores.A).toBe(5 * OAC_SCORING.alphabetItem);
    expect(s.scores.B).toBe(0);
    expect(s.alphabet.graded?.A[0]).toBe('accept');
    expect(s.alphabet.graded?.A[5]).toBe('reject');
    expect(s.alphabet.graded?.A[15]).toBeNull();
  });

  it('awards no perfect bonus by default', () => {
    const { state, now } = toAlphabet();
    expect(state.config.perfectAlphabetBonus).toBe(0);
    expect(OAC_SCORING.perfectAlphabetBonus).toBe(0);
    let s = writeSheet(state, 'A', now, (item) => item.answer);
    s = reduce(s, { type: 'grade-alphabet' }, now + 1000);
    expect(s.scores.A).toBe(40);
    expect(s.awards.some((a) => a.reason === 'alphabet-perfect')).toBe(false);
  });

  it('awards the perfect bonus only when the flag is turned on', () => {
    const { state, now } = toAlphabet({ perfectAlphabetBonus: 5 });
    let s = writeSheet(state, 'A', now, (item) => item.answer);
    s = writeSheet(s, 'B', now + 50, (item, i) => (i === 0 ? WRONG : item.answer));
    s = reduce(s, { type: 'grade-alphabet' }, now + 1000);
    expect(s.scores.A).toBe(45);
    expect(s.scores.B).toBe(38);
  });

  it('stops accepting writing when the four minutes are up, and grades itself', () => {
    const { state, now } = toAlphabet();
    const dead = now + OAC_SCORING.alphabetSeconds * 1000 + 1;
    const late = reduce(state, { type: 'write', team: 'A', index: 0, text: 'Sahara' }, dead);
    expect(late.alphabet.sheets.A[0]).toBe('');

    const s = reduce(state, { type: 'tick' }, dead);
    expect(s.alphabet.phase).toBe('graded');
    expect(s.scores).toEqual({ A: 0, B: 0 });
  });

  it('ignores a write outside the sheet', () => {
    const { state, now } = toAlphabet();
    expect(reduce(state, { type: 'write', team: 'A', index: -1, text: 'x' }, now)).toBe(
      state,
    );
    expect(reduce(state, { type: 'write', team: 'A', index: 99, text: 'x' }, now)).toBe(
      state,
    );
  });
});

// ---------------------------------------------------------------------------
// A whole match
// ---------------------------------------------------------------------------

type DirectedOutcome = 'first' | 'second' | 'steal' | 'expire' | 'silent';

interface MatchPlan {
  directed(ctx: {
    categoryIndex: number;
    slot: 0 | 1;
    team: OacTeam;
  }): DirectedOutcome;
  tossup(ctx: {
    round: 'category' | 'final';
    index: number;
  }): OacTeam | 'none';
  alphabet(team: OacTeam, item: OacAlphabetItem, index: number): string;
}

/** Drives all three rounds to completion, returning the finished state. */
function playMatch(
  plan: MatchPlan,
  config: Partial<OacMatchConfig> = {},
): OacMatchState {
  let s = createMatch(makePacket(), config);
  let now = T0;
  const step = (): number => {
    now += 300;
    return now;
  };

  s = reduce(s, { type: 'next' }, step());

  const playTossup = (round: 'category' | 'final', index: number): void => {
    const t = tossupOf(s);
    const winner = plan.tossup({ round, index });
    if (winner === 'none') {
      for (const team of TEAMS) {
        s = reduce(s, { type: 'buzz', team }, step());
        s = reduce(s, { type: 'answer', team, given: WRONG }, step());
      }
      return;
    }
    s = reduce(s, { type: 'buzz', team: winner }, step());
    s = reduce(s, { type: 'answer', team: winner, given: t.question.answer }, step());
  };

  while (s.stage === 'category') {
    if (s.slot === 2) {
      if (tossupOf(s).phase === 'ready') s = reduce(s, { type: 'start' }, step());
      playTossup('category', s.categoryIndex);
    } else {
      if (directedOf(s).phase === 'ready') s = reduce(s, { type: 'start' }, step());
      const d = directedOf(s);
      const outcome = plan.directed({
        categoryIndex: s.categoryIndex,
        slot: s.slot as 0 | 1,
        team: d.team,
      });
      const correct = d.question.answer;
      if (outcome === 'first') {
        s = reduce(s, { type: 'answer', team: d.team, given: correct }, step());
      } else if (outcome === 'second') {
        s = reduce(s, { type: 'answer', team: d.team, given: WRONG }, step());
        s = reduce(s, { type: 'answer', team: d.team, given: correct }, step());
      } else if (outcome === 'steal') {
        s = reduce(s, { type: 'answer', team: d.team, given: WRONG }, step());
        s = reduce(s, { type: 'answer', team: d.team, given: WRONG }, step());
        s = reduce(s, { type: 'answer', team: d.opponent, given: correct }, step());
      } else if (outcome === 'expire') {
        s = reduce(s, { type: 'answer', team: d.team, given: WRONG }, step());
        s = reduce(s, { type: 'answer', team: d.team, given: WRONG }, step());
        now += d.seconds * 1000;
        s = reduce(s, { type: 'tick' }, now);
        s = reduce(s, { type: 'answer', team: d.opponent, given: correct }, step());
      } else {
        now += d.seconds * 1000;
        s = reduce(s, { type: 'tick' }, now);
      }
    }
    s = reduce(s, { type: 'next' }, step());
  }

  // Round 2.
  expect(s.stage).toBe('alphabet');
  s = reduce(s, { type: 'start' }, step());
  for (const team of TEAMS) {
    s.alphabet.items.forEach((item, i) => {
      s = reduce(
        s,
        { type: 'write', team, index: i, text: plan.alphabet(team, item, i) },
        (now += 10),
      );
    });
  }
  s = reduce(s, { type: 'next' }, step());

  // Round 3.
  expect(s.stage).toBe('final');
  while (s.stage === 'final') {
    if (tossupOf(s).phase === 'ready') s = reduce(s, { type: 'start' }, step());
    playTossup('final', s.finalIndex);
    s = reduce(s, { type: 'next' }, step());
  }

  expect(isMatchComplete(s)).toBe(true);
  return s;
}

/** Total printed value actually earned, counting each question once. */
function printedValueEarned(s: OacMatchState): number {
  const best = new Map<string, number>();
  for (const a of s.awards) {
    best.set(a.questionId, Math.max(best.get(a.questionId) ?? 0, a.points));
  }
  return [...best.values()].reduce((x, y) => x + y, 0);
}

describe('a full simulated match', () => {
  it('plays a perfect match for the full 140 points of packet value', () => {
    const s = playMatch({
      directed: () => 'first',
      tossup: ({ index }) => (index % 2 === 0 ? 'A' : 'B'),
      alphabet: (_team, item) => item.answer,
    });

    // Hand computed.
    //   Directed: each side is READ one of the two questions in each of the
    //   ten categories and converts it first time: 10 x 2 = 20 each.
    //   Category tossups: ten at 2, alternating winners: 5 x 2 = 10 each.
    //   Alphabet: identical worksheets, both perfect: 20 x 2 = 40 each.
    //   Final round: twenty at 2, alternating winners: 10 x 2 = 20 each.
    //   A = 20 + 10 + 40 + 20 = 90. B = 90.
    expect(s.scores).toEqual({ A: 90, B: 90 });
    expect(leader(s)).toBe('tie');

    // Every point the packet prints was earned: 20 directed at 2 plus 10
    // category tossups at 2 is 60, the worksheet is 40, the final round is 40.
    expect(printedValueEarned(s)).toBe(140);
    expect(printedValueEarned(s)).toBe(OAC_SCORING.maxScore);
    expect(maxAvailableScore(s.packet)).toBe(OAC_SCORING.maxScore);

    // No award in this format is ever bigger than a tossup. No bonuses.
    for (const award of s.awards) {
      expect([
        OAC_SCORING.steal,
        OAC_SCORING.directedFirstAttempt,
      ]).toContain(award.points);
    }
    expect(s.awards.some((a) => a.points >= 10)).toBe(false);
  });

  it('caps one team at 130, the most the alternation rule can reach', () => {
    const s = playMatch({
      // A converts its own directed questions; B misses both of its attempts
      // every time, so A steals for 1.
      directed: ({ team }) => (team === 'A' ? 'first' : 'steal'),
      tossup: () => 'A',
      alphabet: (team, item) => (team === 'A' ? item.answer : WRONG),
    });

    // Hand computed, team A taking everything available to one side:
    //   10 own directed at 2            = 20
    //   10 steals at 1                  = 10
    //   10 category tossups at 2        = 20
    //   perfect alphabet, 20 at 2       = 40
    //   20 final tossups at 2           = 40
    //                                   = 130
    expect(s.scores).toEqual({ A: 130, B: 0 });
    expect(maxReachableScore(s.packet)).toBe(130);
    expect(s.scores.A).toBeLessThanOrEqual(maxReachableScore(s.packet));
    expect(s.scores.A).toBeLessThanOrEqual(OAC_SCORING.maxScore);
    expect(leader(s)).toBe('A');
  });

  it('scores a match where everything is missed as nil all', () => {
    const s = playMatch({
      directed: () => 'expire',
      tossup: () => 'none',
      alphabet: () => WRONG,
    });
    expect(s.scores).toEqual({ A: 0, B: 0 });
    expect(s.awards).toHaveLength(0);
    expect(s.attempts.length).toBeGreaterThan(0);
  });

  it('mixes outcomes and lands on a hand-computed score', () => {
    const s = playMatch({
      directed: ({ categoryIndex, team }) => {
        if (categoryIndex % 3 === 0) return 'first';
        if (categoryIndex % 3 === 1) return 'second';
        return team === 'A' ? 'steal' : 'expire';
      },
      tossup: ({ round, index }) =>
        round === 'category' ? (index % 2 === 0 ? 'A' : 'none') : 'B',
      alphabet: (team, item, i) =>
        team === 'A' ? (i < 12 ? item.answer : WRONG) : item.answer,
    });

    // Hand computed.
    // Categories 0, 3, 6, 9 -> both directed questions converted first time:
    //   four categories, each giving A 2 and B 2            A 8   B 8
    // Categories 1, 4, 7 -> both converted on the second attempt:
    //   three categories, each giving A 1 and B 1           A 3   B 3
    // Categories 2, 5, 8 -> the A-directed question is stolen by B for 1,
    //   and the B-directed question expires with nobody scoring:
    //   three categories, each giving B 1                   A 0   B 3
    // Category tossups: even categories (0, 2, 4, 6, 8) to A at 2, odd ones
    //   missed by both sides:                               A 10  B 0
    // Alphabet: A gets 12 of 20 right, B all 20:            A 24  B 40
    // Final round: all twenty to B at 2:                    A 0   B 40
    //                                              totals:  A 45  B 94
    expect(s.scores).toEqual({ A: 45, B: 94 });
    expect(leader(s)).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// The no-negative-score invariant
// ---------------------------------------------------------------------------

describe('no code path can produce a negative score', () => {
  it('refuses any award that is not a positive whole number', () => {
    expect(clampAward(-1)).toBe(0);
    expect(clampAward(-0.5)).toBe(0);
    expect(clampAward(-Infinity)).toBe(0);
    expect(clampAward(Number.NaN)).toBe(0);
    expect(clampAward(0)).toBe(0);
    expect(clampAward(-0)).toBe(0);
    expect(clampAward(1.9)).toBe(1);
    expect(clampAward(2)).toBe(2);
  });

  it('clamps a negative perfect-alphabet bonus in config', () => {
    const s = createMatch(makePacket(), { perfectAlphabetBonus: -25 });
    expect(s.config.perfectAlphabetBonus).toBe(0);
  });

  it('never lets a score fall or go below zero, over a fuzzed match', () => {
    // Deterministic PRNG so a failure is reproducible.
    let seed = 0x9e3779b9;
    const rand = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T,>(xs: readonly T[]): T => {
      const value = xs[Math.floor(rand() * xs.length)];
      if (value === undefined) throw new Error('empty pick');
      return value;
    };

    let s = createMatch(makePacket(), { perfectAlphabetBonus: 5 });
    let now = T0;
    let previousA = 0;
    let previousB = 0;

    for (let i = 0; i < 4000; i++) {
      const team = pick(TEAMS);
      // Deliberately includes illegal and out-of-order moves: answering with
      // no question armed, buzzing on a directed question, answering out of
      // turn, writing on the worksheet mid-tossup, grading twice, skipping
      // ahead, and jumping the clock past every deadline.
      const given = pick([
        WRONG,
        '',
        s.directed?.question.answer ?? WRONG,
        s.tossup?.question.answer ?? WRONG,
        s.alphabet.items[Math.floor(rand() * s.alphabet.items.length)]?.answer ??
          WRONG,
      ]);
      const action = pick<OacAction>([
        { type: 'start' },
        { type: 'buzz', team },
        { type: 'answer', team, given },
        { type: 'confer', team },
        { type: 'write', team, index: Math.floor(rand() * 25) - 2, text: given },
        { type: 'grade-alphabet' },
        { type: 'tick' },
        { type: 'next' },
      ]);

      now += Math.floor(rand() * 9000);
      s = reduce(s, action, now);

      expect(s.scores.A).toBeGreaterThanOrEqual(0);
      expect(s.scores.B).toBeGreaterThanOrEqual(0);
      expect(s.scores.A).toBeGreaterThanOrEqual(previousA);
      expect(s.scores.B).toBeGreaterThanOrEqual(previousB);
      expect(Number.isInteger(s.scores.A)).toBe(true);
      expect(Number.isInteger(s.scores.B)).toBe(true);
      previousA = s.scores.A;
      previousB = s.scores.B;
    }

    // Nothing in the stream could mint an award that is not a real OAC value.
    for (const award of s.awards) {
      expect(award.points).toBeGreaterThan(0);
      expect([1, 2, 5]).toContain(award.points);
    }
    for (const attempt of s.attempts) {
      expect(attempt.points).toBeGreaterThanOrEqual(0);
    }
    // And a fuzzed match still cannot exceed the packet's printed value.
    expect(s.scores.A).toBeLessThanOrEqual(OAC_SCORING.maxScore + 5);
    expect(s.scores.B).toBeLessThanOrEqual(OAC_SCORING.maxScore + 5);
  });

  it('logs OAC attempts with non-negative points and no power mark', () => {
    const s = playMatch({
      directed: () => 'second',
      tossup: () => 'A',
      alphabet: (_team, item) => item.answer,
    });
    const events = s.attempts.map((a) => toAttemptEvent(a, s.packet.setName));
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.mode).toBe('oac');
      expect(e.points).toBeGreaterThanOrEqual(0);
      expect(e.powerWordIndex).toBeNull();
    }
  });
});
