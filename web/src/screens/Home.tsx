/**
 * Practice home: pick a mode, see where you stand, see what you are drilling.
 *
 * The numbers are derived from the attempt log on every visit; nothing here is
 * a stored counter.
 */

import { useEffect, useMemo, useState } from 'react';
import { all } from '../engine/log';
import { summary } from '../learn/derive';
import {
  Button,
  PillRow,
  Sheet,
  StatPill,
  pct,
  useSettings,
} from '../ui';
import { DIFFICULTY_LABELS, type AttemptEvent } from '../types';

/**
 * Every practice destination. The bottom bar stays at four tabs, so the extra
 * modes live here: at 390px a five or six item bar stops being thumb-sized.
 */
export type PracticeMode = 'tossup' | 'bonus' | 'ear' | 'vision' | 'import' | 'oac';

interface ModeCard {
  mode: PracticeMode;
  title: string;
  body: string;
}

const MODES: readonly ModeCard[] = [
  {
    mode: 'tossup',
    title: 'Tossups',
    body: 'Pyramidal questions read word by word. Space buzzes, Enter submits, power counts.',
  },
  {
    mode: 'bonus',
    title: 'Bonuses',
    body: 'Three parts, ten points each, no clock. Good for converting what you already half know.',
  },
  {
    mode: 'ear',
    title: 'Ear training',
    body: 'Name the work from a clip. The weakest category in most high school fine arts.',
  },
  {
    mode: 'vision',
    title: 'Vision trainer',
    body: 'Name the painting as its details appear one at a time. Only what a clue describes is shown.',
  },
  {
    mode: 'oac',
    title: 'OAC match',
    body: 'Ohio Academic Competition format: directed questions, the alphabet round, then tossups.',
  },
  {
    mode: 'import',
    title: 'Import a packet',
    body: 'Play your own set from a file instead of the QB Reader bank.',
  },
];

export interface HomeProps {
  onStart(mode: PracticeMode): void;
  /** Jump to the Settings tab from the filter summary. */
  onOpenSettings(): void;
}

export default function Home({ onStart, onOpenSettings }: HomeProps) {
  const [settings] = useSettings();
  const [events, setEvents] = useState<AttemptEvent[]>([]);

  useEffect(() => {
    void all().then(setEvents);
  }, []);

  const stats = useMemo(() => summary(events), [events]);

  const bandLow = DIFFICULTY_LABELS[settings.minDifficulty] ?? '?';
  const bandHigh = DIFFICULTY_LABELS[settings.maxDifficulty] ?? '?';
  const band =
    settings.minDifficulty === settings.maxDifficulty
      ? bandLow
      : `${bandLow} to ${bandHigh}`;

  const categories =
    settings.categories.length === 0
      ? 'all categories'
      : settings.categories.join(', ');

  const subcategories =
    settings.subcategories.length === 0
      ? null
      : settings.subcategories.join(', ');

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">
          quizbowl <span className="muted">trainer</span>
        </h1>
        <div className="topbar__right">
          <StatPill label="wpm" value={String(settings.wpm)} />
          <StatPill label="clock" value={`${settings.postBuzzSeconds}s`} />
        </div>
      </header>

      <div className="app__body">
        <div className="mode-grid">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              className="mode-card"
              onClick={() => onStart(m.mode)}
            >
              <span className="mode-card__title">{m.title}</span>
              <span className="mode-card__body">{m.body}</span>
            </button>
          ))}
        </div>

        <Sheet
          title="Your numbers"
          aside={
            <span className="tiny muted">
              {stats.heard === 0 ? 'no attempts yet' : `${stats.heard} attempts`}
            </span>
          }
        >
          <PillRow>
            <StatPill
              label="acc"
              value={pct(stats.accuracy)}
              tone={stats.accuracy >= 0.5 ? 'good' : 'neutral'}
            />
            <StatPill label="power" value={pct(stats.powerRate)} tone="gold" />
            <StatPill
              label="neg"
              value={pct(stats.negRate)}
              tone={stats.negRate > 0 ? 'bad' : 'neutral'}
            />
            <StatPill
              label="buzz pt"
              value={
                stats.meanBuzzFraction === null
                  ? '-'
                  : pct(stats.meanBuzzFraction)
              }
              title="Mean buzz point as a fraction of question length"
            />
            <StatPill label="pts" value={String(stats.points)} tone="accent" />
          </PillRow>
          {stats.heard === 0 ? (
            <p className="tiny muted">
              Play a tossup and these fill in. Every statistic in the app is
              derived from the attempt log, so nothing is lost by changing
              settings later.
            </p>
          ) : null}
        </Sheet>

        <Sheet
          title="Drilling"
          aside={
            <Button variant="ghost" small onClick={onOpenSettings}>
              Change
            </Button>
          }
        >
          <p className="tiny">
            <span className="muted">difficulty</span> {band}
          </p>
          <p className="tiny">
            <span className="muted">categories</span> {categories}
          </p>
          {subcategories ? (
            <p className="tiny">
              <span className="muted">subcategories</span> {subcategories}
            </p>
          ) : null}
          <p className="tiny">
            <span className="muted">judge</span> strictness{' '}
            {settings.strictness} of 12
          </p>
        </Sheet>
      </div>
    </>
  );
}
