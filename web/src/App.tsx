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

import { useState, type ReactNode } from 'react';
import Home, { type PracticeMode } from './screens/Home';
import Tossup from './screens/Tossup';
import Bonus from './screens/Bonus';
import EarTraining from './screens/EarTraining';
import PacketImport from './screens/Import';
import SettingsScreen from './screens/Settings';
import Rooms from './screens/Rooms';
import Learn from './screens/Learn';
import OacMatch from './screens/OacMatch';
import { Button, TabBar, type TabItem } from './ui';
import GetTheApp from './GetTheApp';
import { isNativeOrInstalled } from './platform';

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

  // Lite mode: a plain browser tab gets solo practice only. Read once per
  // mount, since installing or leaving standalone reloads the document anyway.
  const full = isNativeOrInstalled();

  return (
    <div className="app">
      {tab === 'practice' ? (
        <Practice
          view={practice}
          full={full}
          onStart={setPractice}
          onExit={toHome}
          onOpenSettings={() => setTab('settings')}
        />
      ) : null}

      {tab === 'learn' ? <Learn /> : null}

      {tab === 'rooms' ? (
        <Screen title="Rooms">
          {full ? (
            <Rooms />
          ) : (
            <GetTheApp
              feature="Multiplayer rooms are in the installed app."
              reason="A room holds a live connection open for the whole match, which a browser tab drops the moment it goes to the background."
            />
          )}
        </Screen>
      ) : null}

      {tab === 'settings' ? <SettingsScreen /> : null}

      <TabBar<TabId> items={TABS} active={tab} onSelect={setTab} />
    </div>
  );
}

function Practice({
  view,
  full,
  onStart,
  onExit,
  onOpenSettings,
}: {
  view: PracticeView;
  /** False in a plain browser tab: packet import is app-only. */
  full: boolean;
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
        <Screen title="OAC match" onExit={onExit}>
          <OacMatch />
        </Screen>
      );
    case 'import':
      return (
        <Screen title="Import a packet" onExit={onExit}>
          {full ? (
            <PacketImport />
          ) : (
            <GetTheApp
              feature="Packet import is in the installed app."
              reason="Importing a set reads a file from your device and keeps the parsed questions on it."
            />
          )}
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
