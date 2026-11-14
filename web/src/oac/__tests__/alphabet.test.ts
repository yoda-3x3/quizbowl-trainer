/**
 * Alphabet-round generation tests.
 *
 * The interesting rule is the ambiguity one. "The Great Gatsby" files under G
 * for one player and T for another, so an answer that opens with an article is
 * rejected rather than guessed at, and an accept-level alternate that files
 * under a different letter is dropped rather than contradicting the announced
 * letter.
 */

import { describe, expect, it } from 'vitest';
import type { Tossup } from '../../types';
import { OAC_SCORING } from '../../types';
import {
  alphabetLetterOf,
  bestAlphabetLetter,
  generateAlphabetRound,
  matchesLetter,
} from '../alphabet';

function tossup(answer: string, id: string, clue = 'is the thing clued here'): Tossup {
  return {
    id,
    question: '',
    questionSanitized: `A harder clue opens the question here. For 10 points, name the thing that ${clue}.`,
    answer: `<b><u>${answer}</u></b>`,
    answerSanitized: answer,
    category: 'Literature',
    subcategory: 'American Literature',
    difficulty: 3,
    setName: 'Test Set',
    setYear: 2024,
    packetNumber: 1,
    questionNumber: 1,
    source: 'bundled',
  };
}

const S_ANSWERS = [
  'Sahara',
  'Saturn',
  'Senegal',
  'Seattle',
  'Shanghai',
  'Sicily',
  'Singapore',
  'Slovakia',
  'Somalia',
  'Sparta',
  'Sudan',
  'Sumatra',
  'Sweden',
  'Switzerland',
  'Syracuse',
  'Syria',
  'Sydney',
  'Salzburg',
  'Santiago',
  'Seville',
  'Sofia',
  'Stockholm',
];

describe('letter filing', () => {
  it('files an answer under its first letter', () => {
    expect(alphabetLetterOf('Sahara')).toBe('S');
    expect(alphabetLetterOf('sparta')).toBe('S');
    expect(alphabetLetterOf('  Sudan ')).toBe('S');
    expect(alphabetLetterOf('"Sweden"')).toBe('S');
  });

  it('rejects an answer whose letter an article makes ambiguous', () => {
    expect(alphabetLetterOf('The Great Gatsby')).toBeNull();
    expect(alphabetLetterOf('A Doll House')).toBeNull();
    expect(alphabetLetterOf('An Enemy of the People')).toBeNull();
    expect(alphabetLetterOf('Les Miserables')).toBeNull();
    expect(alphabetLetterOf('El Cid')).toBeNull();
    expect(alphabetLetterOf('Der Ring des Nibelungen')).toBeNull();
  });

  it('rejects an answer that does not start with a letter', () => {
    expect(alphabetLetterOf('1984')).toBeNull();
    expect(alphabetLetterOf('')).toBeNull();
    expect(alphabetLetterOf('   ')).toBeNull();
    expect(alphabetLetterOf('2 Live Crew')).toBeNull();
  });

  it('does not treat a word that merely starts like an article as one', () => {
    expect(alphabetLetterOf('Theodore Roosevelt')).toBe('T');
    expect(alphabetLetterOf('Andes')).toBe('A');
    expect(alphabetLetterOf('Elbe')).toBe('E');
  });

  it('matches a letter case-insensitively', () => {
    expect(matchesLetter('Sahara', 's')).toBe(true);
    expect(matchesLetter('Sahara', 'S')).toBe(true);
    expect(matchesLetter('Sahara', 'T')).toBe(false);
    expect(matchesLetter('The Sahara', 'S')).toBe(false);
  });
});

describe('generating a round', () => {
  const bank = S_ANSWERS.map((a, i) => tossup(a, `s${i}`));

  it('produces twenty items, which is what the round is', () => {
    const round = generateAlphabetRound('S', bank);
    expect(round.items).toHaveLength(OAC_SCORING.alphabetItemCount);
    expect(round.items).toHaveLength(20);
    expect(round.letter).toBe('S');
  });

  it('numbers items from one and keeps them in bank order', () => {
    const round = generateAlphabetRound('S', bank);
    expect(round.items.map((i) => i.index)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(round.items[0]?.answer).toBe('Sahara');
  });

  it('only admits answers that file under the announced letter', () => {
    const mixed = [
      tossup('Sahara', 'a'),
      tossup('The Sahara Desert', 'b'),
      tossup('Tokyo', 'c'),
      tossup('1984', 'd'),
      tossup('Seville', 'e'),
    ];
    const round = generateAlphabetRound('S', mixed);
    expect(round.items.map((i) => i.answer)).toEqual(['Sahara', 'Seville']);
  });

  it('uses the giveaway clause as the clue, in OAC phrasing', () => {
    const round = generateAlphabetRound('S', bank.slice(0, 1));
    const item = round.items[0];
    expect(item?.prompt).not.toContain('For 10 points');
    expect(item?.prompt).toContain('Name the thing');
  });

  it('drops a duplicate answer rather than asking it twice', () => {
    const round = generateAlphabetRound('S', [
      tossup('Sahara', 'a'),
      tossup('sahara', 'b'),
      tossup('Seville', 'c'),
    ]);
    expect(round.items).toHaveLength(2);
  });

  it('flags a two-word answer', () => {
    const round = generateAlphabetRound('S', [
      tossup('Sahara', 'a'),
      tossup('Sierra Nevada', 'b'),
    ]);
    expect(round.items[0]?.twoWord).toBe(false);
    expect(round.items[1]?.twoWord).toBe(true);
  });

  it('keeps only alternates that file under the same letter', () => {
    const t = tossup('Sahara', 'a');
    const round = generateAlphabetRound('S', [
      {
        ...t,
        answer: '<b><u>Sahara</u></b> [or <u>Sahara Desert</u> or <u>Tanezrouft</u>]',
      },
    ]);
    expect(round.items[0]?.acceptable).toEqual(['Sahara Desert']);
  });

  it('returns a short round rather than padding it with off-letter answers', () => {
    const round = generateAlphabetRound('S', bank.slice(0, 4));
    expect(round.items).toHaveLength(4);
    for (const item of round.items) {
      expect(matchesLetter(item.answer, 'S')).toBe(true);
    }
    expect(generateAlphabetRound('Z', bank).items).toHaveLength(0);
  });

  it('respects a smaller requested count', () => {
    expect(generateAlphabetRound('S', bank, 5).items).toHaveLength(5);
  });
});

describe('choosing a letter', () => {
  const bank = [
    ...S_ANSWERS.map((a, i) => tossup(a, `s${i}`)),
    tossup('Tokyo', 't1'),
    tossup('Toledo', 't2'),
  ];

  it('picks the letter the bank can actually fill a round with', () => {
    expect(bestAlphabetLetter(bank)).toBe('S');
    expect(generateAlphabetRound(bestAlphabetLetter(bank) ?? 'S', bank).items).toHaveLength(
      20,
    );
  });

  it('returns null when no letter can fill a round', () => {
    expect(bestAlphabetLetter([tossup('Tokyo', 't1')])).toBeNull();
    expect(bestAlphabetLetter([tossup('Tokyo', 't1')], 1)).toBe('T');
    expect(bestAlphabetLetter([], 1)).toBeNull();
  });

  it('ignores answers no letter can be read off', () => {
    expect(bestAlphabetLetter([tossup('The Sahara', 'a'), tossup('1984', 'b')], 1)).toBeNull();
  });
});
