import { describe, expect, it } from 'vitest';
import type { AttemptEvent } from '../../types';
import { reviewQueue, teaser } from '../reviewQueue';

const DAY = 24 * 60 * 60 * 1000;

let seq = 0;
function ev(over: Partial<AttemptEvent> = {}): AttemptEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    at: Date.UTC(2026, 10, 10, 12, 0, 0) + seq * 60_000,
    mode: 'tossup',
    questionId: `q${seq}`,
    category: 'Fine Arts',
    subcategory: 'Visual Fine Arts',
    difficulty: 3,
    buzzWordIndex: 10,
    totalWords: 50,
    powerWordIndex: 20,
    givenAnswer: 'x',
    directive: 'reject',
    points: 0,
    msToAnswer: 1200,
    questionSnapshot: {
      questionSanitized: 'A tossup about something',
      answerSanitized: 'An answer',
      setName: 'Test Set',
    },
    ...over,
  };
}

describe('reviewQueue', () => {
  const now = Date.UTC(2026, 10, 20, 0, 0, 0);

  it('returns nothing for an empty log', () => {
    expect(reviewQueue([], { now })).toEqual([]);
  });

  it('includes a question that was missed at least once', () => {
    const items = reviewQueue(
      [ev({ questionId: 'q-miss', directive: 'reject', at: now - 3 * DAY })],
      { now },
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.questionId).toBe('q-miss');
    expect(items[0]?.missCount).toBe(1);
  });

  it('excludes a question that was never missed', () => {
    const items = reviewQueue(
      [ev({ questionId: 'q-ok', directive: 'accept', at: now - 3 * DAY })],
      { now },
    );
    expect(items).toEqual([]);
  });

  it('counts every miss on the same question', () => {
    const items = reviewQueue(
      [
        ev({ questionId: 'q-bad', directive: 'reject', at: now - 5 * DAY }),
        ev({ questionId: 'q-bad', directive: 'reject', at: now - 4 * DAY }),
        ev({ questionId: 'q-bad', directive: 'reject', at: now - 3 * DAY }),
      ],
      { now },
    );
    expect(items[0]?.missCount).toBe(3);
  });

  it('keeps a missed question around even after a later correct attempt', () => {
    const items = reviewQueue(
      [
        ev({ questionId: 'q-recovered', directive: 'reject', at: now - 5 * DAY }),
        ev({ questionId: 'q-recovered', directive: 'accept', at: now - 3 * DAY }),
      ],
      { now },
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.missCount).toBe(1);
  });

  it('holds back items touched inside the cooldown window', () => {
    // Default cooldown is 24h.
    const items = reviewQueue(
      [ev({ questionId: 'q-fresh', directive: 'reject', at: now - 6 * 60 * 60 * 1000 })],
      { now },
    );
    expect(items).toEqual([]);
  });

  it('respects an explicit cooldownMs', () => {
    const base = ev({
      questionId: 'q-tight',
      directive: 'reject',
      at: now - 2 * 60 * 60 * 1000, // 2h ago
    });
    // A one-hour cooldown lets it through.
    expect(reviewQueue([base], { now, cooldownMs: 60 * 60 * 1000 })).toHaveLength(1);
    // A three-hour cooldown holds it back.
    expect(reviewQueue([base], { now, cooldownMs: 3 * 60 * 60 * 1000 })).toHaveLength(0);
  });

  it('orders by miss count descending, then by oldest lastSeen first', () => {
    const items = reviewQueue(
      [
        ev({ questionId: 'q-a', directive: 'reject', at: now - 5 * DAY }),
        ev({ questionId: 'q-a', directive: 'reject', at: now - 4 * DAY }),
        ev({ questionId: 'q-b', directive: 'reject', at: now - 10 * DAY }),
        ev({ questionId: 'q-c', directive: 'reject', at: now - 3 * DAY }),
      ],
      { now },
    );
    // q-a has 2 misses so it comes first.
    expect(items[0]?.questionId).toBe('q-a');
    // Among single-miss items, q-b was seen longest ago so it precedes q-c.
    expect(items[1]?.questionId).toBe('q-b');
    expect(items[2]?.questionId).toBe('q-c');
  });

  it('honours the limit option', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      ev({
        questionId: `q-${i}`,
        directive: 'reject',
        at: now - (10 + i) * DAY,
      }),
    );
    expect(reviewQueue(events, { now, limit: 3 })).toHaveLength(3);
  });

  it('carries the snapshot fields onto the ReviewItem', () => {
    const items = reviewQueue(
      [
        ev({
          questionId: 'q-snap',
          directive: 'reject',
          at: now - 3 * DAY,
          category: 'History',
          subcategory: 'American History',
          difficulty: 4,
          questionSnapshot: {
            questionSanitized: 'Who said that thing?',
            answerSanitized: 'Someone Important',
            setName: '2024 NASAT',
          },
        }),
      ],
      { now },
    );
    expect(items[0]?.category).toBe('History');
    expect(items[0]?.subcategory).toBe('American History');
    expect(items[0]?.difficulty).toBe(4);
    expect(items[0]?.questionSanitized).toBe('Who said that thing?');
    expect(items[0]?.answerSanitized).toBe('Someone Important');
    expect(items[0]?.setName).toBe('2024 NASAT');
  });

  it('drops events without a questionSnapshot (old logs)', () => {
    const items = reviewQueue(
      [
        ev({
          questionId: 'q-no-snap',
          directive: 'reject',
          at: now - 3 * DAY,
          questionSnapshot: undefined,
        }),
      ],
      { now },
    );
    expect(items).toEqual([]);
  });

  it('ignores non-tossup events', () => {
    const items = reviewQueue(
      [
        ev({
          questionId: 'q-bonus',
          mode: 'bonus',
          directive: 'reject',
          at: now - 3 * DAY,
        }),
      ],
      { now },
    );
    expect(items).toEqual([]);
  });
});

describe('teaser', () => {
  it('returns the question unchanged when short enough', () => {
    expect(teaser('short question')).toBe('short question');
  });

  it('trims surrounding whitespace', () => {
    expect(teaser('   hello   ')).toBe('hello');
  });

  it('truncates with an ellipsis past the limit', () => {
    const long = 'word '.repeat(50).trim();
    const out = teaser(long, 40);
    expect(out.length).toBe(40);
    expect(out.endsWith('…')).toBe(true);
  });
});
