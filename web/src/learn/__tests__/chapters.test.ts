/**
 * Card F: the pure geometry behind the Learn tab's three devices.
 *
 * The chapters themselves are markup over owned derivations, so what is worth
 * pinning down is the maths that decides how far a count has got, how far the
 * lateral track has travelled, and how far the wipe is open. All three are
 * clamped, because a scroll position can be anywhere.
 */

import { describe, expect, it } from 'vitest';
import {
  accTone,
  countTo,
  easeOutCubic,
  railPct,
} from '../chapters/WeakSpots';
import { panOffset, panProgress } from '../chapters/Lessons';
import { barHeight, markPct, wipeAmount } from '../chapters/Progress';

describe('counting numbers', () => {
  it('starts at zero and lands exactly on the target', () => {
    expect(countTo(0.42, 0)).toBe(0);
    expect(countTo(0.42, 1)).toBeCloseTo(0.42, 10);
  });

  it('clamps progress outside 0..1 rather than overshooting', () => {
    expect(easeOutCubic(-3)).toBe(0);
    expect(easeOutCubic(9)).toBe(1);
    expect(countTo(12, 4)).toBe(12);
  });

  it('eases out, so it is already past halfway at half time', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(0.5)).toBeLessThan(1);
  });

  it('tones accuracy by band', () => {
    expect(accTone(0)).toBe('weak__acc--low');
    expect(accTone(0.5)).toBe('weak__acc--mid');
    expect(accTone(0.9)).toBe('weak__acc--ok');
  });

  it('keeps a full-question buzz marker inside the rail', () => {
    expect(railPct(0)).toBe(0);
    expect(railPct(1)).toBeLessThan(100);
    expect(railPct(5)).toBe(railPct(1));
    expect(railPct(-1)).toBe(0);
  });
});

describe('lateral pan', () => {
  it('reports 0 at the top of the section and 1 at the bottom', () => {
    // 2000px section in an 800px viewport: 1200px of travel.
    expect(panProgress(0, 2000, 800)).toBe(0);
    expect(panProgress(-600, 2000, 800)).toBeCloseTo(0.5, 10);
    expect(panProgress(-1200, 2000, 800)).toBe(1);
  });

  it('clamps above and below the section', () => {
    expect(panProgress(900, 2000, 800)).toBe(0);
    expect(panProgress(-9999, 2000, 800)).toBe(1);
  });

  it('does not pan a section shorter than the viewport', () => {
    expect(panProgress(-10, 500, 800)).toBe(0);
  });

  it('never translates the track the wrong way or past its end', () => {
    expect(panOffset(0, 1800, 360)).toBe(0);
    expect(panOffset(1, 1800, 360)).toBe(-1440);
    expect(panOffset(0.5, 1800, 360)).toBe(-720);
    expect(panOffset(2, 1800, 360)).toBe(-1440);
    // A track that fits needs no offset at all.
    expect(panOffset(1, 300, 360)).toBe(0);
  });
});

describe('the wipe', () => {
  it('is shut below the fold and open once the chart has risen', () => {
    expect(wipeAmount(900, 800)).toBe(0);
    expect(wipeAmount(0, 800)).toBe(1);
    expect(wipeAmount(-500, 800)).toBe(1);
  });

  it('opens monotonically through the travel band', () => {
    const a = wipeAmount(600, 800);
    const b = wipeAmount(500, 800);
    const c = wipeAmount(400, 800);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(a).toBeGreaterThan(0);
  });

  it('normalizes bars against the tallest bucket', () => {
    expect(barHeight(5, 10)).toBe(50);
    expect(barHeight(10, 10)).toBe(100);
    expect(barHeight(0, 10)).toBe(0);
    // An empty distribution must not divide by zero.
    expect(barHeight(0, 0)).toBe(0);
  });

  it('keeps week markers on the rail', () => {
    expect(markPct(0)).toBe(0);
    expect(markPct(1)).toBeLessThan(100);
    expect(markPct(2)).toBe(markPct(1));
  });
});
