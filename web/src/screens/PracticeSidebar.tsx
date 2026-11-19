/**
 * Right-hand settings panel for the Tossup and Bonus screens at >=900px.
 *
 * Mirrors the subset of `Settings.tsx` that a player tweaks mid-practice: pace,
 * post-buzz clock, difficulty band, top-level categories, and judge strictness.
 * Every control is a thin wrapper over the same shared primitives
 * (`SliderField`, `Chip`, `ChipRow`, `Button`) that Settings uses, and reads
 * from and writes to the same `useSettings` store — never its own copy. A
 * change here immediately feeds back into the reader because the parent
 * screens pull from the same hook.
 *
 * Hidden entirely below 900px via CSS; the practice screens keep their
 * single-column layout at phone widths.
 */

import { DIFFICULTY_LABELS, CATEGORIES, type Category } from '../types';
import { STRICTNESS_RANGE } from '../engine/judge';
import {
  Button,
  Chip,
  ChipRow,
  POST_BUZZ_RANGE,
  SliderField,
  WPM_RANGE,
  subcategoriesFor,
  useSettings,
} from '../ui';

export default function PracticeSidebar() {
  const [settings, set] = useSettings();

  const toggleCategory = (c: Category) => {
    const next = settings.categories.includes(c)
      ? settings.categories.filter((x) => x !== c)
      : [...settings.categories, c];
    // Dropping a category must drop its subcategories, same guarantee Settings
    // enforces: the filter would otherwise ask for a subcategory outside
    // every selected category and return nothing.
    const allowed = subcategoriesFor(next);
    set({
      categories: next,
      subcategories: settings.subcategories.filter((s) => allowed.includes(s)),
    });
  };

  const strictnessWord =
    settings.strictness <= 2
      ? 'lenient'
      : settings.strictness >= 10
        ? 'strict'
        : 'standard';

  return (
    <aside className="practice-sidebar" aria-label="Practice settings">
      <div className="practice-sidebar__scroll">
        <section className="practice-sidebar__section">
          <h2 className="practice-sidebar__title">Reading</h2>
          <SliderField
            label="words per minute"
            value={settings.wpm}
            min={WPM_RANGE.min}
            max={WPM_RANGE.max}
            step={5}
            format={(n) => `${n} wpm`}
            onChange={(wpm) => set({ wpm })}
          />
          <SliderField
            label="seconds after a buzz"
            value={settings.postBuzzSeconds}
            min={POST_BUZZ_RANGE.min}
            max={POST_BUZZ_RANGE.max}
            format={(n) => `${n}s`}
            onChange={(postBuzzSeconds) => set({ postBuzzSeconds })}
          />
        </section>

        <section className="practice-sidebar__section">
          <h2 className="practice-sidebar__title">Difficulty</h2>
          <SliderField
            label="easiest"
            value={settings.minDifficulty}
            min={0}
            max={10}
            format={(n) => `${n} / ${DIFFICULTY_LABELS[n] ?? ''}`}
            onChange={(minDifficulty) => set({ minDifficulty })}
          />
          <SliderField
            label="hardest"
            value={settings.maxDifficulty}
            min={0}
            max={10}
            format={(n) => `${n} / ${DIFFICULTY_LABELS[n] ?? ''}`}
            onChange={(maxDifficulty) => set({ maxDifficulty })}
          />
        </section>

        <section className="practice-sidebar__section">
          <div className="practice-sidebar__row">
            <h2 className="practice-sidebar__title">Categories</h2>
            {settings.categories.length > 0 ? (
              <Button
                variant="ghost"
                small
                onClick={() =>
                  set({ categories: [], subcategories: [] })
                }
              >
                Clear
              </Button>
            ) : (
              <span className="tiny muted">all</span>
            )}
          </div>
          <ChipRow>
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={c}
                pressed={settings.categories.includes(c)}
                onToggle={() => toggleCategory(c)}
              />
            ))}
          </ChipRow>
        </section>

        <section className="practice-sidebar__section">
          <h2 className="practice-sidebar__title">Judging</h2>
          <SliderField
            label="strictness"
            value={settings.strictness}
            min={STRICTNESS_RANGE.lenient}
            max={STRICTNESS_RANGE.strict}
            format={(n) => `${n} / ${strictnessWord}`}
            onChange={(strictness) => set({ strictness })}
          />
        </section>
      </div>
    </aside>
  );
}
