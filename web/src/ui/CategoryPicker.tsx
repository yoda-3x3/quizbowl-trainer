/**
 * Category picker with expandable subcategories, used by the practice
 * sidebar and the Settings screen. The selection rules live in
 * `categorySelection.ts`; this is only the presentation.
 *
 * Each category is one row: the name toggles the whole category (and every
 * subcategory with it), and categories with more than one subcategory get a
 * disclosure button that opens their subcategory chips underneath. A partly
 * selected category shows how many of its subcategories are on.
 */

import { useState } from 'react';
import { CATEGORIES, SUBCATEGORIES, type Category } from '../types';
import {
  EVERYTHING,
  categoryState,
  describeSelection,
  hasSubcategories,
  isEverything,
  isSubcategoryOn,
  selectedCount,
  toggleCategory,
  toggleSubcategory,
  type CategorySelection,
} from './categorySelection';

export interface CategoryPickerProps {
  value: CategorySelection;
  onChange(next: CategorySelection): void;
}

export default function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  // Partly selected categories start open so the player can see why.
  const [open, setOpen] = useState<Set<Category>>(
    () => new Set(CATEGORIES.filter((c) => categoryState(value, c) === 'some')),
  );
  const everything = isEverything(value);

  const flip = (c: Category) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  return (
    <div className="catpick">
      <div className="catpick__head">
        <span className="catpick__summary" title={describeSelection(value)}>
          {describeSelection(value)}
        </span>
        <button
          type="button"
          className="catpick__all"
          onClick={() => onChange(EVERYTHING)}
          disabled={everything}
        >
          {everything ? 'all on' : 'reset to all'}
        </button>
      </div>
      {everything ? (
        <p className="catpick__hint">Pick categories to narrow the questions.</p>
      ) : null}
      <ul className="catpick__list">
        {CATEGORIES.map((c) => {
          const state = categoryState(value, c);
          const expandable = hasSubcategories(c);
          const isOpen = expandable && open.has(c);
          const total = SUBCATEGORIES[c].length;
          const panelId = `catpick-${c.replace(/\W+/g, '-').toLowerCase()}`;
          return (
            <li key={c} className={`catpick__row catpick__row--${state}`}>
              <div className="catpick__line">
                <button
                  type="button"
                  className="catpick__cat"
                  aria-pressed={state === 'all' ? true : state === 'some' ? 'mixed' : false}
                  onClick={() => onChange(toggleCategory(value, c))}
                >
                  <span className="catpick__box" aria-hidden="true" />
                  <span className="catpick__name">{c}</span>
                  {state === 'some' ? (
                    <span className="catpick__count">
                      {selectedCount(value, c)}/{total}
                    </span>
                  ) : null}
                </button>
                {expandable ? (
                  <button
                    type="button"
                    className="catpick__caret"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    aria-label={`${isOpen ? 'Hide' : 'Show'} ${c} subcategories`}
                    onClick={() => flip(c)}
                  >
                    <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                  </button>
                ) : null}
              </div>
              {isOpen ? (
                <div className="catpick__subs" id={panelId}>
                  {SUBCATEGORIES[c].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="chip catpick__sub"
                      aria-pressed={isSubcategoryOn(value, s)}
                      onClick={() => onChange(toggleSubcategory(value, s))}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
