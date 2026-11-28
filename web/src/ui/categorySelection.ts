/**
 * Category + subcategory selection, modeled on QB Reader's category picker.
 *
 * The interaction (not the code) follows qbreader.org: turning a category on
 * turns on every one of its subcategories, a subcategory can then be turned
 * off on its own, turning off a category's last subcategory turns the
 * category off, and turning on a subcategory of an unselected category
 * selects that category with just that subcategory.
 *
 * Storage stays the shape `Settings` has always had: `categories` and
 * `subcategories`, where both empty means "everything". The one rule this
 * module adds is a canonical form that the QB Reader query can take at face
 * value. The API filters on category AND subcategory, so a subcategory list
 * that names British Literature but nothing from Science would silently drop
 * every Science question even though Science is selected. Canonically,
 * `subcategories` is either empty (every subcategory of the selected
 * categories) or the complete list of wanted subcategories across all of them.
 */

import { CATEGORIES, SUBCATEGORIES, type Category } from '../types';

export interface CategorySelection {
  categories: Category[];
  subcategories: string[];
}

/** Which category a subcategory belongs to, or null for an unknown name. */
export function categoryOf(sub: string): Category | null {
  for (const c of CATEGORIES) {
    if (SUBCATEGORIES[c].includes(sub)) return c;
  }
  return null;
}

/** True when a category has subcategories worth expanding (more than one). */
export function hasSubcategories(c: Category): boolean {
  return SUBCATEGORIES[c].length > 1;
}

type Expanded = Map<Category, Set<string>>;

/**
 * The selection as "category -> chosen subcategories". An empty map means
 * nothing is narrowed, i.e. every question.
 *
 * Tolerates the non-canonical shapes older builds could store:
 *  - subcategories with no categories: the owning categories are inferred.
 *  - a selected category none of whose subcategories are listed while other
 *    categories' are: read as the whole category, which is what the player
 *    asked for when they picked it.
 */
function expand(sel: CategorySelection): Expanded {
  const subs = sel.subcategories.filter((s) => categoryOf(s) !== null);
  let cats: Category[] = sel.categories.filter((c) =>
    (CATEGORIES as readonly string[]).includes(c),
  );
  if (cats.length === 0 && subs.length > 0) {
    cats = CATEGORIES.filter((c) => subs.some((s) => categoryOf(s) === c));
  }

  const out: Expanded = new Map();
  for (const c of CATEGORIES) {
    if (!cats.includes(c)) continue;
    const own = SUBCATEGORIES[c].filter((s) => subs.includes(s));
    out.set(c, new Set(own.length > 0 ? own : SUBCATEGORIES[c]));
  }
  return out;
}

function compact(map: Expanded): CategorySelection {
  const categories = CATEGORIES.filter((c) => (map.get(c)?.size ?? 0) > 0);
  const full = categories.every(
    (c) => map.get(c)!.size === SUBCATEGORIES[c].length,
  );
  if (full) return { categories, subcategories: [] };
  const subcategories: string[] = [];
  for (const c of categories) {
    for (const s of SUBCATEGORIES[c]) {
      if (map.get(c)!.has(s)) subcategories.push(s);
    }
  }
  return { categories, subcategories };
}

/** Rewrites any stored selection into the canonical form described above. */
export function canonicalSelection(sel: CategorySelection): CategorySelection {
  return compact(expand(sel));
}

/** Nothing narrowed: every category and subcategory is in play. */
export function isEverything(sel: CategorySelection): boolean {
  return expand(sel).size === 0;
}

export type CategoryState = 'all' | 'some' | 'none';

/** Whether a category is fully, partly or not selected. */
export function categoryState(sel: CategorySelection, c: Category): CategoryState {
  const chosen = expand(sel).get(c);
  if (!chosen) return 'none';
  return chosen.size === SUBCATEGORIES[c].length ? 'all' : 'some';
}

/** Whether a subcategory is explicitly selected. */
export function isSubcategoryOn(sel: CategorySelection, sub: string): boolean {
  const c = categoryOf(sub);
  if (!c) return false;
  return expand(sel).get(c)?.has(sub) ?? false;
}

/** How many of a category's subcategories are selected. */
export function selectedCount(sel: CategorySelection, c: Category): number {
  return expand(sel).get(c)?.size ?? 0;
}

/**
 * Category toggle. A fully selected or partly selected category turns off
 * (with its subcategories); an unselected one turns on with all of them.
 */
export function toggleCategory(
  sel: CategorySelection,
  c: Category,
): CategorySelection {
  const map = expand(sel);
  if (map.has(c)) map.delete(c);
  else map.set(c, new Set(SUBCATEGORIES[c]));
  return compact(map);
}

/**
 * Subcategory toggle. Turning one on under an unselected category selects
 * that category with just this subcategory; turning off the last one turns
 * the category off.
 */
export function toggleSubcategory(
  sel: CategorySelection,
  sub: string,
): CategorySelection {
  const c = categoryOf(sub);
  if (!c) return canonicalSelection(sel);
  const map = expand(sel);
  const chosen = map.get(c);
  if (!chosen) {
    map.set(c, new Set([sub]));
  } else if (chosen.has(sub)) {
    chosen.delete(sub);
    if (chosen.size === 0) map.delete(c);
  } else {
    chosen.add(sub);
  }
  return compact(map);
}

/** Select only this category (all of its subcategories). */
export function onlyCategory(c: Category): CategorySelection {
  return { categories: [c], subcategories: [] };
}

/** Back to everything. */
export const EVERYTHING: CategorySelection = Object.freeze({
  categories: [],
  subcategories: [],
}) as CategorySelection;

/**
 * Short human summary: "All categories", "Science", "Literature (2/6),
 * History", or "4 categories" once it gets long.
 */
export function describeSelection(sel: CategorySelection): string {
  const map = expand(sel);
  if (map.size === 0) return 'All categories';
  const parts = [...map.entries()].map(([c, chosen]) =>
    chosen.size === SUBCATEGORIES[c].length
      ? c
      : `${c} (${chosen.size}/${SUBCATEGORIES[c].length})`,
  );
  return parts.length > 3 ? `${parts.length} categories` : parts.join(', ');
}
