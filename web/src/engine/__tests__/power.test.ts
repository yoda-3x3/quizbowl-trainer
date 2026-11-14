import { describe, expect, it } from 'vitest';
import { isPower, parseQuestion, toOacPhrasing } from '../power';

describe('parseQuestion', () => {
  it('strips a standalone power marker and records the last in-power word', () => {
    const { words, powerIndex } = parseQuestion('alpha beta (*) gamma delta');
    expect(words).toEqual(['alpha', 'beta', 'gamma', 'delta']);
    // "beta" is the last in-power word, at index 1.
    expect(powerIndex).toBe(1);
  });

  it('returns null power index when the question has no marker', () => {
    const { words, powerIndex } = parseQuestion('alpha beta gamma');
    expect(words).toHaveLength(3);
    expect(powerIndex).toBeNull();
  });

  it('handles a marker fused to a neighbouring word', () => {
    const { words, powerIndex } = parseQuestion('small of their(*) back');
    expect(words).toEqual(['small', 'of', 'their', 'back']);
    expect(powerIndex).toBe(2);
  });

  it('treats a leading marker as nothing being in power', () => {
    const { powerIndex } = parseQuestion('(*) alpha beta');
    expect(powerIndex).toBeNull();
  });

  it('ignores a second marker if a malformed question has two', () => {
    const { powerIndex } = parseQuestion('a b (*) c (*) d');
    expect(powerIndex).toBe(1);
  });

  it('collapses irregular whitespace', () => {
    const { words } = parseQuestion('  alpha\n\tbeta   (*)  gamma  ');
    expect(words).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('parses a real QB Reader question', () => {
    const real =
      'This hero pulls Iapetus into the River Lethe and was invulnerable ' +
      'except for the small of their (*) back. This hero chooses glory.';
    const { words, powerIndex } = parseQuestion(real);
    expect(words).not.toContain('(*)');
    expect(powerIndex).not.toBeNull();
    // The marker sits after "their", so "their" is the last in-power word and
    // "back." is the first word out of power.
    expect(words[powerIndex as number]).toBe('their');
    expect(words[(powerIndex as number) + 1]).toBe('back.');
  });
});

describe('isPower', () => {
  it('is inclusive at the boundary', () => {
    expect(isPower(1, 1)).toBe(true);
    expect(isPower(2, 1)).toBe(false);
  });

  it('is false when never buzzed or when there is no power mark', () => {
    expect(isPower(null, 5)).toBe(false);
    expect(isPower(0, null)).toBe(false);
  });
});

describe('toOacPhrasing', () => {
  it('strips the For 10 points giveaway, as HSAPQ did', () => {
    expect(
      toOacPhrasing(
        'He chose to bomb Nagasaki. For 10 points, name this successor to FDR.',
      ),
    ).toBe('He chose to bomb Nagasaki. Name this successor to FDR.');
  });

  it('handles the spelled-out and "each" variants', () => {
    expect(toOacPhrasing('For ten points, name this city.')).toBe(
      'Name this city.',
    );
    expect(toOacPhrasing('For 10 points each, name these.')).toBe(
      'Name these.',
    );
  });

  it('removes the power marker, since OAC has no power', () => {
    expect(toOacPhrasing('alpha (*) beta')).not.toContain('(*)');
  });

  it('re-capitalizes the word left stranded at a sentence start', () => {
    // Regression: stripping the clause used to leave "name this" lowercase
    // in the middle of a paragraph.
    expect(toOacPhrasing('A clue. For 10 points, name this thing.')).toBe(
      'A clue. Name this thing.',
    );
    expect(toOacPhrasing('A clue! For ten points, give this.')).toBe(
      'A clue! Give this.',
    );
  });

  it('collapses a mid-sentence giveaway without leaving double spaces', () => {
    const out = toOacPhrasing('This work, for 10 points, was written by whom?');
    expect(out).not.toMatch(/\s{2}/);
    expect(out).not.toMatch(/for (10|ten) points/i);
  });

  it('leaves a question with no giveaway clause untouched', () => {
    expect(toOacPhrasing('Name this composer.')).toBe('Name this composer.');
  });
});
