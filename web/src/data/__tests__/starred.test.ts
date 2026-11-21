import { beforeEach, describe, expect, it } from 'vitest';
import {
  isStarred,
  isStarredEphemeral,
  listStarred,
  star,
  starredCount,
  unstar,
  __resetStarred,
} from '../starred';
import type { Tossup } from '../../types';

// There is no indexedDB in the node test environment, which exercises the same
// fallback path as private mode and blocked site data (see cache.test.ts).

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

beforeEach(() => {
  __resetStarred();
});

describe('the memory fallback', () => {
  it('stars and lists a question', async () => {
    await star(tossup('a'));
    expect((await listStarred()).map((t) => t.id)).toEqual(['a']);
    expect(isStarredEphemeral()).toBe(true);
  });

  it('reports whether a specific question is starred', async () => {
    await star(tossup('a'));
    expect(await isStarred('a')).toBe(true);
    expect(await isStarred('b')).toBe(false);
  });

  it('unstars', async () => {
    await star(tossup('a'));
    await unstar('a');
    expect(await isStarred('a')).toBe(false);
    expect((await listStarred()).length).toBe(0);
  });

  it('does not duplicate a re-starred question', async () => {
    await star(tossup('a'));
    await star(tossup('a'));
    expect((await listStarred()).length).toBe(1);
  });

  it('keeps the question data intact', async () => {
    await star(tossup('keep'));
    const [row] = await listStarred();
    expect(row?.questionSanitized).toContain('(*)');
    expect(row?.answer).toBe('<b><u>Answer</u></b>');
  });

  it('never prunes — unlike the opportunistic cache, this is a deliberate list', async () => {
    for (let i = 0; i < 700; i++) {
      await star(tossup(`t${i}`));
    }
    expect(await starredCount()).toBe(700);
  });
});
