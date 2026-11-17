/**
 * Settings: pace, post-buzz clock, difficulty band, category filters, judge
 * strictness, and the local data controls.
 *
 * Everything is written through `useSettings`, which persists to localStorage
 * inside a try/catch. Storage throws in private mode and when site data is
 * blocked, so a failed write degrades to in-memory settings and says so rather
 * than breaking the screen.
 */

import { useEffect, useState } from 'react';
import {
  CATEGORIES,
  DIFFICULTY_LABELS,
  SUBCATEGORIES,
  type Category,
} from '../types';
import { STRICTNESS_RANGE } from '../engine/judge';
import { clear as clearLog, isEphemeral } from '../engine/log';
import {
  cacheCounts,
  clearCache,
  isCacheEphemeral,
  type CacheCounts,
} from '../data/cache';
import {
  Button,
  Chip,
  ChipRow,
  Field,
  Sheet,
  SliderField,
  POST_BUZZ_RANGE,
  WPM_RANGE,
  resetSettings,
  settingsArePersisted,
  subcategoriesFor,
  useSettings,
} from '../ui';
import { useAuth } from '../auth';
import SignIn from './SignIn';
import SignUp from './SignUp';

type AuthView = 'none' | 'signin' | 'signup';

export interface SettingsProps {
  /** Opens the admin dashboard. Provided by `App`; omitted in tests. */
  onOpenAdmin?(): void;
}

export default function Settings({ onOpenAdmin }: SettingsProps) {
  const [settings, set] = useSettings();
  const [counts, setCounts] = useState<CacheCounts | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [authView, setAuthView] = useState<AuthView>('none');
  const auth = useAuth();

  useEffect(() => {
    void cacheCounts().then(setCounts);
  }, []);

  const toggleCategory = (c: Category) => {
    const next = settings.categories.includes(c)
      ? settings.categories.filter((x) => x !== c)
      : [...settings.categories, c];
    // Dropping a category must drop its subcategories, or the filter would ask
    // for a subcategory outside every selected category and return nothing.
    const allowed = subcategoriesFor(next);
    set({
      categories: next,
      subcategories: settings.subcategories.filter((s) => allowed.includes(s)),
    });
  };

  const toggleSubcategory = (s: string) => {
    set({
      subcategories: settings.subcategories.includes(s)
        ? settings.subcategories.filter((x) => x !== s)
        : [...settings.subcategories, s],
    });
  };

  const visibleCategories: readonly Category[] =
    settings.categories.length > 0 ? settings.categories : CATEGORIES;

  const strictnessWord =
    settings.strictness <= 2
      ? 'lenient'
      : settings.strictness >= 10
        ? 'strict'
        : 'standard';

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">Settings</h1>
      </header>

      <div className="app__body">
        {!settingsArePersisted() ? (
          <p className="banner banner--warn">
            Settings cannot be saved in this browser, so these choices last for
            this session only.
          </p>
        ) : null}

        {authView === 'signin' ? (
          <SignIn
            onDone={() => setAuthView('none')}
            onCancel={() => setAuthView('none')}
            onSwitchToSignUp={() => setAuthView('signup')}
          />
        ) : authView === 'signup' ? (
          <SignUp
            onDone={() => setAuthView('none')}
            onCancel={() => setAuthView('none')}
            onSwitchToSignIn={() => setAuthView('signin')}
          />
        ) : (
          <Sheet title="Account">
            {auth.loading ? (
              <p className="tiny muted">Checking account.</p>
            ) : auth.user ? (
              <>
                <p className="tiny">
                  Signed in as <strong>{auth.user.username}</strong>
                  {auth.user.role === 'admin' ? ' (admin)' : ''}.
                </p>
                <div className="row">
                  <Button
                    small
                    variant="ghost"
                    onClick={() => {
                      void auth.signOut();
                    }}
                  >
                    Sign out
                  </Button>
                  {auth.user.role === 'admin' && onOpenAdmin ? (
                    <Button small variant="ghost" onClick={onOpenAdmin}>
                      Admin dashboard
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <p className="tiny muted">
                  An account is optional. Signing in lets you use the same
                  profile across devices.
                </p>
                <div className="row">
                  <Button small onClick={() => setAuthView('signin')}>
                    Sign in
                  </Button>
                  <Button small variant="ghost" onClick={() => setAuthView('signup')}>
                    Sign up
                  </Button>
                </div>
              </>
            )}
          </Sheet>
        )}

        <Sheet title="Reading">
          <SliderField
            label="words per minute"
            value={settings.wpm}
            min={WPM_RANGE.min}
            max={WPM_RANGE.max}
            step={5}
            format={(n) => `${n} wpm`}
            hint="Pacing is weighted by word length, so this is an average rather than a fixed delay per word."
            onChange={(wpm) => set({ wpm })}
          />
          <SliderField
            label="seconds after a buzz"
            value={settings.postBuzzSeconds}
            min={POST_BUZZ_RANGE.min}
            max={POST_BUZZ_RANGE.max}
            format={(n) => `${n}s`}
            hint="Real quizbowl gives about five seconds."
            onChange={(postBuzzSeconds) => set({ postBuzzSeconds })}
          />
        </Sheet>

        <Sheet title="Difficulty">
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
            hint="High school play sits at 3 to 5. The band is reordered automatically if you cross the two over."
            onChange={(maxDifficulty) => set({ maxDifficulty })}
          />
        </Sheet>

        <Sheet
          title="Categories"
          aside={
            settings.categories.length > 0 ? (
              <Button
                variant="ghost"
                small
                onClick={() => set({ categories: [], subcategories: [] })}
              >
                Clear
              </Button>
            ) : (
              <span className="tiny muted">all</span>
            )
          }
        >
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
        </Sheet>

        <Sheet
          title="Subcategories"
          aside={
            settings.subcategories.length > 0 ? (
              <Button
                variant="ghost"
                small
                onClick={() => set({ subcategories: [] })}
              >
                Clear
              </Button>
            ) : (
              <span className="tiny muted">all</span>
            )
          }
        >
          {visibleCategories.map((c) => (
            <Field key={c} label={c}>
              <ChipRow>
                {SUBCATEGORIES[c].map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    pressed={settings.subcategories.includes(s)}
                    onToggle={() => toggleSubcategory(s)}
                  />
                ))}
              </ChipRow>
            </Field>
          ))}
        </Sheet>

        <Sheet title="Judging">
          <SliderField
            label="strictness"
            value={settings.strictness}
            min={STRICTNESS_RANGE.lenient}
            max={STRICTNESS_RANGE.strict}
            format={(n) => `${n} / ${strictnessWord}`}
            hint="Lower is more forgiving. The middle of the range behaves identically, so move it to the ends to feel a difference. Typo tolerance comes from the answerline itself, not from this."
            onChange={(strictness) => set({ strictness })}
          />
        </Sheet>

        <Sheet title="Data">
          <p className="tiny muted">
            {counts
              ? `${counts.tossups} tossups and ${counts.bonuses} bonuses cached for offline play.`
              : 'Counting the offline cache.'}
          </p>
          {isEphemeral() || isCacheEphemeral() ? (
            <p className="banner banner--warn">
              Local storage is unavailable, so history and the offline cache
              live in memory for this session only.
            </p>
          ) : null}
          <div className="row">
            <Button
              small
              onClick={() => {
                void clearCache().then(() => {
                  setCounts({ tossups: 0, bonuses: 0 });
                  setNotice('Offline cache cleared.');
                });
              }}
            >
              Clear offline cache
            </Button>
            <Button
              small
              variant="ghost"
              onClick={() => {
                resetSettings();
                setNotice('Settings reset to defaults.');
              }}
            >
              Reset settings
            </Button>
          </div>
          <div className="row">
            {confirmClear ? (
              <>
                <Button
                  small
                  variant="danger"
                  onClick={() => {
                    void clearLog().then(() => {
                      setConfirmClear(false);
                      setNotice('Practice history deleted.');
                    });
                  }}
                >
                  Yes, delete my history
                </Button>
                <Button
                  small
                  variant="ghost"
                  onClick={() => setConfirmClear(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                small
                variant="danger"
                onClick={() => setConfirmClear(true)}
              >
                Delete practice history
              </Button>
            )}
          </div>
          {confirmClear ? (
            <p className="tiny muted">
              Every statistic is derived from the attempt log, so deleting it
              resets accuracy, power rate and the Learn tab. This cannot be
              undone.
            </p>
          ) : null}
          {notice ? <p className="tiny muted">{notice}</p> : null}
        </Sheet>
      </div>
    </>
  );
}
