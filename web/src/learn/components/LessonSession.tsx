/**
 * A Duolingo-style lesson built on top of the existing Tossup screen.
 *
 * It composes Tossup via its `source: TossupSource` prop — the same hook
 * tournament mode uses — so this module never duplicates the reader loop,
 * the judge, or the scoring. It layers on three things of its own:
 *
 *   1. A 5-question queue. `source.next()` pulls one Tossup at a time either
 *      from a pre-supplied list (a review drill) or from a filtered
 *      TossupQueue (a unit lesson scoped to a category and optional
 *      subcategory). When the queue runs dry, `source.onEnd()` flips the
 *      session into the completion view.
 *
 *   2. Per-answer feedback. Every resolution calls `source.onResolved` with
 *      the AttemptEvent; we tag that event with this session's `lessonId`
 *      and `lessonSeq` and show a short banner. The banner fades on its own
 *      after a beat — the Tossup screen still owns the "Next question"
 *      button and the keyboard shortcut for it.
 *
 *   3. A completion screen with XP, correct count and a note about the
 *      day's streak. The primary action goes back to the Learn tab via the
 *      `onExit` callback.
 *
 * Tossup's own internals are untouched. The only knobs we turn are its
 * props; the component below is a thin wrapper, not a fork.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Tossup, { type TossupSource } from '../../screens/Tossup';
import { TossupQueue } from '../../data/qbreader';
import { pickUnseen, cachedTossups } from '../../data/cache';
import { Button, Sheet, filtersFrom, useSettings } from '../../ui';
import { updateEvent } from '../../engine/log';
import { xpForEvent } from '../streak';
import { LESSON_LENGTH, PASS_THRESHOLD, type LessonDef } from '../units';
import type { AttemptEvent, QuestionFilters, Tossup as TossupQuestion } from '../../types';

/** Feedback banner's dwell time before it fades away. */
const FEEDBACK_MS = 1500;

export interface LessonSessionProps {
  /**
   * The lesson being taken. Determines the `lessonId` stamped on events and
   * how the completion screen summarises the run.
   */
  lesson: LessonDef;
  /**
   * When set, the session only serves these tossups (in order), ignoring
   * category filters. Used by the review queue's "Try again" to re-drill a
   * specific missed question without pulling random fill from the API.
   */
  pinned?: TossupQuestion[];
  /** Back to the Learn tab. */
  onExit(): void;
  /**
   * Called after each resolution so the parent can refresh its event-derived
   * state (streak, review queue). The lesson session also consumes the
   * event itself, so this is purely advisory — the parent can ignore it.
   */
  onProgress?(): void;
}

interface Feedback {
  key: number;
  kind: 'good' | 'bad';
  text: string;
}

interface LessonResult {
  correct: number;
  xp: number;
  powered: number;
  total: number;
  pinned: boolean;
}

export default function LessonSession({
  lesson,
  pinned,
  onExit,
  onProgress,
}: LessonSessionProps) {
  const [settings] = useSettings();

  // The lesson id persisted on events. A fresh suffix per mount means a
  // retry of the same lesson writes a NEW attempt rather than overwriting
  // the previous one — which is what `lessonTotals` groups by.
  const attemptId = useMemo(
    () => `${lesson.id}:${Date.now().toString(36)}`,
    [lesson.id],
  );

  const [seq, setSeq] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [result, setResult] = useState<LessonResult | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  // Running totals, kept in a ref so the source's `next()` closure can read
  // the latest values without re-subscribing. Also mirrored in state for
  // the completion screen.
  const totalsRef = useRef<LessonResult>({
    correct: 0,
    xp: 0,
    powered: 0,
    total: 0,
    pinned: Boolean(pinned),
  });

  // Question supply:
  //  - pinned mode: drain the provided array in order.
  //  - unit mode: filtered TossupQueue, category (+ optional subcategory).
  const queueRef = useRef<TossupQueue | null>(null);
  const pinnedRef = useRef<TossupQuestion[] | null>(pinned ? [...pinned] : null);
  const seenRef = useRef<Set<string>>(new Set());

  if (!pinnedRef.current && queueRef.current === null) {
    const base = filtersFrom(settings);
    const filters: QuestionFilters = {
      ...base,
      categories: [lesson.unit],
      subcategories: lesson.subcategory ? [lesson.subcategory] : [],
    };
    queueRef.current = new TossupQueue(filters);
  }

  // One source for Tossup, stable across renders. Everything it reads lives
  // in refs so Tossup never needs to be remounted mid-lesson.
  const servedRef = useRef(0);
  const seqRef = useRef(0);
  seqRef.current = seq;

  const source: TossupSource = useMemo(
    () => ({
      async next(): Promise<TossupQuestion | null> {
        if (servedRef.current >= LESSON_LENGTH) {
          // Lesson budget exhausted: tell Tossup to flip to its end state,
          // which calls onEnd and lands us on the completion screen.
          return null;
        }
        let q: TossupQuestion | null = null;
        if (pinnedRef.current) {
          q = pinnedRef.current.shift() ?? null;
        } else {
          q = await queueRef.current!.next();
          if (!q) {
            // Last-resort fallback for the offline case: a cached tossup the
            // player has not seen in this lesson.
            const cached = await cachedTossups();
            q = pickUnseen(cached, seenRef.current);
          }
        }
        if (q) {
          seenRef.current.add(q.id);
          servedRef.current += 1;
        }
        return q;
      },
      onResolved(event: AttemptEvent) {
        handleResolved(event);
      },
      onEnd() {
        finish();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleResolved = useCallback(
    (event: AttemptEvent) => {
      // Tag the event so derivations can distinguish lesson play from solo
      // practice. The log row was already put by Tossup; this re-puts it
      // with the lesson fields merged in. A failure here is silent — the
      // tag is cosmetic, never load-bearing for scoring.
      const currentSeq = seqRef.current;
      void updateEvent(event.id, {
        lessonId: attemptId,
        lessonSeq: currentSeq,
      });

      const gained = xpForEvent(event);
      const correct = event.directive === 'accept';
      const powered =
        correct &&
        event.buzzWordIndex !== null &&
        event.powerWordIndex !== null &&
        event.buzzWordIndex <= event.powerWordIndex;

      totalsRef.current = {
        correct: totalsRef.current.correct + (correct ? 1 : 0),
        xp: totalsRef.current.xp + gained,
        powered: totalsRef.current.powered + (powered ? 1 : 0),
        total: totalsRef.current.total + 1,
        pinned: totalsRef.current.pinned,
      };

      // Tossup handles its own result banner below the question; our
      // overlay chip is a brief reinforcement, not a replacement.
      showFeedback(
        correct
          ? { kind: 'good', text: powered ? 'Powered, +2 XP' : 'Correct, +1 XP' }
          : {
              kind: 'bad',
              text: `Not quite. Answer: ${truncate(event.questionSnapshot?.answerSanitized ?? 'see below', 70)}`,
            },
      );

      setSeq((n) => n + 1);
      onProgress?.();

      // If this was the last question in the lesson, Tossup will call
      // source.next() again and we return null, which triggers onEnd and
      // the finish path. We do NOT set result here: there could still be
      // a prompt retry in flight on the current question.
    },
    [attemptId, onProgress],
  );

  const showFeedback = useCallback((f: Omit<Feedback, 'key'>) => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setFeedback({ ...f, key: Date.now() });
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
    }, FEEDBACK_MS);
  }, []);

  const finish = useCallback(() => {
    setResult({ ...totalsRef.current });
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  if (result) {
    // A review retry is a single-question drill; a unit lesson has a real
    // pass threshold. The completion screen adapts accordingly.
    const passed = result.pinned
      ? result.correct > 0
      : result.correct >= PASS_THRESHOLD;
    return (
      <LessonComplete
        lesson={lesson}
        result={result}
        passed={passed}
        onExit={onExit}
      />
    );
  }

  const lessonSize = pinnedRef.current && !queueRef.current
    ? Math.max(1, (pinned?.length ?? 1))
    : LESSON_LENGTH;
  const progressFraction = Math.min(1, seq / lessonSize);
  const progressPercent = Math.round(progressFraction * 100);

  return (
    <div className="lesson-overlay" role="dialog" aria-label={`Lesson: ${lesson.title}`}>
      <div className="lesson-overlay__progress" aria-hidden="true">
        <div className="lesson-overlay__progress-track">
          <div
            className="lesson-overlay__progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="lesson-overlay__progress-text">
          {Math.min(seq, lessonSize)}/{lessonSize}
        </div>
      </div>

      <div className="lesson-overlay__shell">
        <Tossup onExit={onExit} source={source} />
      </div>

      {feedback ? (
        <div
          key={feedback.key}
          className={`lesson-overlay__feedback lesson-overlay__feedback--visible lesson-overlay__feedback--${feedback.kind}`}
          role="status"
          aria-live="polite"
        >
          {feedback.text}
        </div>
      ) : null}
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

interface LessonCompleteProps {
  lesson: LessonDef;
  result: LessonResult;
  passed: boolean;
  onExit(): void;
}

function LessonComplete({ lesson, result, passed, onExit }: LessonCompleteProps) {
  const total = Math.max(result.total, 1);
  const subline = result.pinned
    ? passed
      ? 'Review item cleared. One fewer card in the queue.'
      : 'Review item missed again. It will come back later.'
    : passed
      ? `You cleared ${PASS_THRESHOLD}+ correct. The next lesson is unlocked.`
      : `You need ${PASS_THRESHOLD} correct to pass. Retry to unlock the next lesson.`;
  return (
    <div className="lesson-overlay" role="dialog" aria-label="Lesson complete">
      <div className="lesson-done">
        <h2 className="lesson-done__title">
          {passed ? 'Lesson complete' : 'Nice try'}
        </h2>
        <p className="lesson-done__sub">
          {lesson.unit} — {lesson.title}. {subline}
        </p>

        <div className="lesson-done__stats">
          <div className="lesson-done__stat">
            <div className="lesson-done__stat-value lesson-done__stat-value--good">
              {result.correct}/{total}
            </div>
            <div className="lesson-done__stat-label">correct</div>
          </div>
          <div className="lesson-done__stat">
            <div className="lesson-done__stat-value lesson-done__stat-value--xp">
              +{result.xp}
            </div>
            <div className="lesson-done__stat-label">xp</div>
          </div>
          <div className="lesson-done__stat">
            <div className="lesson-done__stat-value">{result.powered}</div>
            <div className="lesson-done__stat-label">powered</div>
          </div>
        </div>

        {passed ? (
          <div className="lesson-done__streak" role="status">
            Streak maintained for today. One more lesson keeps tomorrow's
            flame lit.
          </div>
        ) : (
          <Sheet title="Keep going">
            <p className="tiny muted">
              Missed items from this lesson land in the review queue below the
              units when you get back. A short sleep helps recall, then try
              the lesson again.
            </p>
          </Sheet>
        )}

        <Button variant="primary" block onClick={onExit}>
          Continue
        </Button>
      </div>
    </div>
  );
}
