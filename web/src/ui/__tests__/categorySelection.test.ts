import { describe, expect, it } from 'vitest';
import { SUBCATEGORIES } from '../../types';
import {
  EVERYTHING,
  canonicalSelection,
  categoryOf,
  categoryState,
  describeSelection,
  hasSubcategories,
  isEverything,
  isSubcategoryOn,
  onlyCategory,
  selectedCount,
  toggleCategory,
  toggleSubcategory,
  type CategorySelection,
} from '../categorySelection';
import { filtersFrom, normalizeSettings } from '../useSettings';

const lit = SUBCATEGORIES.Literature;

describe('categoryOf / hasSubcategories', () => {
  it('maps a subcategory to its category', () => {
    expect(categoryOf('Biology')).toBe('Science');
    expect(categoryOf('Religion')).toBe('Religion');
    expect(categoryOf('Not a thing')).toBeNull();
  });

  it('only multi-subcategory categories expand', () => {
    expect(hasSubcategories('Literature')).toBe(true);
    expect(hasSubcategories('Philosophy')).toBe(false);
  });
});

describe('toggleCategory', () => {
  it('turning a category on selects all its subcategories', () => {
    const s = toggleCategory(EVERYTHING, 'Literature');
    expect(s).toEqual({ categories: ['Literature'], subcategories: [] });
    expect(categoryState(s, 'Literature')).toBe('all');
    for (const sub of lit) expect(isSubcategoryOn(s, sub)).toBe(true);
    expect(isEverything(s)).toBe(false);
  });

  it('turning it off again drops it and its subcategories', () => {
    const on = toggleCategory(EVERYTHING, 'Literature');
    const partial = toggleSubcategory(on, 'American Literature');
    const off = toggleCategory(partial, 'Literature');
    expect(off).toEqual(EVERYTHING);
    expect(isEverything(off)).toBe(true);
  });

  it('keeps categories in canonical order regardless of click order', () => {
    const s = toggleCategory(toggleCategory(EVERYTHING, 'Science'), 'Literature');
    expect(s.categories).toEqual(['Literature', 'Science']);
  });
});

describe('toggleSubcategory', () => {
  it('turning one off leaves the category partly selected', () => {
    const s = toggleSubcategory(toggleCategory(EVERYTHING, 'Literature'), 'American Literature');
    expect(categoryState(s, 'Literature')).toBe('some');
    expect(selectedCount(s, 'Literature')).toBe(lit.length - 1);
    expect(isSubcategoryOn(s, 'American Literature')).toBe(false);
    expect(s.subcategories).toEqual(lit.filter((x) => x !== 'American Literature'));
  });

  it('lists every subcategory of the other selected categories once narrowed', () => {
    // The API ANDs category and subcategory, so Science must stay listed.
    let s = toggleCategory(EVERYTHING, 'Literature');
    s = toggleCategory(s, 'Science');
    s = toggleSubcategory(s, 'British Literature');
    expect(s.categories).toEqual(['Literature', 'Science']);
    for (const sub of SUBCATEGORIES.Science) expect(s.subcategories).toContain(sub);
    expect(s.subcategories).not.toContain('British Literature');
  });

  it('turning off the last subcategory turns the category off', () => {
    let s: CategorySelection = toggleSubcategory(EVERYTHING, 'Physics');
    expect(s).toEqual({ categories: ['Science'], subcategories: ['Physics'] });
    s = toggleSubcategory(s, 'Physics');
    expect(s).toEqual(EVERYTHING);
  });

  it('turning one on under an unselected category selects just that one', () => {
    const s = toggleSubcategory(onlyCategory('History'), 'Biology');
    expect(s.categories).toEqual(['History', 'Science']);
    expect(categoryState(s, 'History')).toBe('all');
    expect(categoryState(s, 'Science')).toBe('some');
    expect(s.subcategories).toEqual([...SUBCATEGORIES.History, 'Biology']);
  });

  it('re-selecting every subcategory collapses back to the short form', () => {
    let s = toggleSubcategory(onlyCategory('Science'), 'Physics');
    s = toggleSubcategory(s, 'Physics');
    expect(s).toEqual({ categories: ['Science'], subcategories: [] });
  });

  it('ignores unknown subcategories', () => {
    expect(toggleSubcategory(onlyCategory('Science'), 'Nope')).toEqual(onlyCategory('Science'));
  });
});

describe('canonicalSelection', () => {
  it('reads a selected category with none of its subcategories listed as the whole category', () => {
    const s = canonicalSelection({
      categories: ['Literature', 'Science'],
      subcategories: ['British Literature'],
    });
    expect(categoryState(s, 'Science')).toBe('all');
    expect(s.subcategories).toEqual(['British Literature', ...SUBCATEGORIES.Science]);
  });

  it('drops subcategories whose category is not selected', () => {
    const s = canonicalSelection({
      categories: ['Science'],
      subcategories: ['Biology', 'American History'],
    });
    expect(s).toEqual({ categories: ['Science'], subcategories: ['Biology'] });
  });

  it('is idempotent', () => {
    const once = canonicalSelection({ categories: [], subcategories: ['Poetry?', 'Music', 'Biology'] });
    expect(canonicalSelection(once)).toEqual(once);
  });

  it('feeds straight into the query filters', () => {
    const settings = normalizeSettings({
      categories: ['Literature', 'Pop Culture'],
      subcategories: ['Music'],
    });
    const f = filtersFrom(settings);
    expect(f.categories).toEqual(['Literature', 'Pop Culture']);
    expect(f.subcategories).toEqual([...lit, 'Music']);
  });
});

describe('describeSelection', () => {
  it('summarises the selection', () => {
    expect(describeSelection(EVERYTHING)).toBe('All categories');
    expect(describeSelection(onlyCategory('Science'))).toBe('Science');
    const partial = toggleSubcategory(onlyCategory('Science'), 'Physics');
    expect(describeSelection(partial)).toBe('Science (3/4)');
    let many = EVERYTHING;
    for (const c of ['Literature', 'History', 'Science', 'Geography'] as const) {
      many = toggleCategory(many, c);
    }
    expect(describeSelection(many)).toBe('4 categories');
  });
});
