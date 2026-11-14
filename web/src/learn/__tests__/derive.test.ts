import { describe, expect, it } from 'vitest';
import type { AttemptEvent } from '../../types';
import {
  buzzDistribution,
  findKnowableIndex,
  knownTerms,
  missedQuestions,
  progressOverTime,
  summary,
  weakSpots,
} from '../derive';

let seq = 0;

function ev(over: Partial<AttemptEvent> = {}): AttemptEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    at: Date.UTC(2026, 0, 5) + seq * 60_000,
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

describe('weakSpots', () => {
  it('ignores subcategories below the attempt threshold', () => {
    const spots = weakSpots([ev(), ev()], 3);
    expect(spots).toHaveLength(0);
  });

  it('sorts worst accuracy first', () => {
    const events = [
      ...Array.from({ length: 4 }, () =>
        ev({ subcategory: 'Mythology', directive: 'reject' }),
      ),
      ...Array.from({ length: 4 }, () =>
        ev({ subcategory: 'Biology', directive: 'accept' }),
      ),
    ];
    const spots = weakSpots(events, 3);
    expect(spots[0]?.subcategory).toBe('Mythology');
    expect(spots[0]?.accuracy).toBe(0);
    expect(spots[1]?.subcategory).toBe('Biology');
    expect(spots[1]?.accuracy).toBe(1);
  });

  it('breaks accuracy ties by sample size, so evidence wins', () => {
    const events = [
      ...Array.from({ length: 3 }, () =>
        ev({ subcategory: 'Small', directive: 'reject' }),
      ),
      ...Array.from({ length: 9 }, () =>
        ev({ subcategory: 'Large', directive: 'reject' }),
      ),
    ];
    const spots = weakSpots(events, 3);
    expect(spots[0]?.subcategory).toBe('Large');
  });

  it('reports a positive trend when the back half is better', () => {
    const events = [
      ...Array.from({ length: 4 }, () =>
        ev({ subcategory: 'Physics', directive: 'reject' }),
      ),
      ...Array.from({ length: 4 }, () =>
        ev({ subcategory: 'Physics', directive: 'accept' }),
      ),
    ];
    const spot = weakSpots(events, 3)[0];
    expect(spot?.trend).toBeGreaterThan(0);
  });

  it('leaves trend null without enough history', () => {
    const events = Array.from({ length: 4 }, () =>
      ev({ subcategory: 'Physics' }),
    );
    expect(weakSpots(events, 3)[0]?.trend).toBeNull();
  });

  it('excludes ear training from accuracy', () => {
    const events = [
      ...Array.from({ length: 3 }, () => ev({ subcategory: 'Opera' })),
      ev({ subcategory: 'Opera', mode: 'ear', directive: 'reject' }),
    ];
    expect(weakSpots(events, 3)[0]?.attempts).toBe(3);
  });
});

describe('knownTerms and findKnowableIndex', () => {
  it('learns terms only from correctly answered questions', () => {
    const terms = knownTerms([
      ev({
        directive: 'accept',
        questionSnapshot: {
          questionSanitized: 'q',
          answerSanitized: 'Filippo Brunelleschi',
          setName: 's',
        },
      }),
      ev({
        directive: 'reject',
        questionSnapshot: {
          questionSanitized: 'q',
          answerSanitized: 'Donatello',
          setName: 's',
        },
      }),
    ]);
    expect(terms.has('brunelleschi')).toBe(true);
    expect(terms.has('donatello')).toBe(false);
  });

  it('drops bracketed directives from the answer line', () => {
    const terms = knownTerms([
      ev({
        questionSnapshot: {
          questionSanitized: 'q',
          answerSanitized: 'Diana [prompt on Artemis]',
          setName: 's',
        },
      }),
    ]);
    expect(terms.has('diana')).toBe(true);
    expect(terms.has('artemis')).toBe(false);
  });

  it('finds the earliest word mentioning something already known', () => {
    const words = 'This sculptor trained under Brunelleschi in Florence'.split(
      ' ',
    );
    const idx = findKnowableIndex(words, new Set(['brunelleschi']));
    expect(idx).toBe(4);
  });

  it('matches through possessives and plurals', () => {
    const words = "Describing Brunelleschi's dome".split(' ');
    expect(findKnowableIndex(words, new Set(['brunelleschi']))).toBe(1);
    expect(findKnowableIndex(['sonatas'], new Set(['sonata']))).toBe(0);
  });

  it('returns null when nothing in the question is known', () => {
    const words = 'An entirely unfamiliar clue about nothing'.split(' ');
    expect(findKnowableIndex(words, new Set(['brunelleschi']))).toBeNull();
  });

  it('does not match on stopwords or short tokens', () => {
    expect(findKnowableIndex(['this', 'that'], new Set(['this']))).toBeNull();
    expect(findKnowableIndex(['oak'], new Set(['oak']))).toBeNull();
  });
});

describe('missedQuestions', () => {
  it('pairs the actual buzz with the earliest knowable word', () => {
    const history = [
      ev({
        directive: 'accept',
        questionSnapshot: {
          questionSanitized: 'earlier question',
          answerSanitized: 'Brunelleschi',
          setName: 's',
        },
      }),
      ev({
        directive: 'reject',
        buzzWordIndex: 7,
        questionSnapshot: {
          questionSanitized:
            'This architect studied Brunelleschi before designing the famous dome today',
          answerSanitized: 'Someone Else',
          setName: 's',
        },
      }),
    ];
    const misses = missedQuestions(history, { wpm: 150 });
    expect(misses).toHaveLength(1);
    expect(misses[0]?.knowableWordIndex).toBe(3);
    expect(misses[0]?.buzzWordIndex).toBe(7);
    expect(misses[0]?.secondsLate).toBeGreaterThan(0);
  });

  it('leaves secondsLate null when nothing was knowable', () => {
    const misses = missedQuestions(
      [
        ev({
          directive: 'reject',
          questionSnapshot: {
            questionSanitized: 'completely unfamiliar territory here',
            answerSanitized: 'Unknown',
            setName: 's',
          },
        }),
      ],
      { wpm: 150 },
    );
    expect(misses[0]?.knowableWordIndex).toBeNull();
    expect(misses[0]?.secondsLate).toBeNull();
  });

  it('excludes correct answers', () => {
    const misses = missedQuestions(
      [
        ev({
          directive: 'accept',
          questionSnapshot: {
            questionSanitized: 'a question',
            answerSanitized: 'Right',
            setName: 's',
          },
        }),
      ],
      { wpm: 150 },
    );
    expect(misses).toHaveLength(0);
  });

  it('returns nothing for an empty log, so the chapter can show an empty state', () => {
    expect(missedQuestions([], { wpm: 150 })).toEqual([]);
  });
});

describe('buzzDistribution', () => {
  it('buckets buzzes into deciles of the question', () => {
    const d = buzzDistribution([
      ev({ buzzWordIndex: 4, totalWords: 100 }), // 5% -> decile 0
      ev({ buzzWordIndex: 49, totalWords: 100 }), // 50% -> decile 5
      ev({ buzzWordIndex: 99, totalWords: 100 }), // 100% -> clamped to 9
    ]);
    expect(d[0]?.count).toBe(1);
    expect(d[5]?.count).toBe(1);
    expect(d[9]?.count).toBe(1);
    expect(d).toHaveLength(10);
  });

  it('ignores questions that were never buzzed', () => {
    const d = buzzDistribution([ev({ buzzWordIndex: null })]);
    expect(d.reduce((a, b) => a + b.count, 0)).toBe(0);
  });
});

describe('progressOverTime and summary', () => {
  it('groups attempts by week in order', () => {
    const points = progressOverTime([
      ev({ at: Date.UTC(2026, 0, 5) }),
      ev({ at: Date.UTC(2026, 0, 6) }),
      ev({ at: Date.UTC(2026, 0, 19) }),
    ]);
    expect(points).toHaveLength(2);
    expect(points[0]?.attempts).toBe(2);
    expect(points[1]?.attempts).toBe(1);
    expect(points[0]?.weekStart).toBeLessThan(points[1]?.weekStart as number);
  });

  it('computes a power rate from in-power correct buzzes', () => {
    const s = summary([
      ev({ buzzWordIndex: 5, powerWordIndex: 20, directive: 'accept' }),
      ev({ buzzWordIndex: 30, powerWordIndex: 20, directive: 'accept' }),
    ]);
    expect(s.powerRate).toBe(0.5);
    expect(s.accuracy).toBe(1);
  });

  it('survives an empty log without dividing by zero', () => {
    const s = summary([]);
    expect(s.heard).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.meanBuzzFraction).toBeNull();
    expect(Number.isNaN(s.powerRate)).toBe(false);
  });
});
