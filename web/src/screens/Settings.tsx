/**
 * Settings: pace, post-buzz clock, difficulty band, category filters, judge
 * strictness, and the local data controls.
 *
 * Everything is written through `useSettings`, which persists to localStorage
 * inside a try/catch. Storage throws in private mode and when site data is
 * blocked, so a failed write degrades to in-memory settings and says so rather
 * than breaking the screen.
 */

import { useEffect, useState, type KeyboardEvent } from 'react';
import {
  DIFFICULTY_LABELS,
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
  CategoryPicker,
  Sheet,
  SliderField,
  POST_BUZZ_RANGE,
  THEMES,
  WPM_RANGE,
  resetSettings,
  settingsArePersisted,
  useSettings,
  type ThemeId,
} from '../ui';
import { THEME_VISUALS } from '../ThemeBackdrop';
import { useAuth } from '../auth';
import { useMyRating } from '../rank';
import RankBadge from '../RankBadge';
import SignIn from './SignIn';
import SignUp from './SignUp';
import VoiceToggles from '../voice/VoiceToggles';

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
  const myRating = useMyRating(auth.user !== null);

  useEffect(() => {
    void cacheCounts().then(setCounts);
  }, []);

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
                {myRating.rating ? (
                  <RankBadge rating={myRating.rating} />
                ) : myRating.loading ? (
                  <p className="tiny muted">Loading rank.</p>
                ) : null}
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

        <Sheet title="Voice">
          <VoiceToggles explain />
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

        <Sheet title="Categories">
          <CategoryPicker
            value={settings}
            onChange={({ categories, subcategories }) =>
              set({ categories, subcategories })
            }
          />
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

        <Sheet title="Theme">
          <p className="tiny muted">
            Each named theme anchors on a public-domain painting. Classic is
            the default dark palette with no backdrop.
          </p>
          <ThemePicker
            value={settings.theme}
            onPick={(theme) => set({ theme })}
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

/**
 * Six labelled swatches, including Classic. The swatch IS the painting,
 * cropped square; Classic shows a flat colour chip because it has no
 * backdrop. Picker is a radiogroup for keyboard users: tab lands on the
 * current pick, arrow keys move, Enter / Space commits.
 */
function ThemePicker({
  value,
  onPick,
}: {
  value: ThemeId;
  onPick(next: ThemeId): void;
}) {
  const ids = THEMES.map((t) => t.id);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, id: ThemeId) => {
    const idx = ids.indexOf(id);
    if (idx < 0) return;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % ids.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (idx - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ids.length - 1;
    else return;
    e.preventDefault();
    const nextId = ids[next];
    if (nextId) onPick(nextId);
  };

  return (
    <div
      className="theme-picker"
      role="radiogroup"
      aria-label="Theme"
      style={{
        display: 'grid',
        gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))',
      }}
    >
      {THEMES.map((t) => {
        const selected = t.id === value;
        const image = t.id === 'classic' ? null : THEME_VISUALS[t.id].image;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onPick(t.id)}
            onKeyDown={(e) => onKey(e, t.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: 6,
              borderRadius: 'var(--radius)',
              border: `1px solid ${selected ? 'var(--accent)' : 'var(--line)'}`,
              background: 'var(--panel-2)',
              color: 'var(--ink)',
              cursor: 'pointer',
              outline: 'none',
              boxShadow: selected
                ? '0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent)'
                : 'none',
              transition:
                'border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)',
            }}
          >
            <span
              aria-hidden="true"
              data-theme-swatch={t.id}
              style={{
                display: 'block',
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: 4,
                border: '1px solid var(--line)',
                background:
                  image !== null
                    ? `center / cover no-repeat url(${image})`
                    : 'linear-gradient(135deg, #171c23 0%, #2a323d 100%)',
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              {t.label}
            </span>
            <span className="tiny muted" style={{ lineHeight: 1.35 }}>
              {t.caption}
            </span>
          </button>
        );
      })}
    </div>
  );
}
