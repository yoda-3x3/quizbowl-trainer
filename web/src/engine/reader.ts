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
import { buildSchedule, revealedAt, revealedCharsAt } from './pacing';

// Re-exported so existing imports keep working. The implementations live in
// pacing.ts because the Durable Object room server needs them without React.
export { buildSchedule, revealedAt, revealedCharsAt, wordDelay } from './pacing';

export type ReaderPhase = 'idle' | 'reading' | 'buzzed' | 'done' | 'resolved';

export interface ReaderHandle {
  tossup: Tossup | null;
  words: string[];
  /**
   * Word-grained reveal count. Used for scoring, power detection, and the
   * attempt log, all of which key off a word index. The UI should prefer
   * `revealedChars` for rendering text; `revealed` is here for logic.
   */
  revealed: number;
  /**
   * Character-grained reveal count, into `words.join(' ')`. Interpolates
   * within each word's scheduled time slice so the question types out
   * letter-by-letter instead of popping whole words in.
   */
  revealedChars: number;
  powerIndex: number | null;
  phase: ReaderPhase;
  /** Whole seconds left on the post-buzz clock; null when it is not running. */
  secondsLeft: number | null;
  /** Set when the last submit returned a prompt and we are awaiting a retry. */
  pendingPrompt: string | null;
  /** The judgement that resolved the question, for result display. */
  result: { judgement: Judgement; points: number; powered: boolean } | null;
  start(): void;
  /**
   * Re-anchors the reading clock so word `wordIndex` is due now. Voice mode
   * calls this from speech boundary events so the clock (and therefore the
   * buzz point that scoring uses) follows the audio rather than the timer.
   */
  sync(wordIndex: number): void;
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
  const [revealedChars, setRevealedChars] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [result, setResult] = useState<ReaderHandle['result']>(null);

  // Mutable timing state. Kept in a ref so the tick loop never sees a stale
  // closure and so changing wpm mid-question cannot corrupt the schedule.
  const t = useRef({
    words: [] as string[],
    powerIndex: null as number | null,
    schedule: [] as number[],
    fullLen: 0,
    startedAt: 0,
    buzzedAt: 0,
    buzzWordIndex: null as number | null,
    deadline: 0,
    resolved: false,
    // High-water marks: a sync() that pulls the clock back must not un-type
    // text the player has already seen.
    shownWords: 0,
    shownChars: 0,
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
        fullLen: parsed.words.join(' ').length,
        startedAt: 0,
        buzzedAt: 0,
        buzzWordIndex: null,
        deadline: 0,
        resolved: false,
        shownWords: 0,
        shownChars: 0,
      };
      setTossup(next);
      setPhase('idle');
      setRevealed(0);
      setRevealedChars(0);
      setSecondsLeft(null);
      setPendingPrompt(null);
      setResult(null);
    },
    [clearTimer, wpm],
  );

  const start = useCallback(() => {
    if (t.current.words.length === 0) return;
    t.current.startedAt = performance.now();
    t.current.shownWords = 0;
    t.current.shownChars = 0;
    setPhase('reading');
    setRevealed(0);
    setRevealedChars(0);
    clearTimer();
    timer.current = setInterval(() => {
      const s = t.current;
      const elapsed = performance.now() - s.startedAt;
      const n = Math.max(s.shownWords, revealedAt(s.schedule, elapsed));
      const chars = Math.max(s.shownChars, revealedCharsAt(s.words, s.schedule, elapsed));
      s.shownWords = n;
      s.shownChars = chars;
      setRevealed(n);
      setRevealedChars(chars);
      // The question stays "reading" until every letter of the final word has
      // been typed out, not just until the schedule entry for that word fires.
      // Otherwise the last word would pop in as a single block.
      if (n >= s.words.length && chars >= s.fullLen) {
        clearTimer();
        setPhase('done');
      }
    }, TICK_MS);
  }, [clearTimer]);

  const sync = useCallback((wordIndex: number) => {
    const s = t.current;
    // Only while the reading clock is running: never after a buzz or once
    // the question has been fully read.
    if (s.resolved || s.buzzedAt > 0 || timer.current === null || s.startedAt === 0) return;
    const i = Math.min(Math.max(0, wordIndex), s.schedule.length - 1);
    const due = s.schedule[i];
    if (due === undefined) return;
    s.startedAt = performance.now() - due;
  }, []);

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

    // Freeze the visible text exactly where it was when the buzz landed, so
    // the player sees precisely what they heard. The char cursor sits at the
    // start of the word that was just being typed — that is how far along
    // the moderator actually got.
    let charsAtBuzz = 0;
    for (let k = 0; k < s.buzzWordIndex; k++) charsAtBuzz += (s.words[k] ?? '').length + 1;
    charsAtBuzz += (s.words[s.buzzWordIndex] ?? '').length;

    setRevealed(n);
    setRevealedChars(charsAtBuzz);
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
      setRevealedChars(s.fullLen);
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
      revealedChars,
      powerIndex: t.current.powerIndex,
      phase,
      secondsLeft,
      pendingPrompt,
      result,
      start,
      sync,
      buzz,
      submit,
      reset,
    }),
    [tossup, revealed, revealedChars, phase, secondsLeft, pendingPrompt, result, start, sync, buzz, submit, reset],
  );
}
