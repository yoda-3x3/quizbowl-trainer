import { describe, expect, it } from 'vitest';
import type { AttemptEvent } from '../../types';
import { tally } from '../tossupTally';

function ev(p: Partial<AttemptEvent>): AttemptEvent {
  return {
    id: Math.random().toString(36),
    at: 0,
    mode: 'tossup',
    questionId: 'q',
    category: 'Science',
    subcategory: 'Physics',
    difficulty: 3,
    buzzWordIndex: null,
    totalWords: 100,
    powerWordIndex: 40,
    givenAnswer: '',
    directive: null,
    points: 0,
    msToAnswer: null,
    ...p,
  } as AttemptEvent;
}

describe('tally', () => {
  it('is empty with no events', () => {
    expect(tally([])).toEqual({ powers: 0, tens: 0, negs: 0, celerity: null });
  });

  it('splits powers, tens and negs and averages celerity over correct buzzes', () => {
    const t = tally([
      ev({ directive: 'accept', buzzWordIndex: 19, points: 15 }), // power, cel 0.8
      ev({ directive: 'accept', buzzWordIndex: 59, points: 10 }), // ten, cel 0.4
      ev({ directive: 'reject', buzzWordIndex: 10, points: -5 }), // neg
      ev({ directive: 'reject', buzzWordIndex: 99, points: 0 }), // wrong at end, no neg
      ev({ directive: null, points: 0 }), // skipped
    ]);
    expect(t.powers).toBe(1);
    expect(t.tens).toBe(1);
    expect(t.negs).toBe(1);
    expect(t.celerity).toBeCloseTo(0.6);
  });

  it('ignores ear-training events', () => {
    expect(tally([ev({ mode: 'ear', directive: 'accept', buzzWordIndex: 1, points: 10 })]).tens).toBe(0);
  });
});
