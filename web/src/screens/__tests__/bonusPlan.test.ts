import { describe, expect, it } from 'vitest';
import { bonusPlan, DEFAULT_PART_VALUE } from '../Bonus';
import type { Bonus } from '../../types';

function make(over: Partial<Bonus>): Bonus {
  return {
    id: 'b1',
    leadin: 'Leadin.',
    leadinSanitized: 'Leadin.',
    parts: ['part one', 'part two', 'part three'],
    partsSanitized: ['part one', 'part two', 'part three'],
    answers: ['<b><u>one</u></b>', '<b><u>two</u></b>', '<b><u>three</u></b>'],
    answersSanitized: ['one', 'two', 'three'],
    category: 'History',
    subcategory: 'American History',
    difficulty: 3,
    setName: 'Test Set',
    source: 'qbreader',
    ...over,
  };
}

describe('bonusPlan', () => {
  it('pairs three parts with three answers at ten points each', () => {
    const plan = bonusPlan(make({}));
    expect(plan.parts.length).toBe(3);
    expect(plan.max).toBe(30);
    expect(plan.truncated).toBe(false);
    expect(plan.parts.every((p) => p.value === DEFAULT_PART_VALUE)).toBe(true);
  });

  it('honours declared values', () => {
    const plan = bonusPlan(make({ values: [10, 15, 5] }));
    expect(plan.parts.map((p) => p.value)).toEqual([10, 15, 5]);
    expect(plan.max).toBe(30);
  });

  it('truncates when there are more parts than answers', () => {
    const plan = bonusPlan(
      make({
        answers: ['<b><u>one</u></b>', '<b><u>two</u></b>'],
        answersSanitized: ['one', 'two'],
      }),
    );
    expect(plan.parts.length).toBe(2);
    expect(plan.truncated).toBe(true);
    expect(plan.max).toBe(20);
  });

  it('truncates when there are more answers than parts', () => {
    const plan = bonusPlan(
      make({ parts: ['only one'], partsSanitized: ['only one'] }),
    );
    expect(plan.parts.length).toBe(1);
    expect(plan.truncated).toBe(true);
  });

  it('prefers the HTML answerline, which the judge wants', () => {
    const plan = bonusPlan(make({}));
    expect(plan.parts[0]?.answer).toBe('<b><u>one</u></b>');
    expect(plan.parts[0]?.answerSanitized).toBe('one');
  });

  it('falls back to the raw part text when the sanitized text is missing', () => {
    const plan = bonusPlan(make({ partsSanitized: [] }));
    expect(plan.parts[0]?.prompt).toBe('part one');
  });

  it('survives a bonus with no answers at all', () => {
    const plan = bonusPlan(make({ answers: [], answersSanitized: [] }));
    expect(plan.parts).toEqual([]);
    expect(plan.max).toBe(0);
    expect(plan.truncated).toBe(true);
  });
});
