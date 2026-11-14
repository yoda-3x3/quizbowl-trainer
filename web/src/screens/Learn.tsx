/**
 * The Learn tab: a scroll-driven study surface over your own attempt log.
 *
 * Four chapters, hard cut, in a deliberate emotional order: exposed, then the
 * sting of a specific miss, then equipped, then the lift of having improved.
 * Each chapter uses a different device family, and no two neighbours share one:
 *
 *   1 weak spots   counting numbers, held still at the end
 *   2 misses       the signature interaction (owned by another card)
 *   3 lessons      lateral pan driven by vertical scroll
 *   4 progress     clip-path wipe between then and now
 *
 * This is a live surface, not a page about the product: no hero, no display
 * type, no section counters, no scroll cue. Copy is labels, status lines and
 * written empty states, because on first run there is genuinely nothing here
 * and a zeroed chart would be a lie told with a straight face.
 *
 * Every number is derived from the event log through `src/learn/derive.ts`.
 */

import { useEffect, useState } from 'react';
import { all, isEphemeral } from '../engine/log';
import { missedQuestions, summary } from '../learn/derive';
import WeakSpots from '../learn/chapters/WeakSpots';
import Lessons from '../learn/chapters/Lessons';
import ProgressChapter from '../learn/chapters/Progress';
import { PillRow, StatPill, pct, useSettings } from '../ui';
import type { AttemptEvent } from '../types';
import '../learn/learn.css';

/* ---------------------------------------------------------------------------
 * CHAPTER 2 PLACEHOLDER
 *
 * `src/learn/chapters/Misses.tsx` is owned by another card and is not on disk
 * yet. It is the signature interaction and is deliberately NOT implemented
 * here. When it lands, delete `MissesPlaceholder` below and restore:
 *
 *   import Misses from '../learn/chapters/Misses';
 *   ...
 *   <Misses events={events} wpm={settings.wpm} />
 *
 * The placeholder keeps the chapter's frame, status line and empty state so
 * the four-chapter rhythm is visible and testable in the meantime.
 * ------------------------------------------------------------------------- */

export default function Learn() {
  const [settings] = useSettings();
  const [events, setEvents] = useState<AttemptEvent[] | null>(null);

  useEffect(() => {
    let alive = true;
    all()
      .then((rows) => {
        if (alive) setEvents(rows);
      })
      .catch(() => {
        if (alive) setEvents([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const loaded = events ?? [];
  const totals = summary(loaded);

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">Learn</h1>
        <div className="topbar__right">
          <StatPill label="heard" value={String(totals.heard)} />
          <StatPill
            label="acc"
            value={pct(totals.accuracy)}
            tone={totals.accuracy >= 0.5 ? 'good' : 'neutral'}
          />
        </div>
      </header>

      <div className="app__body">
        {events === null ? (
          <p className="placeholder">Reading your attempt log.</p>
        ) : (
          <>
            <PillRow>
              <StatPill label="power" value={pct(totals.powerRate)} tone="gold" />
              <StatPill label="neg" value={pct(totals.negRate)} tone="bad" />
              <StatPill
                label="buzz"
                value={
                  totals.meanBuzzFraction === null
                    ? 'n/a'
                    : pct(totals.meanBuzzFraction)
                }
                title="Mean buzz point as a fraction of question length"
              />
              <StatPill label="points" value={String(totals.points)} />
              <StatPill label="weeks" value={String(totals.weeksTracked)} />
            </PillRow>

            {isEphemeral() ? (
              <p className="tiny muted">
                Storage is unavailable, so this session's events live in memory
                only and will not survive a reload.
              </p>
            ) : null}

            <div className="learn">
              <WeakSpots events={events} />
              <MissesPlaceholder events={events} wpm={settings.wpm} />
              <Lessons events={events} />
              <ProgressChapter events={events} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

/**
 * Stand-in for the owned chapter 2. It renders the frame and the real empty
 * state, and says plainly that the interaction itself is not here yet. It does
 * not attempt the replay rail.
 */
function MissesPlaceholder({
  events,
  wpm,
}: {
  events: AttemptEvent[];
  wpm: number;
}) {
  const misses = missedQuestions(events, { wpm, limit: 25 });
  const knowable = misses.filter((m) => m.knowableWordIndex !== null).length;

  return (
    <section className="chapter chapter--inset" aria-labelledby="learn-misses">
      <header className="chapter__head">
        <h2 className="chapter__label" id="learn-misses">
          Misses
        </h2>
        <span className="chapter__status">
          {misses.length === 0
            ? 'nothing missed yet'
            : `${misses.length} recent, ${knowable} answerable earlier`}
        </span>
      </header>

      <div className="chapter__body">
        {misses.length === 0 ? (
          <div className="empty empty--act">
            <p className="empty__line">
              No missed tossups on record. Go drill something.
            </p>
            <p className="empty__hint">
              This chapter replays the questions you got wrong and marks the
              first word that mentioned something you have already answered
              correctly elsewhere. It needs a miss to work with, and it is the
              most useful thing on this tab once it has one.
            </p>
          </div>
        ) : (
          <div className="misses-placeholder">
            <span className="misses-placeholder__tag">
              chapter 2 not wired up yet
            </span>
            <p className="empty__line">
              {misses.length} missed tossup{misses.length === 1 ? '' : 's'} are
              ready for replay, {knowable} of them carrying a clue you have
              answered correctly before.
            </p>
            <p className="empty__hint">
              The buzz-point replay itself is owned by another card. Its
              component is <code>src/learn/chapters/Misses.tsx</code>; this
              placeholder stands in its slot so the chapter rhythm holds.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
