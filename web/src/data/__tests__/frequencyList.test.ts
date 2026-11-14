import { describe, expect, it } from 'vitest';
import { unwrapFrequencyRows } from '../qbreader';

/**
 * Regression for a real bug. The /frequency-list endpoint returns
 * {"frequencyList":[...]}, but this function originally tested
 * `Array.isArray(data)` on the envelope and returned an empty list for every
 * subcategory. Nothing failed loudly: the Learn tab's lessons chapter simply
 * showed its empty state forever, which is exactly the kind of defect a type
 * check cannot catch because `unknown` accepts both shapes.
 */
describe('unwrapFrequencyRows', () => {
  it('unwraps the envelope the API actually sends', () => {
    const real = {
      frequencyList: [
        { answer_normalized: 'odin', count: 156, answer: 'Odin' },
        { answer_normalized: 'loki', count: 129, answer: 'Loki' },
      ],
    };
    expect(unwrapFrequencyRows(real)).toHaveLength(2);
  });

  it('still accepts a bare array, in case the shape changes back', () => {
    expect(unwrapFrequencyRows([{ answer: 'Thor', count: 126 }])).toHaveLength(1);
  });

  it('returns empty for anything else rather than throwing', () => {
    expect(unwrapFrequencyRows(null)).toEqual([]);
    expect(unwrapFrequencyRows(undefined)).toEqual([]);
    expect(unwrapFrequencyRows('nope')).toEqual([]);
    expect(unwrapFrequencyRows({})).toEqual([]);
    expect(unwrapFrequencyRows({ frequencyList: 'not an array' })).toEqual([]);
  });
});
