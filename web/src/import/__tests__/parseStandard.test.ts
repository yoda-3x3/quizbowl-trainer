import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseQuestion } from '../../engine/power';
import { paragraphsFromText, readDocx } from '../docx';
import {
  parseStandardPacket,
  repairPdfAnswerSpacing,
  resolveCategory,
  type PacketMeta,
} from '../parseStandard';
import { buildDocx, para, run } from './zipFixture';

const META: PacketMeta = {
  setName: 'Synthetic Invitational 2019',
  setYear: 2019,
  packetNumber: 3,
  difficulty: 4,
};

const pdfText = readFileSync(
  join(__dirname, '..', '__fixtures__', 'standard-synthetic.txt'),
  'utf8',
);

const fromPdf = parseStandardPacket(paragraphsFromText(pdfText), META, {
  repairPdfSpacing: true,
});

describe('standard parser, PDF text path', () => {
  it('finds every tossup and every bonus', () => {
    expect(fromPdf.tossups).toHaveLength(3);
    expect(fromPdf.bonuses).toHaveLength(2);
  });

  it('marks everything as an import', () => {
    for (const t of fromPdf.tossups) expect(t.source).toBe('import');
    for (const b of fromPdf.bonuses) expect(b.source).toBe('import');
  });

  /** The card's explicit acceptance criterion: the power mark is found. */
  it('retains the (*) power mark in questionSanitized', () => {
    const first = fromPdf.tossups[0];
    expect(first?.questionSanitized).toContain('(*)');
  });

  it('hands the engine a usable power index', () => {
    const first = fromPdf.tossups[0];
    const { words, powerIndex } = parseQuestion(first?.questionSanitized ?? '');
    expect(powerIndex).not.toBeNull();
    expect(powerIndex! + 1).toBeLessThan(words.length);
    // The marker itself must not survive as a word.
    expect(words).not.toContain('(*)');
    expect(words[powerIndex!]).toBe('this');
  });

  /** The card's other explicit acceptance criterion: the category tag. */
  it('reads the <Author, Category - Subcategory> tag', () => {
    const first = fromPdf.tossups[0];
    expect(first?.category).toBe('Literature');
    expect(first?.subcategory).toBe('American Literature');
  });

  it('does not leave the category tag in the question or answer', () => {
    for (const t of fromPdf.tossups) {
      expect(t.questionSanitized).not.toContain('<');
      expect(t.answerSanitized).not.toMatch(/^</);
    }
  });

  it('strips the leading question number', () => {
    expect(fromPdf.tossups[0]?.questionSanitized).toMatch(/^This author wrote/);
    expect(fromPdf.tossups[0]?.questionNumber).toBe(1);
    expect(fromPdf.tossups[2]?.questionNumber).toBe(3);
  });

  it('joins a question wrapped across lines', () => {
    expect(fromPdf.tossups[0]?.questionSanitized).toContain(
      'his generation destroyed by madness',
    );
  });

  it('keeps the answerline directives intact for judge()', () => {
    expect(fromPdf.tossups[0]?.answerSanitized).toBe(
      'Allen Ginsberg [accept Irwin Allen Ginsberg; prompt on Howl]',
    );
  });

  it('carries the set metadata onto every question', () => {
    for (const t of fromPdf.tossups) {
      expect(t.setName).toBe('Synthetic Invitational 2019');
      expect(t.setYear).toBe(2019);
      expect(t.packetNumber).toBe(3);
      expect(t.difficulty).toBe(4);
    }
  });

  it('gives deterministic ids so a re-import does not orphan the event log', () => {
    const again = parseStandardPacket(paragraphsFromText(pdfText), META, {
      repairPdfSpacing: true,
    });
    expect(again.tossups.map((t) => t.id)).toEqual(
      fromPdf.tossups.map((t) => t.id),
    );
    expect(fromPdf.tossups[0]?.id).toBe(
      'import-synthetic-invitational-2019-p3-t1',
    );
    expect(fromPdf.bonuses[0]?.id).toBe(
      'import-synthetic-invitational-2019-p3-b1',
    );
  });
});

describe('pdftotext answer-line repair', () => {
  it('rejoins the split first letter pdftotext leaves behind', () => {
    expect(repairPdfAnswerSpacing('A ristotle')).toBe('Aristotle');
    expect(repairPdfAnswerSpacing('i nvasion of Earth')).toBe('invasion of Earth');
  });

  it('leaves a legitimate single-letter word alone', () => {
    // The documented damage only ever splits a letter from a LOWERCASE run,
    // so a real title must survive untouched.
    expect(repairPdfAnswerSpacing('A Modest Proposal')).toBe('A Modest Proposal');
  });

  it('applies the repair inside the parsed packet', () => {
    expect(fromPdf.tossups[0]?.answerSanitized).toMatch(/^Allen Ginsberg/);
    expect(fromPdf.tossups[1]?.answerSanitized).toBe('Aristotle');
    expect(fromPdf.tossups[2]?.answerSanitized).toBe('A Modest Proposal');
  });

  it('is not applied to docx text, which has no such damage', () => {
    const paragraphs = paragraphsFromText(
      ['Tossups', '1. A question. For 10 points, name it.', 'ANSWER: A Modest Proposal', '<Literature - British Literature>'].join('\n'),
    );
    const out = parseStandardPacket(paragraphs, META);
    expect(out.tossups[0]?.answerSanitized).toBe('A Modest Proposal');
  });
});

describe('standard parser, bonuses', () => {
  it('reads the leadin, three parts and three answers', () => {
    const bonus = fromPdf.bonuses[0];
    expect(bonus?.leadinSanitized).toBe(
      'This painter spent much of his career in Spain. For 10 points each:',
    );
    expect(bonus?.partsSanitized).toHaveLength(3);
    expect(bonus?.answersSanitized).toHaveLength(3);
    expect(bonus?.partsSanitized[0]).toBe(
      'Name this Surrealist painter of "The Persistence of Memory".',
    );
    expect(bonus?.answersSanitized[0]).toBe('Salvador Dali');
  });

  it('defaults each part to 10 points from the [10] marker', () => {
    expect(fromPdf.bonuses[0]?.values).toEqual([10, 10, 10]);
  });

  it('reads the bonus category tag', () => {
    expect(fromPdf.bonuses[0]?.category).toBe('Fine Arts');
    expect(fromPdf.bonuses[0]?.subcategory).toBe('Visual Fine Arts');
    expect(fromPdf.bonuses[1]?.category).toBe('Science');
    expect(fromPdf.bonuses[1]?.subcategory).toBe('Biology');
  });

  it('keeps parts and answers the same length here', () => {
    for (const b of fromPdf.bonuses) {
      expect(b.answers).toHaveLength(b.parts.length);
    }
  });

  it('survives a bonus whose third answer is missing', () => {
    const text = [
      'Bonuses',
      '1. A leadin. For 10 points each:',
      '[10] Part one.',
      'ANSWER: one',
      '[10] Part two.',
      'ANSWER: two',
      '[10] Part three.',
      '<Science - Biology>',
    ].join('\n');
    const out = parseStandardPacket(paragraphsFromText(text), META);
    const bonus = out.bonuses[0];
    expect(bonus?.partsSanitized).toHaveLength(3);
    // The shape stays consistent: an unanswered part yields an empty answer
    // rather than a shorter array that would misalign the indices.
    expect(bonus?.answersSanitized).toEqual(['one', 'two', '']);
  });
});

describe('docx path', () => {
  const body =
    para(run('Tossups')) +
    para(
      run('1. This author wrote a poem beginning "I saw the best minds". '),
      run('For 10 points, name this (*) Beat poet.'),
    ) +
    para(
      run('ANSWER: '),
      run('Allen Ginsberg', { bold: true, underline: true }),
      run(' [accept Irwin Allen Ginsberg]'),
    ) +
    para(run('<Ravi Lin, Literature - American Literature>'));

  it('preserves the <b><u>required</u></b> markup judge() prefers', async () => {
    const bytes = await buildDocx(body);
    const paragraphs = await readDocx(bytes);
    const out = parseStandardPacket(paragraphs, META);

    const first = out.tossups[0];
    expect(first?.answer).toContain('<b><u>Allen Ginsberg</u></b>');
    expect(first?.answerSanitized).toBe(
      'Allen Ginsberg [accept Irwin Allen Ginsberg]',
    );
    expect(first?.questionSanitized).toContain('(*)');
    expect(first?.category).toBe('Literature');
    expect(first?.subcategory).toBe('American Literature');
  });

  it('reads a stored (uncompressed) archive as well as a deflated one', async () => {
    const stored = await readDocx(await buildDocx(body, { deflate: false }));
    const deflated = await readDocx(await buildDocx(body, { deflate: true }));
    expect(stored).toEqual(deflated);
  });
});

describe('resolveCategory', () => {
  it('canonicalizes a known category and subcategory', () => {
    expect(resolveCategory('Literature', 'American Literature')).toEqual({
      category: 'Literature',
      subcategory: 'American Literature',
    });
  });

  it('is case insensitive, because capitalization is load-bearing downstream', () => {
    expect(resolveCategory('science', 'biology')).toEqual({
      category: 'Science',
      subcategory: 'Biology',
    });
  });

  it('expands the common abbreviations editors use', () => {
    expect(resolveCategory('Lit', 'British Literature').category).toBe(
      'Literature',
    );
    expect(resolveCategory('FA', 'Auditory Fine Arts').category).toBe(
      'Fine Arts',
    );
    expect(resolveCategory('Trash', 'Movies').category).toBe('Pop Culture');
  });

  it('infers the category from the subcategory when the tag omits it', () => {
    expect(resolveCategory('', 'European History')).toEqual({
      category: 'History',
      subcategory: 'European History',
    });
  });

  it('falls back to Other Academic rather than inventing a category', () => {
    const out = resolveCategory('Interdisciplinary', 'Puzzles');
    expect(out.category).toBe('Other Academic');
    expect(out.subcategory).toBe('Puzzles');
  });
});

describe('standard parser robustness', () => {
  it('handles a packet with no section headers at all', () => {
    const text = [
      '1. A tossup question. For 10 points, name it.',
      'ANSWER: something',
      '<Science - Physics>',
      '1. A bonus leadin. For 10 points each:',
      '[10] Part one.',
      'ANSWER: one',
      '<Science - Physics>',
    ].join('\n');
    const out = parseStandardPacket(paragraphsFromText(text), META);
    expect(out.tossups).toHaveLength(1);
    expect(out.bonuses).toHaveLength(1);
    expect(out.bonuses[0]?.leadinSanitized).toBe(
      'A bonus leadin. For 10 points each:',
    );
  });

  it('returns empty arrays for unrelated text instead of throwing', () => {
    const out = parseStandardPacket(
      paragraphsFromText('just some prose with no questions'),
      META,
    );
    expect(out.tossups).toEqual([]);
    expect(out.bonuses).toEqual([]);
  });

  it('drops a tossup that has no answer line', () => {
    const text = ['Tossups', '1. A question with no answer.', '<Science - Physics>'].join(
      '\n',
    );
    const out = parseStandardPacket(paragraphsFromText(text), META);
    expect(out.tossups).toEqual([]);
  });
});
