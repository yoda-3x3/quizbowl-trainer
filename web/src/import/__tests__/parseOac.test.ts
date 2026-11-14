import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OAC_SCORING } from '../../types';
import { createMatch, maxAvailableScore } from '../../oac/match';
import { parseOacPacket, splitOacAnswer } from '../parseOac';

const fixture = readFileSync(
  join(__dirname, '..', '__fixtures__', 'oac-synthetic.txt'),
  'utf8',
);

const parsed = parseOacPacket(fixture, {
  setName: '2014 Ohio Academic Competition',
  packetNumber: 1,
});

describe('OAC packet shape', () => {
  it('yields 20 directed questions', () => {
    const directed = parsed.packet.categoryRound.flatMap((b) =>
      b.questions.filter((q) => q.kind === 'directed'),
    );
    expect(directed).toHaveLength(20);
  });

  it('yields 10 category tossups, one per block', () => {
    expect(parsed.packet.categoryRound).toHaveLength(10);
    const tossups = parsed.packet.categoryRound.flatMap((b) =>
      b.questions.filter((q) => q.kind === 'tossup'),
    );
    expect(tossups).toHaveLength(10);
  });

  /**
   * THE DEDUPE REGRESSION TEST.
   *
   * The alphabet worksheet is reprinted six more times at the end of the PDF
   * as team copies, so a parser that simply collects every `^\d+\. ` line in
   * an alphabet section imports 140 items. The fixture contains all seven
   * copies deliberately.
   */
  it('yields 20 alphabet items, not 140', () => {
    expect(parsed.packet.alphabet.items).toHaveLength(20);
    expect(parsed.packet.alphabet.items).not.toHaveLength(140);
  });

  it('counts seven worksheet copies in the fixture, so the dedupe is real', () => {
    const headers = fixture.match(/Alphabet Round - Letter M(?! ANSWERS)/g);
    expect(headers).toHaveLength(7);
  });

  it('yields 20 final-round tossups', () => {
    expect(parsed.packet.finalRound).toHaveLength(20);
  });

  it('parses cleanly, with no structural warnings', () => {
    expect(parsed.warnings).toEqual([]);
  });

  /**
   * Interop check: an imported packet has to be playable by the OAC match
   * engine in `src/oac`, and a correctly parsed round puts exactly the 140
   * points the rules quote on the table.
   */
  it('reaches the documented 140-point maximum', () => {
    expect(maxAvailableScore(parsed.packet)).toBe(OAC_SCORING.maxScore);
  });

  it('can be handed straight to the OAC match engine', () => {
    const match = createMatch(parsed.packet);
    expect(match.stage).toBe('idle');
    expect(match.alphabet.letter).toBe('M');
    expect(match.alphabet.items).toHaveLength(20);
    expect(match.packet.categoryRound).toHaveLength(10);
  });

  it('carries the alphabet letter and the packet identity', () => {
    expect(parsed.packet.alphabet.letter).toBe('M');
    expect(parsed.packet.setName).toBe('2014 Ohio Academic Competition');
    expect(parsed.packet.id).toBe('oac-2014-ohio-academic-competition-r1');
  });
});

describe('OAC category round', () => {
  it('keeps the blocks in the order the file presents them', () => {
    expect(parsed.packet.categoryRound.map((b) => b.category)).toEqual([
      'American Literature',
      'Mathematics',
      'World History',
      'Fine Arts',
      'Life Science',
      'English/World Literature',
      'U.S. Government/Economics',
      'Physical Science',
      'World Geography',
      'U.S. History',
    ]);
  });

  it('reads the theme from the category header', () => {
    const fineArts = parsed.packet.categoryRound.find(
      (b) => b.category === 'Fine Arts',
    );
    expect(fineArts?.theme).toBe('American Landmarks');
  });

  it('respects the team assignment baked into the file', () => {
    // Block 1 leads with Team A, block 2 with Team B.
    const first = parsed.packet.categoryRound[0];
    const second = parsed.packet.categoryRound[1];
    expect(first?.questions[0].team).toBe('A');
    expect(first?.questions[1].team).toBe('B');
    expect(second?.questions[0].team).toBe('B');
    expect(second?.questions[1].team).toBe('A');
  });

  it('joins a prompt wrapped across lines by the PDF column width', () => {
    const first = parsed.packet.categoryRound[0]?.questions[0];
    expect(first?.prompt).toBe(
      'This novelist wrote about Jay Gatsby and the green light across the bay in a 1925 novel set on Long Island.',
    );
  });

  it('parses the indented answer and its [or ...] alternates', () => {
    const first = parsed.packet.categoryRound[0]?.questions[0];
    expect(first?.answer).toBe('F. Scott Fitzgerald');
    expect(first?.acceptable).toEqual(['Francis Scott Key Fitzgerald']);
  });

  it('splits a multi-alternate clause on "or"', () => {
    const westphalia = parsed.packet.categoryRound
      .find((b) => b.category === 'World History')
      ?.questions[1];
    expect(westphalia?.answer).toBe('Peace of Westphalia');
    expect(westphalia?.acceptable).toEqual(['Treaty of Westphalia', 'Westphalia']);
  });

  it('gives a calculation question the clock it declares, not the default', () => {
    const calculation = parsed.packet.categoryRound.find(
      (b) => b.category === 'Mathematics',
    )?.questions[0];
    expect(calculation?.prompt).toContain('20-second calculation question');
    expect(calculation?.seconds).toBe(20);
  });

  it('defaults every other directed question to 10 seconds', () => {
    const others = parsed.packet.categoryRound
      .flatMap((b) => b.questions.filter((q) => q.kind === 'directed'))
      .filter((q) => !/\d+-second/.test(q.prompt));
    expect(others).toHaveLength(19);
    for (const q of others) {
      expect(q.seconds).toBe(OAC_SCORING.directedSeconds);
    }
  });

  it('strips the page footers rather than treating them as content', () => {
    expect(fixture).toMatch(/2014 OAC 1 Page \d+ of 24/);
    const everyPrompt = JSON.stringify(parsed.packet);
    expect(everyPrompt).not.toContain('Page 1 of 24');
    expect(everyPrompt).not.toMatch(/OAC 1 Page/);
  });

  it('finds the centred CATEGORY ROUND header despite its leading whitespace', () => {
    expect(fixture).toMatch(/^ +CATEGORY ROUND$/m);
    expect(fixture).not.toMatch(/^CATEGORY ROUND$/m);
    expect(parsed.packet.categoryRound.length).toBeGreaterThan(0);
  });
});

describe('OAC alphabet round', () => {
  it('numbers the items 1 through 20', () => {
    expect(parsed.packet.alphabet.items.map((i) => i.index)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('joins answers from the separate answer page by index', () => {
    const items = parsed.packet.alphabet.items;
    expect(items[0]?.prompt).toBe('This planet is closest to the Sun.');
    expect(items[0]?.answer).toBe('Mercury');
    expect(items[19]?.answer).toBe('Mumbai');
    expect(items.every((i) => i.answer.length > 0)).toBe(true);
  });

  it('flags the TWO WORD ANSWER item and strips the flag from the prompt', () => {
    const item = parsed.packet.alphabet.items.find((i) => i.index === 7);
    expect(item?.twoWord).toBe(true);
    expect(item?.answer).toBe('Mount Rushmore');
    expect(item?.acceptable).toEqual(['Rushmore']);
    expect(item?.prompt).not.toMatch(/TWO WORD/i);
    expect(item?.prompt).toBe(
      'This South Dakota memorial depicts four presidents and was carved by Gutzon Borglum.',
    );
  });

  it('leaves twoWord false on the other nineteen', () => {
    const flagged = parsed.packet.alphabet.items.filter((i) => i.twoWord);
    expect(flagged).toHaveLength(1);
  });
});

describe('OAC final round', () => {
  it('reads the column-0 answer lines', () => {
    expect(parsed.packet.finalRound[0]?.prompt).toBe(
      'This element has atomic number 79 and is prized for jewellery.',
    );
    expect(parsed.packet.finalRound[0]?.answer).toBe('gold');
    expect(parsed.packet.finalRound[0]?.acceptable).toEqual(['Au']);
  });

  it('does not leak the right-aligned HSAPQ ids into the questions', () => {
    expect(fixture).toMatch(/019-14-103-01101/);
    for (const q of parsed.packet.finalRound) {
      expect(q.prompt).not.toMatch(/\d{3}-\d{2}-\d{3}-\d{5}/);
      expect(q.answer).not.toMatch(/\d{3}-\d{2}-\d{3}-\d{5}/);
    }
  });

  it('keeps every final answer non-empty', () => {
    expect(parsed.packet.finalRound.every((q) => q.answer.length > 0)).toBe(true);
  });
});

describe('splitOacAnswer', () => {
  it('returns a bare answer unchanged', () => {
    expect(splitOacAnswer('metaphase')).toEqual({
      answer: 'metaphase',
      acceptable: [],
    });
  });

  it('reads the OAC [or ...] form', () => {
    expect(splitOacAnswer('Nile [or Nile River]')).toEqual({
      answer: 'Nile',
      acceptable: ['Nile River'],
    });
  });

  it('also tolerates the pyramidal [accept ...] spelling', () => {
    expect(splitOacAnswer('Diana [accept Artemis]')).toEqual({
      answer: 'Diana',
      acceptable: ['Artemis'],
    });
  });

  it('ignores a do-not-accept clause', () => {
    const out = splitOacAnswer('Mars [do not accept Ares]');
    expect(out.answer).toBe('Mars');
    expect(out.acceptable).toEqual([]);
  });
});

describe('OAC parser diagnostics', () => {
  it('warns rather than throwing when a round is truncated', () => {
    const truncated = fixture.slice(0, fixture.indexOf('Life Science:'));
    const out = parseOacPacket(truncated, { setName: 'partial' });
    expect(out.packet.categoryRound.length).toBeLessThan(10);
    expect(out.warnings.join(' ')).toMatch(/category blocks/);
  });

  it('returns an empty packet for unrelated text', () => {
    const out = parseOacPacket('this is not a packet at all', {
      setName: 'nope',
    });
    expect(out.packet.categoryRound).toEqual([]);
    expect(out.packet.alphabet.items).toEqual([]);
    expect(out.packet.finalRound).toEqual([]);
    expect(out.warnings.length).toBeGreaterThan(0);
  });
});
