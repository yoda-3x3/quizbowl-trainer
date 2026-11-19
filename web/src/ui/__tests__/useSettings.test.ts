import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  POST_BUZZ_RANGE,
  WPM_RANGE,
  filtersFrom,
  getSettings,
  loadSettings,
  normalizeSettings,
  resetSettings,
  subcategoriesFor,
  updateSettings,
  __resetSettings,
} from '../useSettings';

beforeEach(() => {
  __resetSettings();
});

describe('normalizeSettings', () => {
  it('falls back to defaults for junk', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps pace and clock into range', () => {
    const s = normalizeSettings({ wpm: 9000, postBuzzSeconds: -4 });
    expect(s.wpm).toBe(WPM_RANGE.max);
    expect(s.postBuzzSeconds).toBe(POST_BUZZ_RANGE.min);
  });

  it('clamps strictness to 1-12', () => {
    expect(normalizeSettings({ strictness: 0 }).strictness).toBe(1);
    expect(normalizeSettings({ strictness: 99 }).strictness).toBe(12);
  });

  it('reorders a crossed difficulty band', () => {
    const s = normalizeSettings({ minDifficulty: 8, maxDifficulty: 2 });
    expect(s.minDifficulty).toBe(2);
    expect(s.maxDifficulty).toBe(8);
  });

  it('drops categories that are not real categories', () => {
    const s = normalizeSettings({
      categories: ['Science', 'science', 'Wizardry', 7],
    });
    expect(s.categories).toEqual(['Science']);
  });

  it('drops subcategories outside the selected categories', () => {
    const s = normalizeSettings({
      categories: ['Science'],
      subcategories: ['Biology', 'American History'],
    });
    expect(s.subcategories).toEqual(['Biology']);
  });

  it('keeps any subcategory when no category is selected', () => {
    const s = normalizeSettings({
      categories: [],
      subcategories: ['Biology', 'American History'],
    });
    expect(s.subcategories).toEqual(['Biology', 'American History']);
  });

  it('rejects a non-numeric pace rather than storing NaN', () => {
    expect(normalizeSettings({ wpm: 'fast' }).wpm).toBe(WPM_RANGE.min);
  });

  it('normalizes an unknown theme to classic', () => {
    expect(normalizeSettings({ theme: 'punk-rock' }).theme).toBe('classic');
    expect(normalizeSettings({ theme: 123 }).theme).toBe('classic');
    expect(normalizeSettings({}).theme).toBe('classic');
  });

  it('keeps a valid theme intact', () => {
    expect(normalizeSettings({ theme: 'art' }).theme).toBe('art');
    expect(normalizeSettings({ theme: 'math' }).theme).toBe('math');
  });
});

describe('subcategoriesFor', () => {
  it('expands the selected categories', () => {
    expect(subcategoriesFor(['Science'])).toEqual([
      'Biology',
      'Chemistry',
      'Physics',
      'Other Science',
    ]);
  });

  it('returns every subcategory when nothing is selected', () => {
    expect(subcategoriesFor([]).length).toBeGreaterThan(20);
  });
});

describe('filtersFrom', () => {
  it('expands the difficulty band into the list the API wants', () => {
    const f = filtersFrom({ ...DEFAULT_SETTINGS });
    expect(f.difficulties).toEqual([3, 4, 5]);
    expect(f.standardOnly).toBe(true);
  });

  it('handles a single-value band', () => {
    const f = filtersFrom({
      ...DEFAULT_SETTINGS,
      minDifficulty: 4,
      maxDifficulty: 4,
    });
    expect(f.difficulties).toEqual([4]);
  });

  it('passes categories through with their capitalization intact', () => {
    const f = filtersFrom({ ...DEFAULT_SETTINGS, categories: ['Fine Arts'] });
    expect(f.categories).toEqual(['Fine Arts']);
  });

  it('copies the arrays so mutating the filter cannot edit settings', () => {
    const s = { ...DEFAULT_SETTINGS, categories: ['History' as const] };
    const f = filtersFrom(s);
    f.categories.push('Science');
    expect(s.categories).toEqual(['History']);
  });
});

describe('the store', () => {
  it('normalizes on update', () => {
    updateSettings({ wpm: 10_000 });
    expect(getSettings().wpm).toBe(WPM_RANGE.max);
  });

  it('resets to defaults', () => {
    updateSettings({ wpm: 240, categories: ['Religion'] });
    expect(resetSettings()).toEqual(DEFAULT_SETTINGS);
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('loads defaults when storage is unavailable', () => {
    // There is no localStorage in the node test environment, which is the same
    // shape of failure as private mode.
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
