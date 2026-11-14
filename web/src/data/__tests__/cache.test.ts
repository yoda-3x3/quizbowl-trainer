import { beforeEach, describe, expect, it } from 'vitest';
import {
  CACHE_LIMIT,
  cacheBonuses,
  cacheCounts,
  cacheTossups,
  cachedBonuses,
  cachedTossups,
  clearCache,
  isCacheEphemeral,
  pickUnseen,
  __resetCache,
} from '../cache';
import type { Bonus, Tossup } from '../../types';

// There is no indexedDB in the node test environment, which exercises the same
// fallback path as private mode and blocked site data.

function tossup(id: string): Tossup {
  return {
    id,
    question: `<b>Question ${id}</b>`,
    questionSanitized: `Question ${id} (*) giveaway`,
    answer: '<b><u>Answer</u></b>',
    answerSanitized: 'Answer',
    category: 'Science',
    subcategory: 'Biology',
    difficulty: 4,
    setName: 'Test Set',
    setYear: 2024,
    packetNumber: 1,
    questionNumber: 1,
    source: 'qbreader',
  };
}

function bonus(id: string): Bonus {
  return {
    id,
    leadin: 'Leadin',
    leadinSanitized: 'Leadin',
    parts: ['part one'],
    partsSanitized: ['part one'],
    answers: ['<b><u>one</u></b>'],
    answersSanitized: ['one'],
    category: 'History',
    subcategory: 'American History',
    difficulty: 3,
    setName: 'Test Set',
    source: 'qbreader',
  };
}

beforeEach(async () => {
  await clearCache();
  __resetCache();
});

describe('the memory fallback', () => {
  it('round-trips tossups when storage is unavailable', async () => {
    await cacheTossups([tossup('a'), tossup('b')]);
    const rows = await cachedTossups();
    expect(rows.map((t) => t.id).sort()).toEqual(['a', 'b']);
    expect(isCacheEphemeral()).toBe(true);
  });

  it('round-trips bonuses', async () => {
    await cacheBonuses([bonus('x')]);
    expect((await cachedBonuses()).map((b) => b.id)).toEqual(['x']);
  });

  it('keeps the question data intact', async () => {
    await cacheTossups([tossup('keep')]);
    const [row] = await cachedTossups();
    expect(row?.questionSanitized).toContain('(*)');
    expect(row?.answer).toBe('<b><u>Answer</u></b>');
  });

  it('does not duplicate a re-cached question', async () => {
    await cacheTossups([tossup('same')]);
    await cacheTossups([tossup('same')]);
    expect((await cachedTossups()).length).toBe(1);
  });

  it('counts both stores', async () => {
    await cacheTossups([tossup('a')]);
    await cacheBonuses([bonus('b1'), bonus('b2')]);
    expect(await cacheCounts()).toEqual({ tossups: 1, bonuses: 2 });
  });

  it('ignores an empty write', async () => {
    await cacheTossups([]);
    expect((await cachedTossups()).length).toBe(0);
  });

  it('stays bounded at the cache limit', async () => {
    const many = Array.from({ length: CACHE_LIMIT + 25 }, (_, i) =>
      tossup(`t${i}`),
    );
    await cacheTossups(many);
    expect((await cachedTossups()).length).toBe(CACHE_LIMIT);
  });

  it('clears', async () => {
    await cacheTossups([tossup('a')]);
    await clearCache();
    expect((await cachedTossups()).length).toBe(0);
  });
});

describe('pickUnseen', () => {
  it('returns the first unplayed question', () => {
    const items = [tossup('a'), tossup('b'), tossup('c')];
    expect(pickUnseen(items, new Set(['a']))?.id).toBe('b');
  });

  it('falls back to the oldest when everything has been played', () => {
    const items = [tossup('a'), tossup('b')];
    expect(pickUnseen(items, new Set(['a', 'b']))?.id).toBe('b');
  });

  it('returns null for an empty cache', () => {
    expect(pickUnseen([], new Set())).toBe(null);
  });
});
