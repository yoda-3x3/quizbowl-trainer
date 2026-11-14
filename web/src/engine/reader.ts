/**
 * The tossup reading engine. OWNED FILE.
 *
 * Reveals a question word by word, handles the buzz, runs the post-buzz clock,
 * judges the answer and emits an AttemptEvent. The UI renders
 * `words.slice(0, revealed)` and nothing else — it must not implement timing.
 *
 * Three things the legacy Python app got wrong, fixed here:
 *
 *  1. Fixed ms-per-word pacing. A moderator does not read "a" and
 *     "incontrovertibly" in the same time, and does not run straight through a
 *     full stop. Pacing is weighted by word length with a pause after
 *     sentence-ending punctuation, and exposed as words-per-minute rather than
 *     milliseconds.
 *  2. No post-buzz timer at all. Real quizbowl gives you about five seconds.
 *  3. Timer drift. Chaining setTimeout accumulates error, so a long question
 *     drifts measurably off pace. We precompute an absolute schedule and
 *     advance to whatever word the elapsed clock says we are on, which is
 *     drift-free and self-correcting even if the tab is throttled.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AttemptEvent, Judgement, Tossup } from '../types';
import { judge as judgeAnswer, DEFAULT_STRICTNESS } from './judge';
import { parseQuestion } from './power';
import { scoreTossup } from './scoring';
import { buildSchedule, revealedAt } from './pacing';

// Re-exported so existing imports keep working. The implementations live in
// pacing.ts because the Durable Object room server needs them without React.
export { buildSchedule, revealedAt, wordDelay } from './pacing';

export type ReaderPhase = 'idle' | 'reading' | 'buzzed' | 'done' | 'resolved';

export interface ReaderHandle {
  tossup: Tossup | null;
  words: string[];
  revealed: number;
  powerIndex: number | null;
  phase: ReaderPhase;
  /** Whole seconds left on the post-buzz clock; null when it is not running. */
  secondsLeft: number | null;
  /** Set when the last submit returned a prompt and we are awaiting a retry. */
  pendingPrompt: string | null;
  /** The judgement that resolved the question, for result display. */
  result: { judgement: Judgement; points: number; powered: boolean } | null;
  start(): void;
  buzz(): void;
  submit(given: string): void;
  reset(t: Tossup): void;
}

export interface ReaderOptions {
  wpm: number;
  postBuzzSeconds?: number;
  strictness?: number;
  onResolved?(e: AttemptEvent): void;
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

const TICK_MS = 30;

export function useReader(opts: ReaderOptions): ReaderHandle {
  const {
    wpm,
    postBuzzSeconds = 5,
    strictness = DEFAULT_STRICTNESS,
    onResolved,
  } = opts;

  const [tossup, setTossup] = useState<Tossup | null>(null);
  const [phase, setPhase] = useState<ReaderPhase>('idle');
  const [revealed, setRevealed] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [result, setResult] = useState<ReaderHandle['result']>(null);

  // Mutable timing state. Kept in a ref so the tick loop never sees a stale
  // closure and so changing wpm mid-question cannot corrupt the schedule.
  const t = useRef({
    words: [] as string[],
    powerIndex: null as number | null,
    schedule: [] as number[],
    startedAt: 0,
    buzzedAt: 0,
    buzzWordIndex: null as number | null,
    deadline: 0,
    resolved: false,
  });

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const reset = useCallback(
    (next: Tossup) => {
      clearTimer();
      const parsed = parseQuestion(next.questionSanitized);
      t.current = {
        words: parsed.words,
        powerIndex: parsed.powerIndex,
        schedule: buildSchedule(parsed.words, wpm),
        startedAt: 0,
        buzzedAt: 0,
        buzzWordIndex: null,
        deadline: 0,
        resolved: false,
      };
      setTossup(next);
      setPhase('idle');
      setRevealed(0);
      setSecondsLeft(null);
      setPendingPrompt(null);
      setResult(null);
    },
    [clearTimer, wpm],
  );

  const start = useCallback(() => {
    if (t.current.words.length === 0) return;
    t.current.startedAt = performance.now();
    setPhase('reading');
    setRevealed(0);
    clearTimer();
    timer.current = setInterval(() => {
      const s = t.current;
      const elapsed = performance.now() - s.startedAt;
      const n = revealedAt(s.schedule, elapsed);
      setRevealed(n);
      if (n >= s.words.length) {
        clearTimer();
        setPhase('done');
      }
    }, TICK_MS);
  }, [clearTimer]);

  const buzz = useCallback(() => {
    const s = t.current;
    if (s.resolved) return;
    // Buzzing is only meaningful while the question is being read.
    if (timer.current === null && s.startedAt === 0) return;

    const elapsed = performance.now() - s.startedAt;
    const n = Math.min(revealedAt(s.schedule, elapsed), s.words.length);
    clearTimer();

    s.buzzedAt = performance.now();
    s.buzzWordIndex = Math.max(0, n - 1);
    s.deadline = s.buzzedAt + postBuzzSeconds * 1000;

    setRevealed(n);
    setPhase('buzzed');
    setSecondsLeft(postBuzzSeconds);

    timer.current = setInterval(() => {
      const left = t.current.deadline - performance.now();
      if (left <= 0) {
        clearTimer();
        setSecondsLeft(0);
        // Out of time counts as an incorrect buzz.
        resolveRef.current('', true);
      } else {
        setSecondsLeft(Math.ceil(left / 1000));
      }
    }, 100);
  }, [clearTimer, postBuzzSeconds]);

  // resolve needs to be callable from inside the countdown interval, so it
  // lives behind a ref to stay current without re-creating the interval.
  const resolveRef = useRef<(given: string, timedOut?: boolean) => void>(
    () => {},
  );

  const resolve = useCallback(
    (given: string, timedOut = false) => {
      const s = t.current;
      if (s.resolved || tossup === null) return;

      const judgement: Judgement = timedOut
        ? { directive: 'reject' }
        : judgeAnswer(tossup.answer || tossup.answerSanitized, given, strictness);

      // A prompt is not a resolution: give them the rest of the clock.
      if (judgement.directive === 'prompt' && !timedOut) {
        setPendingPrompt(judgement.directedPrompt ?? 'Be more specific');
        return;
      }

      s.resolved = true;
      clearTimer();
      setSecondsLeft(null);
      setPendingPrompt(null);

      const correct = judgement.directive === 'accept';
      const outcome = scoreTossup({
        buzzWordIndex: s.buzzWordIndex,
        powerIndex: s.powerIndex,
        correct,
      });

      setResult({ judgement, points: outcome.points, powered: outcome.powered });
      setRevealed(s.words.length);
      setPhase('resolved');

      const event: AttemptEvent = {
        id: `${tossup.id}-${Date.now()}`,
        at: Date.now(),
        mode: 'tossup',
        questionId: tossup.id,
        category: tossup.category,
        subcategory: tossup.subcategory,
        difficulty: tossup.difficulty,
        buzzWordIndex: s.buzzWordIndex,
        totalWords: s.words.length,
        powerWordIndex: s.powerIndex,
        givenAnswer: given,
        directive: judgement.directive,
        points: outcome.points,
        msToAnswer: s.buzzedAt > 0 ? Math.round(performance.now() - s.buzzedAt) : null,
        questionSnapshot: {
          questionSanitized: tossup.questionSanitized,
          answerSanitized: tossup.answerSanitized,
          setName: tossup.setName,
        },
      };
      onResolvedRef.current?.(event);
    },
    [clearTimer, strictness, tossup],
  );

  resolveRef.current = resolve;

  const submit = useCallback(
    (given: string) => {
      resolveRef.current(given, false);
    },
    [],
  );

  return useMemo(
    () => ({
      tossup,
      words: t.current.words,
      revealed,
      powerIndex: t.current.powerIndex,
      phase,
      secondsLeft,
      pendingPrompt,
      result,
      start,
      buzz,
      submit,
      reset,
    }),
    [tossup, revealed, phase, secondsLeft, pendingPrompt, result, start, buzz, submit, reset],
  );
}
