import { describe, expect, it } from 'vitest';
import { scoreTossup } from '../scoring';

describe('scoreTossup', () => {
  it('awards 15 for a correct buzz inside power', () => {
    const r = scoreTossup({ buzzWordIndex: 3, powerIndex: 10, correct: true });
    expect(r).toEqual({ points: 15, powered: true, negged: false });
  });

  it('awards 15 exactly on the power boundary', () => {
    expect(
      scoreTossup({ buzzWordIndex: 10, powerIndex: 10, correct: true }).points,
    ).toBe(15);
  });

  it('awards 10 for a correct buzz after power', () => {
    const r = scoreTossup({ buzzWordIndex: 11, powerIndex: 10, correct: true });
    expect(r).toEqual({ points: 10, powered: false, negged: false });
  });

  it('negs an incorrect buzz', () => {
    const r = scoreTossup({ buzzWordIndex: 2, powerIndex: 10, correct: false });
    expect(r).toEqual({ points: -5, powered: false, negged: true });
  });

  it('awards 10 with no neg risk at the end of the question', () => {
    expect(
      scoreTossup({ buzzWordIndex: null, powerIndex: 10, correct: true }).points,
    ).toBe(10);
    const wrong = scoreTossup({
      buzzWordIndex: null,
      powerIndex: 10,
      correct: false,
    });
    expect(wrong.points).toBe(0);
    expect(wrong.negged).toBe(false);
  });

  it('can never power a question with no power mark', () => {
    const r = scoreTossup({ buzzWordIndex: 0, powerIndex: null, correct: true });
    expect(r.powered).toBe(false);
    expect(r.points).toBe(10);
  });
});
