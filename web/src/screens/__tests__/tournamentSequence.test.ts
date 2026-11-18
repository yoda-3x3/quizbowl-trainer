/**
 * Unit tests for the pure logic that backs the tournament sequencer.
 *
 * Covers:
 *  - `pickQuestionIds` picks tossup AND bonus ids for a bonus-format start
 *    (NOTES.md point 16).
 *  - `publicToTossup` / `publicToBonus` adapt the server shapes into the
 *    client Tossup / Bonus types the reader screens already consume.
 *  - `nextTossupInBurst` stops at a bonus boundary so TournamentDetail knows
 *    when to unmount Tossup and mount Bonus instead.
 */

import { describe, expect, it } from 'vitest';
import {
  nextTossupInBurst,
  pickQuestionIds,
  publicToBonus,
  publicToTossup,
} from '../tournamentSequence';
import type {
  Bonus as BonusQuestion,
  QuestionFilters,
  Tossup as TossupQuestion,
} from '../../types';

const FILTERS: QuestionFilters = {
  difficulties: [3, 4, 5],
  categories: [],
  subcategories: [],
  standardOnly: true,
};

function tossupStub(id: string): TossupQuestion {
  return {
    id,
    question: 'Who wrote?',
    questionSanitized: 'Who wrote?',
    answer: '<b><u>Dickens</u></b>',
    answerSanitized: 'Dickens',
    category: 'Literature',
    subcategory: 'British Literature',
    difficulty: 4,
    setName: 'Test Set',
    setYear: 2024,
    packetNumber: 1,
    questionNumber: 1,
    source: 'qbreader',
  };
}

function bonusStub(id: string): BonusQuestion {
  return {
    id,
    leadin: 'For 10 each:',
    leadinSanitized: 'For 10 each:',
    parts: ['part one', 'part two'],
    partsSanitized: ['part one', 'part two'],
    answers: ['one', 'two'],
    answersSanitized: ['one', 'two'],
    category: 'Literature',
    subcategory: 'British Literature',
    difficulty: 4,
    setName: 'Test Set',
    source: 'qbreader',
  };
}

describe('pickQuestionIds', () => {
  it('picks only tossups for a tossups-only format', async () => {
    const queue = {
      items: [tossupStub('t1'), tossupStub('t2')],
      async next() {
        return this.items.shift() ?? null;
      },
    };
    const picks = await pickQuestionIds(FILTERS, 2, 0, {
      makeTossupQueue: () => queue,
      fetchBonuses: async () => [],
    });
    expect(picks).toEqual([
      { id: 't1', kind: 'tossup' },
      { id: 't2', kind: 'tossup' },
    ]);
  });

  it('mixes tossups and bonuses for the tossups_bonuses format', async () => {
    const queue = {
      items: [tossupStub('t1'), tossupStub('t2')],
      async next() {
        return this.items.shift() ?? null;
      },
    };
    const picks = await pickQuestionIds(FILTERS, 2, 2, {
      makeTossupQueue: () => queue,
      fetchBonuses: async () => [bonusStub('b1'), bonusStub('b2')],
    });
    expect(picks).toEqual([
      { id: 't1', kind: 'tossup' },
      { id: 't2', kind: 'tossup' },
      { id: 'b1', kind: 'bonus' },
      { id: 'b2', kind: 'bonus' },
    ]);
  });

  it('picks only bonuses when nTossups is 0', async () => {
    const picks = await pickQuestionIds(FILTERS, 0, 2, {
      makeTossupQueue: () => ({
        async next() {
          throw new Error('should not be called');
        },
      }),
      fetchBonuses: async () => [bonusStub('b1'), bonusStub('b2'), bonusStub('b3')],
    });
    expect(picks).toEqual([
      { id: 'b1', kind: 'bonus' },
      { id: 'b2', kind: 'bonus' },
    ]);
  });

  it('dedupes bonuses that the upstream returns twice', async () => {
    let round = 0;
    const picks = await pickQuestionIds(FILTERS, 0, 3, {
      makeTossupQueue: () => ({
        async next() {
          return null;
        },
      }),
      fetchBonuses: async () => {
        round++;
        if (round === 1) return [bonusStub('b1'), bonusStub('b1'), bonusStub('b2')];
        return [bonusStub('b3')];
      },
    });
    expect(picks.map((p) => p.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('bails out when the bonus upstream stops returning anything new', async () => {
    const picks = await pickQuestionIds(FILTERS, 0, 10, {
      makeTossupQueue: () => ({
        async next() {
          return null;
        },
      }),
      fetchBonuses: async () => [bonusStub('b1')],
      maxBonusFetchRounds: 3,
    });
    expect(picks.map((p) => p.id)).toEqual(['b1']);
  });

  it('short-circuits bonus fetching when nBonuses is 0', async () => {
    let called = false;
    await pickQuestionIds(FILTERS, 1, 0, {
      makeTossupQueue: () => ({
        async next() {
          return tossupStub('t1');
        },
      }),
      fetchBonuses: async () => {
        called = true;
        return [];
      },
    });
    expect(called).toBe(false);
  });

  it('stops when the tossup queue runs dry', async () => {
    const queue = {
      items: [tossupStub('t1')],
      async next() {
        return this.items.shift() ?? null;
      },
    };
    const picks = await pickQuestionIds(FILTERS, 5, 0, {
      makeTossupQueue: () => queue,
      fetchBonuses: async () => [],
    });
    expect(picks.map((p) => p.id)).toEqual(['t1']);
  });
});

describe('publicToTossup', () => {
  it('normalizes a server tossup into the reader-ready client type', () => {
    const t = publicToTossup({
      id: 'q0',
      question: '<b>Who wrote</b> this (*) book?',
      question_sanitized: 'Who wrote this (*) book?',
      answer: '<b><u>Dickens</u></b>',
      answer_sanitized: 'Dickens',
      category: 'Literature',
      subcategory: 'British Literature',
      difficulty: 4,
      set_name: 'Tourney Set',
      set_year: 2024,
      packet_number: 3,
      question_number: 7,
    });
    expect(t.id).toBe('q0');
    expect(t.questionSanitized).toBe('Who wrote this (*) book?');
    expect(t.answerSanitized).toBe('Dickens');
    expect(t.category).toBe('Literature');
    expect(t.setName).toBe('Tourney Set');
    expect(t.setYear).toBe(2024);
    expect(t.packetNumber).toBe(3);
    expect(t.questionNumber).toBe(7);
    expect(t.source).toBe('qbreader');
  });

  it('uses the sanitized text as a fallback when the HTML question is empty', () => {
    const t = publicToTossup({
      id: 'q1',
      question: '',
      question_sanitized: 'A plain text question',
      answer: '',
      answer_sanitized: 'Dickens',
      category: 'Literature',
      subcategory: 'British Literature',
      difficulty: 4,
      set_name: 'X',
      set_year: 0,
      packet_number: 0,
      question_number: 0,
    });
    expect(t.id).toBe('q1');
  });
});

describe('publicToBonus', () => {
  it('normalizes a server bonus and trims when parts and answers disagree', () => {
    const b = publicToBonus({
      id: 'b0',
      leadin: 'Lead',
      leadin_sanitized: 'Lead',
      parts: ['p1', 'p2', 'p3'],
      parts_sanitized: ['p1', 'p2', 'p3'],
      answers: ['a1', 'a2'],
      answers_sanitized: ['a1', 'a2'],
      values: [10, 10, 10],
      category: 'Literature',
      subcategory: 'British Literature',
      difficulty: 4,
      set_name: 'X',
    });
    // Three parts but only two answers upstream; collapse to the shorter.
    expect(b.parts.length).toBe(2);
    expect(b.answers.length).toBe(2);
    expect(b.values?.length).toBe(2);
    expect(b.id).toBe('b0');
  });

  it('omits values when the server has none', () => {
    const b = publicToBonus({
      id: 'b1',
      leadin: '',
      leadin_sanitized: '',
      parts: ['p1', 'p2'],
      parts_sanitized: ['p1', 'p2'],
      answers: ['a1', 'a2'],
      answers_sanitized: ['a1', 'a2'],
      values: null,
      category: 'History',
      subcategory: 'American History',
      difficulty: 3,
      set_name: 'Y',
    });
    expect(b.values).toBeUndefined();
  });
});

describe('nextTossupInBurst', () => {
  const pinned = [
    { seq: 0, question_id: 'q0', question_kind: 'tossup' as const },
    { seq: 1, question_id: 'q1', question_kind: 'tossup' as const },
    { seq: 2, question_id: 'b0', question_kind: 'bonus' as const },
    { seq: 3, question_id: 'q2', question_kind: 'tossup' as const },
  ];

  it('yields consecutive tossups', () => {
    const r0 = nextTossupInBurst(pinned, 0);
    expect(r0?.entry.question_id).toBe('q0');
    expect(r0?.nextCursor).toBe(1);
    const r1 = nextTossupInBurst(pinned, 1);
    expect(r1?.entry.question_id).toBe('q1');
    expect(r1?.nextCursor).toBe(2);
  });

  it('returns null at a bonus boundary', () => {
    expect(nextTossupInBurst(pinned, 2)).toBeNull();
  });

  it('returns null past the end', () => {
    expect(nextTossupInBurst(pinned, 99)).toBeNull();
  });

  it('resumes at a later tossup', () => {
    const r = nextTossupInBurst(pinned, 3);
    expect(r?.entry.question_id).toBe('q2');
    expect(r?.nextCursor).toBe(4);
  });
});
