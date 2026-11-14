/**
 * Conversion tests.
 *
 * The phrasing transform itself belongs to engine/power.ts and is tested
 * there; these tests check that this module calls it rather than
 * reimplementing it, and that the parts around it hold: the required span out
 * of an answerline, the clause worth keeping, the clock a calculation question
 * declares, and the side alternation.
 */

import { describe, expect, it } from 'vitest';
import type { Tossup } from '../../types';
import { OAC_CATEGORY_ORDER, OAC_SCORING } from '../../types';
import { toOacPhrasing } from '../../engine/power';
import {
  acceptableAnswers,
  buildCategoryRound,
  buildPacket,
  declaredSeconds,
  directedTeamFor,
  giveawayClause,
  primaryAnswer,
  qbTaxonomyFor,
  toOacDirected,
  toOacTossup,
} from '../convert';

function tossup(over: Partial<Tossup> = {}): Tossup {
  return {
    id: 'q1',
    question: '',
    questionSanitized:
      'He wrote a novel in which a mad captain (*) hunts a whale. For 10 points, name this author of Moby-Dick.',
    answer: '<b><u>Herman Melville</u></b>',
    answerSanitized: 'Herman Melville',
    category: 'Literature',
    subcategory: 'American Literature',
    difficulty: 3,
    setName: 'Test Set',
    setYear: 2024,
    packetNumber: 1,
    questionNumber: 1,
    source: 'bundled',
    ...over,
  };
}

describe('answerlines', () => {
  it('takes the required span as the primary answer', () => {
    expect(primaryAnswer('<b><u>Herman Melville</u></b>')).toBe('Herman Melville');
    expect(primaryAnswer('Pyotr Ilyich <b><u>Tchaikovsky</u></b>')).toBe('Tchaikovsky');
    expect(primaryAnswer('<u>Diana</u> [or <u>Artemis</u>]')).toBe('Diana');
    expect(primaryAnswer('Mount Everest (in the Himalayas)')).toBe('Mount Everest');
  });

  it('collects accept-level alternates and drops prompts and rejections', () => {
    expect(acceptableAnswers('<b><u>Diana</u></b> [or <u>Artemis</u>]')).toEqual([
      'Artemis',
    ]);
    expect(
      acceptableAnswers('<b><u>Diana</u></b> [accept Artemis or Cynthia]'),
    ).toEqual(['Artemis', 'Cynthia']);
    expect(
      acceptableAnswers('<b><u>Bill Clinton</u></b> [prompt on <u>Clinton</u>]'),
    ).toEqual([]);
    expect(
      acceptableAnswers('<b><u>Ohio</u></b> [reject <u>Ohio River</u>]'),
    ).toEqual([]);
    expect(acceptableAnswers('<b><u>Ohio</u></b>')).toEqual([]);
  });
});

describe('clause selection', () => {
  it('keeps the giveaway clause, already in OAC phrasing', () => {
    expect(giveawayClause(tossup().questionSanitized)).toBe(
      'Name this author of Moby-Dick.',
    );
  });

  it('falls back to two clauses when the giveaway is a stub', () => {
    const clause = giveawayClause(
      'This author wrote about a whale and a captain. For 10 points, name him.',
    );
    expect(clause).toContain('whale');
    expect(clause).toContain('Name him.');
  });

  it('reads the clock a question declares in its own text', () => {
    expect(declaredSeconds('This is a 20-second calculation question. Solve it.')).toBe(
      20,
    );
    expect(declaredSeconds('You have 30 seconds for this one.')).toBe(30);
    expect(declaredSeconds('Name this author.')).toBe(OAC_SCORING.directedSeconds);
    expect(declaredSeconds('Name this author.', 15)).toBe(15);
    // A packet typo cannot hand a team an unbounded clock.
    expect(declaredSeconds('This is a 300-second question.')).toBe(120);
    expect(declaredSeconds('This is a 9000-second question.')).toBe(120);
    expect(declaredSeconds('This is a 0-second question.')).toBe(
      OAC_SCORING.directedSeconds,
    );
  });
});

describe('tossup conversion', () => {
  it('drops the giveaway clause and the power marker, keeping the clues', () => {
    const q = toOacTossup(tossup());
    expect(q.kind).toBe('tossup');
    expect(q.prompt).not.toContain('For 10 points');
    expect(q.prompt).not.toContain('(*)');
    expect(q.prompt).toContain('mad captain hunts a whale');
    expect(q.answer).toBe('Herman Melville');
    // Delegated, not reimplemented.
    expect(q.prompt).toBe(toOacPhrasing(tossup().questionSanitized));
  });

  it('has no power scoring left on the far side', () => {
    const q = toOacTossup(tossup());
    expect(Object.keys(q).sort()).toEqual(['acceptable', 'answer', 'kind', 'prompt']);
  });

  it('falls back to the sanitized answerline when there is no HTML', () => {
    const q = toOacTossup(tossup({ answer: '', answerSanitized: 'Herman Melville' }));
    expect(q.answer).toBe('Herman Melville');
  });
});

describe('directed conversion', () => {
  it('keeps only the giveaway clause, since a directed question is not buzzable', () => {
    const d = toOacDirected(tossup(), 'A');
    expect(d.kind).toBe('directed');
    expect(d.team).toBe('A');
    expect(d.prompt).toBe('Name this author of Moby-Dick.');
    expect(d.seconds).toBe(OAC_SCORING.directedSeconds);
  });

  it('carries a declared calculation clock through', () => {
    const d = toOacDirected(
      tossup({
        questionSanitized:
          'This is a 20-second calculation question. For 10 points, find the derivative of x squared.',
      }),
      'B',
    );
    expect(d.seconds).toBe(20);
    // The declaration is an instruction to read aloud, so it stays in the
    // prompt even though the rest of the ladder is trimmed away.
    expect(d.prompt).toContain('20-second calculation question');
    expect(d.prompt).toContain('derivative');
    expect(d.prompt).not.toContain('For 10 points');
  });
});

describe('side alternation', () => {
  it('gives team A the first directed question in category 1 and B in category 2', () => {
    expect(directedTeamFor(0, 0)).toBe('A');
    expect(directedTeamFor(0, 1)).toBe('B');
    expect(directedTeamFor(1, 0)).toBe('B');
    expect(directedTeamFor(1, 1)).toBe('A');
    expect(directedTeamFor(9, 0)).toBe('B');
    for (let i = 0; i < 10; i++) {
      expect(directedTeamFor(i, 0)).not.toBe(directedTeamFor(i, 1));
    }
  });
});

describe('round assembly', () => {
  const bank = Array.from({ length: 60 }, (_, i) =>
    tossup({
      id: `q${i}`,
      questionSanitized: `Clue number ${i} about something. For 10 points, name this thing numbered ${i}.`,
      answer: `<b><u>Thing ${i}</u></b>`,
      answerSanitized: `Thing ${i}`,
    }),
  );

  it('builds ten blocks of directed, directed, tossup in the fixed order', () => {
    const blocks = buildCategoryRound(bank);
    expect(blocks).toHaveLength(OAC_CATEGORY_ORDER.length);
    expect(blocks.map((b) => b.category)).toEqual([...OAC_CATEGORY_ORDER]);
    blocks.forEach((block, index) => {
      expect(block.questions[0].kind).toBe('directed');
      expect(block.questions[1].kind).toBe('directed');
      expect(block.questions[2].kind).toBe('tossup');
      expect(block.questions[0].team).toBe(directedTeamFor(index, 0));
      expect(block.questions[1].team).toBe(directedTeamFor(index, 1));
    });
  });

  it('never uses the same source question twice', () => {
    const blocks = buildCategoryRound(bank);
    const prompts = blocks.flatMap((b) => b.questions.map((q) => q.prompt));
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it('emits fewer blocks rather than blocks with holes', () => {
    expect(buildCategoryRound(bank.slice(0, 7))).toHaveLength(2);
    expect(buildCategoryRound([])).toHaveLength(0);
  });

  it('assembles a packet whose final round reuses nothing from the category round', () => {
    const packet = buildPacket({
      id: 'p1',
      setName: 'Generated',
      bank,
      alphabet: { letter: 'T', items: [] },
    });
    expect(packet.categoryRound).toHaveLength(10);
    expect(packet.finalRound).toHaveLength(OAC_SCORING.finalTossupCount);
    const categoryPrompts = new Set(
      packet.categoryRound.flatMap((b) => b.questions.map((q) => q.prompt)),
    );
    for (const q of packet.finalRound) {
      expect(categoryPrompts.has(q.prompt)).toBe(false);
    }
  });
});

describe('taxonomy', () => {
  it('maps every OAC category, with a fallback for the unmapped', () => {
    for (const category of OAC_CATEGORY_ORDER) {
      const mapped = qbTaxonomyFor(category);
      expect(mapped.category).toBeTruthy();
      expect(mapped.subcategory).toBeTruthy();
    }
    expect(qbTaxonomyFor('Mathematics').category).toBe('Other Academic');
    expect(qbTaxonomyFor('Final Round').category).toBe('Other Academic');
  });
});
