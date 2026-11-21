/**
 * The Learn tab: a Duolingo-style study surface over the event log.
 *
 * Three sections, stacked:
 *   1. A streak header with the flame, today's lesson goal and total XP.
 *   2. Units — one per Category — each with a vertical path of 5 lessons.
 *   3. A short review queue of missed items, each with its own retry.
 *
 * A lesson taps into the existing Tossup screen via `TossupSource`, the same
 * hook tournament mode uses, so no part of the reader/judge/scoring loop is
 * reimplemented here. Progress — streak, XP, lessons-today — is derived from
 * the AttemptEvent log; there is no second source of truth.
 *
 * The earlier scroll-driven chapter surface is retired. Its component files
 * are kept on disk for other work in flight but are no longer imported here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { all, isEphemeral } from '../engine/log';
import { summary } from '../learn/derive';
import { streakSummary } from '../learn/streak';
import { unitProgress, type LessonDef } from '../learn/units';
import { reviewQueue, type ReviewItem } from '../learn/reviewQueue';
import StreakHeader from '../learn/components/StreakHeader';
import UnitPath from '../learn/components/UnitPath';
import ReviewCard from '../learn/components/ReviewCard';
import LessonSession from '../learn/components/LessonSession';
import { PillRow, StatPill, pct } from '../ui';
import type { AttemptEvent, Tossup as TossupQuestion } from '../types';
import '../learn/learn.css';

type Mode =
  | { kind: 'browsing' }
  | { kind: 'lesson'; lesson: LessonDef; pinned?: TossupQuestion[] };

/**
 * Rebuilds a bare Tossup from the snapshot stored on a review event. The
 * snapshot keeps only the fields the reader needs; set metadata we never
 * actually read gets safe placeholders.
 */
function tossupFromReview(item: ReviewItem): TossupQuestion {
  return {
    id: item.questionId,
    question: item.questionSanitized,
    questionSanitized: item.questionSanitized,
    answer: item.answerSanitized,
    answerSanitized: item.answerSanitized,
    category: item.category,
    subcategory: item.subcategory,
    difficulty: item.difficulty,
    setName: item.setName,
    setYear: 0,
    packetNumber: 0,
    questionNumber: 0,
    source: 'bundled',
  };
}

export default function Learn() {
  const [events, setEvents] = useState<AttemptEvent[] | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'browsing' });

  const reload = useCallback(() => {
    void all()
      .then((rows) => setEvents(rows))
      .catch(() => setEvents([]));
  }, []);

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

  // Re-read the log whenever we come back from a lesson so the streak, the
  // unit progress and the review queue reflect what was just played.
  useEffect(() => {
    if (mode.kind === 'browsing') reload();
  }, [mode.kind, reload]);

  const loaded = events ?? [];
  const totals = summary(loaded);
  const streak = useMemo(() => streakSummary(loaded), [loaded]);
  const units = useMemo(() => unitProgress(loaded), [loaded]);
  const review = useMemo(() => reviewQueue(loaded, { limit: 10 }), [loaded]);

  const launchLesson = useCallback((lesson: LessonDef) => {
    setMode({ kind: 'lesson', lesson });
  }, []);

  const retryReview = useCallback((item: ReviewItem) => {
    const pinned = [tossupFromReview(item)];
    // Synthesise a one-off lesson def for the retry so the session has
    // something to label itself with. The id is namespaced so it does not
    // collide with a real unit lesson in `unitProgress`.
    const lesson: LessonDef = {
      id: `review-${item.questionId}`,
      index: 1,
      unit: item.category,
      subcategory: item.subcategory,
      title: `Review: ${item.subcategory}`,
    };
    setMode({ kind: 'lesson', lesson, pinned });
  }, []);

  const exitLesson = useCallback(() => {
    setMode({ kind: 'browsing' });
  }, []);

  if (mode.kind === 'lesson') {
    return (
      <LessonSession
        lesson={mode.lesson}
        pinned={mode.pinned}
        onExit={exitLesson}
        onProgress={reload}
      />
    );
  }

  return (
    <>
      <header className="topbar topbar--learn">
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
              <StatPill label="points" value={String(totals.points)} />
              <StatPill label="weeks" value={String(totals.weeksTracked)} />
            </PillRow>

            {isEphemeral() ? (
              <p className="tiny muted">
                Storage is unavailable, so this session's events live in memory
                only and will not survive a reload.
              </p>
            ) : null}

            <div className="learn-duo">
              <section className="learn-duo__section" aria-labelledby="learn-streak-heading">
                <h2 className="sr-only" id="learn-streak-heading">
                  Streak and progress
                </h2>
                <StreakHeader summary={streak} />
              </section>

              <section className="learn-duo__section" aria-labelledby="learn-units-heading">
                <h2 className="learn-duo__heading" id="learn-units-heading">
                  Units
                </h2>
                <div className="units">
                  {units.map((unit) => (
                    <UnitPath
                      key={unit.unit.category}
                      progress={unit}
                      onSelectLesson={launchLesson}
                    />
                  ))}
                </div>
              </section>

              <section className="learn-duo__section" aria-labelledby="learn-review-heading">
                <h2 className="learn-duo__heading" id="learn-review-heading">
                  Review queue
                </h2>
                {review.length === 0 ? (
                  <p className="review-empty">
                    Nothing to review yet. Missed tossups show up here a day
                    after you see them, ordered by how often they have tripped
                    you up.
                  </p>
                ) : (
                  <div className="review-list">
                    {review.map((item) => (
                      <ReviewCard
                        key={item.questionId}
                        item={item}
                        onRetry={retryReview}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}
