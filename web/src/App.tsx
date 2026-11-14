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
 * Learn is a placeholder here; another card fills it. Rooms renders the real
 * multiplayer screen, which already works against the Durable Object.
 */

import { useState, type ReactNode } from 'react';
import Home, { type PracticeMode } from './screens/Home';
import Tossup from './screens/Tossup';
import Bonus from './screens/Bonus';
import EarTraining from './screens/EarTraining';
import PacketImport from './screens/Import';
import SettingsScreen from './screens/Settings';
import Rooms from './screens/Rooms';
import { Button, Sheet, TabBar, type TabItem } from './ui';

// TODO(card swap): `src/screens/OacMatch.tsx` is still being written by another
// agent. When it lands, add
//   import OacMatch from './screens/OacMatch';
// and replace the <Pending ... file="src/screens/OacMatch.tsx" /> below with
// <OacMatch />. Nothing else in this file needs to change.

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

  const toHome = () => setPractice('home');

  return (
    <div className="app">
      {tab === 'practice' ? (
        <Practice view={practice} onStart={setPractice} onExit={toHome} onOpenSettings={() => setTab('settings')} />
      ) : null}

      {tab === 'learn' ? (
        <Screen title="Learn">
          <Sheet title="Coming next">
            <p className="tiny muted">
              Weak spots, missed questions and buzz-point distribution are
              derived from the attempt log your practice is already writing.
              Nothing here needs to be recorded in advance.
            </p>
          </Sheet>
        </Screen>
      ) : null}

      {tab === 'rooms' ? (
        <Screen title="Rooms">
          <Rooms />
        </Screen>
      ) : null}

      {tab === 'settings' ? <SettingsScreen /> : null}

      <TabBar<TabId> items={TABS} active={tab} onSelect={setTab} />
    </div>
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
          <EarTraining />
        </Screen>
      );
    case 'oac':
      return (
        <Pending
          title="OAC match"
          file="src/screens/OacMatch.tsx"
          onExit={onExit}
        />
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

/** Placeholder for a screen another card is still building. */
function Pending({
  title,
  file,
  onExit,
}: {
  title: string;
  file: string;
  onExit(): void;
}) {
  return (
    <Screen title={title} onExit={onExit}>
      <Sheet title="Not wired up yet">
        <p className="tiny muted">
          This mode is being built in <code>{file}</code>. The entry point is
          here and ready for it, so nothing in the shell has to change when it
          lands.
        </p>
        <Button small onClick={onExit}>
          Back to practice
        </Button>
      </Sheet>
    </Screen>
  );
}
