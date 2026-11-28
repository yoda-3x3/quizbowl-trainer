/**
 * App shell: five tabs at the bottom, one screen at a time.
 *
 * No router. The app is a single-screen-at-a-time PWA with five destinations
 * and no deep links to honour yet, so a router would add a dependency and a
 * history model for nothing. Practice keeps its own sub-view, so leaving the
 * tab and coming back lands where you were.
 *
 * The bottom bar is Practice / Learn / Rooms / Tournaments / Settings.
 * Tournaments earns its own top-level tab because hosting, joining and the
 * protest flow all live under it; see NOTES.md for the deviation from the
 * earlier four-tab brief. Ear training, OAC match and packet import stay as
 * practice modes rather than tabs so the bar remains thumb-sized at 390px.
 *
 * Learn renders the scroll-driven study surface. Rooms renders the real
 * multiplayer screen, which already works against the Durable Object.
 */

import { useMemo, useState, type ReactNode } from 'react';
import Home, { type PracticeMode } from './screens/Home';
import Tossup from './screens/Tossup';
import Bonus from './screens/Bonus';
import Starred from './screens/Starred';
import EarHub from './ear/EarHub';
import PacketImport from './screens/Import';
import SettingsScreen from './screens/Settings';
import Rooms from './screens/Rooms';
import Learn from './screens/Learn';
import OacMatch from './screens/OacMatch';
import StudyMode from './art/StudyMode';
import Tournaments from './screens/Tournaments';
import Admin from './screens/Admin';
import { Button, Sheet, TabBar, useSettings, type TabItem } from './ui';
import { useShortcuts } from './shortcuts';
import { directionBetween, flipPage } from './ui/pageFlip';
import { useAuth } from './auth';
import ThemeBackdrop from './ThemeBackdrop';

type TabId = 'practice' | 'learn' | 'rooms' | 'tournaments' | 'settings';
type PracticeView = 'home' | PracticeMode;

const TABS: readonly TabItem<TabId>[] = [
  { id: 'practice', label: 'Practice', glyph: '▶' },
  { id: 'learn', label: 'Learn', glyph: '◈' },
  { id: 'rooms', label: 'Rooms', glyph: '▦' },
  { id: 'tournaments', label: 'Tourneys', glyph: '♛' },
  { id: 'settings', label: 'Settings', glyph: '⚙' },
];

export default function App() {
  const [tab, setTabNow] = useState<TabId>('practice');
  const [practice, setPracticeNow] = useState<PracticeView>('home');
  const [showHelp, setShowHelp] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const auth = useAuth();
  const [settings] = useSettings();
  const theme = settings.theme;

  // Every screen change turns the page like a book: forward to a later tab or
  // into a practice mode, back to an earlier tab or out to the practice home.
  const setTab = (next: TabId) => {
    if (next === tab) return;
    const order = TABS.map((t) => t.id);
    flipPage(() => setTabNow(next), directionBetween(order, tab, next));
  };
  const setPractice = (next: PracticeView) => {
    if (next === practice) return;
    flipPage(() => setPracticeNow(next), next === 'home' ? 'back' : 'forward');
  };
  const toHome = () => setPractice('home');
  const isAdmin = auth.user?.role === 'admin';

  // Global shortcuts. Tossup owns Space (buzz) and Enter (next) in its own
  // phase-aware handler, so those are deliberately absent here; the two never
  // see the same keypress because Tossup prevents the default before it
  // bubbles. The admin shortcut (`A`) is silently a no-op for non-admins so a
  // typo on a real keyboard does not reveal a hidden surface.
  const shortcuts = useMemo(
    () => ({
      '1': () => setTab('practice'),
      '2': () => setTab('learn'),
      '3': () => setTab('rooms'),
      '4': () => setTab('tournaments'),
      '5': () => setTab('settings'),
      a: () => {
        if (isAdmin) setShowAdmin(true);
      },
      '?': () => setShowHelp((v) => !v),
      Escape: () => {
        if (showHelp) {
          setShowHelp(false);
          return;
        }
        if (showAdmin) {
          setShowAdmin(false);
          return;
        }
        if (tab === 'practice' && practice !== 'home') toHome();
      },
    }),
    [practice, showHelp, showAdmin, tab, isAdmin],
  );
  useShortcuts(shortcuts);

  if (showAdmin) {
    // Ignores the chosen theme on purpose: the admin dashboard stays plain
    // black-on-white whatever theme the admin picked (see admin.css).
    return (
      <div className="app app--admin">
        <Admin onExit={() => setShowAdmin(false)} />
        {showHelp ? <ShortcutsHelp onClose={() => setShowHelp(false)} isAdmin={isAdmin} /> : null}
      </div>
    );
  }

  return (
    <div className="app" data-theme={theme}>
      <ThemeBackdrop theme={theme} />
      {/* `key={tab}` remounts this wrapper on every tab switch, which is
          what makes the entrance animation below replay each time — without
          it, React would just patch the existing DOM and no transition would
          fire. Each tab's own component is prop-driven from state that lives
          in App (practice/theme/etc.), so remounting it loses nothing. */}
      <div className="tab-page" key={tab}>
        {tab === 'practice' ? (
          <Practice
            view={practice}
            onStart={setPractice}
            onExit={toHome}
            onOpenSettings={() => setTab('settings')}
          />
        ) : null}

        {tab === 'learn' ? <Learn /> : null}

        {tab === 'rooms' ? (
          <Screen title="Rooms">
            <Rooms />
          </Screen>
        ) : null}

        {tab === 'tournaments' ? <Tournaments /> : null}

        {tab === 'settings' ? (
          <SettingsScreen onOpenAdmin={() => setShowAdmin(true)} />
        ) : null}
      </div>

      {showHelp ? <ShortcutsHelp onClose={() => setShowHelp(false)} isAdmin={isAdmin} /> : null}

      <TabBar<TabId> items={TABS} active={tab} onSelect={setTab} />
      <div
        className="pre-alpha-badge"
        aria-label="This build is pre-alpha"
        title="Early build. Expect missing features and bugs."
      >
        pre-alpha
      </div>
    </div>
  );
}

function ShortcutsHelp({
  onClose,
  isAdmin,
}: {
  onClose(): void;
  isAdmin: boolean;
}) {
  return (
    <div
      className="modal__scrim"
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: '100%' }}>
        <Sheet
          title="Keyboard shortcuts"
          aside={
            <Button variant="ghost" small onClick={onClose}>
              Close
            </Button>
          }
        >
          <ShortcutRow keys={['1', '2', '3', '4', '5']} label="Switch tabs (Practice, Learn, Rooms, Tourneys, Settings)" />
          <ShortcutRow keys={['T']} label="Tossups" />
          <ShortcutRow keys={['B']} label="Bonuses" />
          <ShortcutRow keys={['R']} label="Replay starred questions" />
          <ShortcutRow keys={['E']} label="Ear training" />
          <ShortcutRow keys={['V']} label="Vision trainer" />
          <ShortcutRow keys={['O']} label="OAC match" />
          <ShortcutRow keys={['I']} label="Import a packet" />
          <ShortcutRow keys={['Space']} label="Buzz (while reading)" />
          <ShortcutRow keys={['Enter']} label="Submit answer, or next question" />
          <ShortcutRow keys={['Shift', 'Enter']} label="I don't know (give up, see the answer)" />
          <ShortcutRow keys={['N']} label="Skip the question, or go to the next one" />
          <ShortcutRow keys={['S']} label="Star the current question for later" />
          <ShortcutRow keys={['K']} label="Hide or show the current question (for reading aloud)" />
          <ShortcutRow keys={['Y']} label="Copy the current question's ID to the clipboard" />
          <ShortcutRow keys={['Esc']} label="Back to Practice home" />
          {isAdmin ? (
            <ShortcutRow keys={['A']} label="Open the admin dashboard" />
          ) : null}
          <ShortcutRow keys={['?']} label="Show or hide this card" />
        </Sheet>
      </div>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <p className="tiny" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span style={{ display: 'inline-flex', gap: 4, minWidth: 90 }}>
        {keys.map((k) => (
          <kbd
            key={k}
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11,
              padding: '1px 6px',
              border: '1px solid var(--line, #333)',
              borderRadius: 4,
              background: 'var(--surface-2, #1a1d22)',
            }}
          >
            {k}
          </kbd>
        ))}
      </span>
      <span>{label}</span>
    </p>
  );
}

function Practice({
  view,
  onStart,
  onExit,
  onOpenSettings,
}: {
  view: PracticeView;
  onStart(mode: PracticeMode): void;
  onExit(): void;
  onOpenSettings(): void;
}) {
  switch (view) {
    case 'tossup':
      return <Tossup onExit={onExit} />;
    case 'bonus':
      return <Bonus onExit={onExit} />;
    case 'starred':
      return <Starred onExit={onExit} />;
    case 'ear':
      return (
        <Screen title="Ear training" onExit={onExit}>
          <EarHub />
        </Screen>
      );
    case 'vision':
      return (
        <Screen title="Vision trainer" onExit={onExit}>
          <StudyMode />
        </Screen>
      );
    case 'oac':
      return (
        <Screen title="OAC match" onExit={onExit}>
          <OacMatch />
        </Screen>
      );
    case 'import':
      return (
        <Screen title="Import a packet" onExit={onExit}>
          <PacketImport />
        </Screen>
      );
    default:
      return <Home onStart={onStart} onOpenSettings={onOpenSettings} />;
  }
}

/** Topbar plus body, for screens that render only their own content. */
function Screen({
  title,
  onExit,
  children,
}: {
  title: string;
  onExit?(): void;
  children: ReactNode;
}) {
  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">{title}</h1>
        {onExit ? (
          <div className="topbar__right">
            <Button variant="ghost" small onClick={onExit}>
              Done
            </Button>
          </div>
        ) : null}
      </header>
      <div className="app__body">{children}</div>
    </>
  );
}
