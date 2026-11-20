import { describe, expect, it } from 'vitest';
import type { AttemptEvent } from '../../types';
import {
  currentStreak,
  streakAtRisk,
  streakSummary,
  todaysLessons,
  xpForEvent,
  xpTotal,
} from '../streak';

const DAY = 24 * 60 * 60 * 1000;

let seq = 0;
function ev(over: Partial<AttemptEvent> = {}): AttemptEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    at: Date.UTC(2026, 10, 15, 12, 0, 0) + seq * 60_000,
    mode: 'tossup',
    questionId: `q${seq}`,
    category: 'Fine Arts',
    subcategory: 'Visual Fine Arts',
    difficulty: 3,
    buzzWordIndex: 10,
    totalWords: 50,
    powerWordIndex: 20,
    givenAnswer: 'x',
    directive: 'accept',
    points: 15,
    msToAnswer: 1200,
    ...over,
  };
}

describe('currentStreak', () => {
  const today = Date.UTC(2026, 10, 15, 23, 0, 0);

  it('is zero with no events', () => {
    expect(currentStreak([], today)).toBe(0);
  });

  it('counts a single day when the latest correct is today', () => {
    const events = [ev({ at: today - 5 * 60_000, directive: 'accept' })];
    expect(currentStreak(events, today)).toBe(1);
  });

  it('is still alive on a day the player has not played yet (yesterday counts)', () => {
    const events = [ev({ at: today - DAY, directive: 'accept' })];
    expect(currentStreak(events, today)).toBe(1);
    expect(streakAtRisk(events, today)).toBe(true);
  });

  it('is zero when neither today nor yesterday has a correct event', () => {
    const events = [ev({ at: today - 3 * DAY, directive: 'accept' })];
    expect(currentStreak(events, today)).toBe(0);
    expect(streakAtRisk(events, today)).toBe(false);
  });

  it('counts consecutive UTC days backwards from today', () => {
    const events = [
      ev({ at: today - 2 * DAY, directive: 'accept' }),
      ev({ at: today - 1 * DAY, directive: 'accept' }),
      ev({ at: today, directive: 'accept' }),
    ];
    expect(currentStreak(events, today)).toBe(3);
    expect(streakAtRisk(events, today)).toBe(false);
  });

  it('breaks the streak on a gap day even with later activity', () => {
    const events = [
      ev({ at: today - 4 * DAY, directive: 'accept' }),
      // gap at today-3
      ev({ at: today - 2 * DAY, directive: 'accept' }),
      ev({ at: today - 1 * DAY, directive: 'accept' }),
      ev({ at: today, directive: 'accept' }),
    ];
    expect(currentStreak(events, today)).toBe(3);
  });

  it('ignores events that are not correct tossups', () => {
    const events = [
      ev({ at: today, directive: 'reject' }),
      ev({ at: today, mode: 'bonus', directive: 'accept' }),
    ];
    expect(currentStreak(events, today)).toBe(0);
  });
});

describe('xpTotal / xpForEvent', () => {
  it('is 2 for powered, 1 for non-powered, 0 for incorrect', () => {
    expect(
      xpForEvent(ev({ directive: 'accept', buzzWordIndex: 10, powerWordIndex: 20 })),
    ).toBe(2);
    expect(
      xpForEvent(ev({ directive: 'accept', buzzWordIndex: 30, powerWordIndex: 20 })),
    ).toBe(1);
    expect(
      xpForEvent(ev({ directive: 'accept', buzzWordIndex: 30, powerWordIndex: null })),
    ).toBe(1);
    expect(xpForEvent(ev({ directive: 'reject' }))).toBe(0);
  });

  it('skips non-tossup events', () => {
    expect(
      xpForEvent(ev({ mode: 'bonus', directive: 'accept' })),
    ).toBe(0);
  });

  it('sums across the log', () => {
    const events = [
      ev({ directive: 'accept', buzzWordIndex: 10, powerWordIndex: 20 }), // +2
      ev({ directive: 'accept', buzzWordIndex: 30, powerWordIndex: 20 }), // +1
      ev({ directive: 'reject' }), // 0
      ev({ mode: 'bonus', directive: 'accept' }), // 0
    ];
    expect(xpTotal(events)).toBe(3);
  });
});

describe('todaysLessons', () => {
  const today = Date.UTC(2026, 10, 15, 10, 0, 0);

  it('counts unique lessonIds tagged on today\'s events', () => {
    const events = [
      ev({ at: today - 1000, lessonId: 'lit-1', lessonSeq: 0 }),
      ev({ at: today - 500, lessonId: 'lit-1', lessonSeq: 1 }),
      ev({ at: today - 100, lessonId: 'his-1', lessonSeq: 0 }),
    ];
    expect(todaysLessons(events, today)).toBe(2);
  });

  it('ignores events without a lessonId', () => {
    const events = [
      ev({ at: today - 1000 }),
      ev({ at: today - 500, lessonId: 'lit-1', lessonSeq: 0 }),
    ];
    expect(todaysLessons(events, today)).toBe(1);
  });

  it('ignores events from previous days', () => {
    const events = [
      ev({ at: today - 2 * DAY, lessonId: 'old', lessonSeq: 0 }),
      ev({ at: today, lessonId: 'new', lessonSeq: 0 }),
    ];
    expect(todaysLessons(events, today)).toBe(1);
  });
});

describe('streakSummary', () => {
  it('bundles streak, risk, xp and lessonsToday under one call', () => {
    const today = Date.UTC(2026, 10, 15, 12, 0, 0);
    const events = [
      ev({ at: today - DAY, directive: 'accept', buzzWordIndex: 5, powerWordIndex: 10 }),
      ev({ at: today, directive: 'accept', buzzWordIndex: 30, powerWordIndex: 20, lessonId: 'lit-1', lessonSeq: 0 }),
    ];
    const s = streakSummary(events, 3, today);
    expect(s.streak).toBe(2);
    expect(s.atRisk).toBe(false);
    expect(s.xp).toBe(3);
    expect(s.lessonsToday).toBe(1);
    expect(s.dailyGoal).toBe(3);
  });
});
