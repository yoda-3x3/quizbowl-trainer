/**
 * App shell: four tabs at the bottom, one screen at a time.
 *
 * No router. The app is a single-screen-at-a-time PWA with four destinations
 * and no deep links to honour yet, so a router would add a dependency and a
 * history model for nothing. Practice keeps its own sub-view, so leaving the
 * tab and coming back lands where you were.
 *
 * The bottom bar stays at Practice / Learn / Rooms / Settings. Ear training,
 * OAC match and packet import are practice modes rather than tabs: a six item
 * bar stops being thumb-sized at 390px, and each of them is still one tap from
 * the Practice home.
 *
 * Learn renders the scroll-driven study surface. Rooms renders the real
 * multiplayer screen, which already works against the Durable Object.
 */

import { useMemo, useState, type ReactNode } from 'react';
import Home, { type PracticeMode } from './screens/Home';
import Tossup from './screens/Tossup';
import Bonus from './screens/Bonus';
import EarHub from './ear/EarHub';
import PacketImport from './screens/Import';
import SettingsScreen from './screens/Settings';
import Rooms from './screens/Rooms';
import Learn from './screens/Learn';
import OacMatch from './screens/OacMatch';
import StudyMode from './art/StudyMode';
import { Button, Sheet, TabBar, type TabItem } from './ui';
import { useShortcuts } from './shortcuts';

type TabId = 'practice' | 'learn' | 'rooms' | 'settings';
type PracticeView = 'home' | PracticeMode;

const TABS: readonly TabItem<TabId>[] = [
  { id: 'practice', label: 'Practice', glyph: '▶' },
  { id: 'learn', label: 'Learn', glyph: '◈' },
  { id: 'rooms', label: 'Rooms', glyph: '▦' },
  { id: 'settings', label: 'Settings', glyph: '⚙' },
];

export default function App() {
  const [tab, setTab] = useState<TabId>('practice');
  const [practice, setPractice] = useState<PracticeView>('home');
  const [showHelp, setShowHelp] = useState(false);

  const toHome = () => setPractice('home');

  // Global shortcuts. Tossup owns Space (buzz) and Enter (next) in its own
  // phase-aware handler, so those are deliberately absent here; the two never
  // see the same keypress because Tossup prevents the default before it
  // bubbles.
  const shortcuts = useMemo(
    () => ({
      '1': () => setTab('practice'),
      '2': () => setTab('learn'),
      '3': () => setTab('rooms'),
      '4': () => setTab('settings'),
      '?': () => setShowHelp((v) => !v),
      Escape: () => {
        if (showHelp) {
          setShowHelp(false);
          return;
        }
        if (tab === 'practice' && practice !== 'home') toHome();
      },
    }),
    [practice, showHelp, tab],
  );
  useShortcuts(shortcuts);

  return (
    <div className="app">
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

      {tab === 'settings' ? <SettingsScreen /> : null}

      {showHelp ? <ShortcutsHelp onClose={() => setShowHelp(false)} /> : null}

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

function ShortcutsHelp({ onClose }: { onClose(): void }) {
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
          <ShortcutRow keys={['1', '2', '3', '4']} label="Switch tabs (Practice, Learn, Rooms, Settings)" />
          <ShortcutRow keys={['T']} label="Tossups" />
          <ShortcutRow keys={['B']} label="Bonuses" />
          <ShortcutRow keys={['E']} label="Ear training" />
          <ShortcutRow keys={['V']} label="Vision trainer" />
          <ShortcutRow keys={['O']} label="OAC match" />
          <ShortcutRow keys={['I']} label="Import a packet" />
          <ShortcutRow keys={['Space']} label="Buzz (while reading)" />
          <ShortcutRow keys={['Enter']} label="Submit answer, or next question" />
          <ShortcutRow keys={['Shift', 'Enter']} label="I don't know (give up, see the answer)" />
          <ShortcutRow keys={['K']} label="Hide or show the current question (for reading aloud)" />
          <ShortcutRow keys={['Y']} label="Copy the current question's ID to the clipboard" />
          <ShortcutRow keys={['Esc']} label="Back to Practice home" />
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
