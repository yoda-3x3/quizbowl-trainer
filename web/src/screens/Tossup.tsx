/**
 * Solo tossup practice.
 *
 * The engine owns every clock in here. This screen renders
 * `reader.words.slice(0, reader.revealed)` and nothing else, and all it does
 * with time is read `reader.secondsLeft`. Any reveal logic added here would
 * drift against the room server, which shares `pacing.ts`.
 */

import RankLoader from '../RankLoader';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useReader, type ReaderPhase } from '../engine/reader';
import { all, append, isEphemeral } from '../engine/log';
import { summary } from '../learn/derive';
import { TossupQueue } from '../data/qbreader';
import { cacheTossups, cachedTossups, pickUnseen } from '../data/cache';
import { isStarred, star, unstar } from '../data/starred';
import LiveArtPanel from '../art/LiveArtPanel';
import LiveEarPanel from '../ear/LiveEarPanel';
import PracticeSidebar from './PracticeSidebar';
import {
  Button,
  PillRow,
  Sheet,
  StatPill,
  TextInput,
  filtersFrom,
  pct,
  useSettings,
} from '../ui';
import type { AttemptEvent, Tossup as TossupQuestion } from '../types';
import {
  rateForWpm,
  speak,
  spokenAnswer,
  stopSpeaking,
  wordIndexAtChar,
} from '../voice/speech';
import {
  VoiceAnswerStatus,
  VoiceHiddenText,
  useReadAloud,
  useVoiceAnswer,
  useVoiceSettings,
} from '../voice/useVoice';

export interface TossupProtestPayload {
  questionId: string;
  givenAnswer: string;
  reason: string;
}

/**
 * Overrides where Tossup gets its questions from. When set, `loadNext()`
 * calls `next()` in place of `TossupQueue`, and `onResolved` fires with the
 * resolved event so the parent can persist a tournament attempt. `onEnd`
 * fires when `next()` returns null and lets the parent transition instead
 * of this screen's "out of questions" state.
 *
 * The presence of this prop is what switches Tossup to tournament mode.
 * Solo practice leaves it undefined and gets exactly the behavior it had
 * before this prop existed.
 */
export interface TossupSource {
  next(): Promise<TossupQuestion | null>;
  onResolved?(event: AttemptEvent): void;
  onEnd?(): void;
}

export interface TossupProps {
  /** Back to the practice home. */
  onExit(): void;
  /**
   * When set, a "Protest" button appears under the answer card after a tossup
   * resolves. It is called with the question id, the player's last answer, and
   * their written reason. Omit the prop in solo practice; its absence is what
   * keeps the button out of non-tournament contexts.
   */
  onProtest?(payload: TossupProtestPayload): void | Promise<void>;
  /**
   * Tournament mode: override the question stream. See `TossupSource`.
   */
  source?: TossupSource;
  /** Topbar title. Defaults to "Tossups". */
  title?: string;
}

export default function Tossup({ onExit, onProtest, source, title = 'Tossups' }: TossupProps) {
  const [settings] = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const readCardRef = useRef<HTMLParagraphElement>(null);
  const queueRef = useRef<TossupQueue | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);

  const [current, setCurrent] = useState<TossupQuestion | null>(null);
  const [given, setGiven] = useState('');
  const [events, setEvents] = useState<AttemptEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [dry, setDry] = useState(false);
  // QB Reader's `k` shortcut: hide the read question so you can replay it on
  // a friend. Reset on every new question so a hidden one is not replaced by
  // a mysterious blank card.
  const [hideQuestion, setHideQuestion] = useState(false);
  const [copied, setCopied] = useState(false);
  // Whether `current` is in the starred list. Reloaded per question (not
  // just reset to false) so replaying something starred earlier still shows
  // as starred.
  const [starred, setStarred] = useState(false);
  // Transient confirmation text after toggling the star, same pattern as `copied`.
  const [starSaved, setStarSaved] = useState(false);
  // Protest sheet is opt-in via the `onProtest` prop: solo practice never sees
  // it because the prop stays undefined.
  const [protestOpen, setProtestOpen] = useState(false);
  const [protestReason, setProtestReason] = useState('');
  const [protestError, setProtestError] = useState<string | null>(null);
  const [protestFiling, setProtestFiling] = useState(false);
  const [protestFiled, setProtestFiled] = useState(false);

  const filters = useMemo(() => filtersFrom(settings), [settings]);

  if (queueRef.current === null) {
    queueRef.current = new TossupQueue(filters);
  }

  // Filters live in the queue, so a settings change has to be pushed into it.
  // That drops the prefetched pool, which is what we want: the next question
  // should obey the new filters rather than the ones it was fetched under.
  useEffect(() => {
    queueRef.current?.setFilters(filters);
  }, [filters]);

  const sourceRef = useRef<TossupSource | undefined>(source);
  sourceRef.current = source;

  const handleResolved = useCallback((e: AttemptEvent) => {
    void append(e).then(() => all().then(setEvents));
    // Tournament hook: notify the sequencer so it can persist a server-side
    // attempt row and refresh the scoreboard.
    sourceRef.current?.onResolved?.(e);
  }, []);

  const reader = useReader({
    wpm: settings.wpm,
    postBuzzSeconds: settings.postBuzzSeconds,
    strictness: settings.strictness,
    onResolved: handleResolved,
  });

  const { reset, start, buzz, submit } = reader;

  const loadNext = useCallback(async () => {
    // Two advances can overlap: Enter reaches both the window handler and the
    // focused Next button, and the fetch in between is async. Without this
    // guard the second reset lands after the first start and the question
    // reveals all at once.
    if (busyRef.current) return;
    busyRef.current = true;

    setLoading(true);
    setGiven('');
    setDry(false);

    let next: TossupQuestion | null;
    let cached = false;

    if (sourceRef.current) {
      // Tournament mode: the sequencer owns the question stream. Cache + queue
      // are bypassed so every player sees the same pinned id.
      next = await sourceRef.current.next();
    } else {
      next = await queueRef.current!.next();
      // Last resort: the network is down and the bundled pack is exhausted, so
      // replay something we fetched earlier rather than dead-ending.
      if (!next) {
        next = pickUnseen(await cachedTossups(), seenRef.current);
        cached = next !== null;
      }
    }

    setLoading(false);
    setFromCache(cached);

    if (!next) {
      setDry(true);
      busyRef.current = false;
      // Tournament hook: tell the sequencer we're out so it can advance to
      // the next seq (another tossup burst, a bonus, or the finish screen).
      sourceRef.current?.onEnd?.();
      return;
    }

    seenRef.current.add(next.id);
    if (next.source === 'qbreader') void cacheTossups([next]);

    setCurrent(next);
    setHideQuestion(false);
    setCopied(false);
    setStarred(false);
    setStarSaved(false);
    void isStarred(next.id).then(setStarred);
    setProtestOpen(false);
    setProtestReason('');
    setProtestError(null);
    setProtestFiled(false);
    reset(next);
    start();
    busyRef.current = false;
  }, [reset, start]);

  useEffect(() => {
    void all().then(setEvents);
  }, []);

  useEffect(() => {
    void loadNext();
    // Intentionally once: loadNext is stable and a re-run would skip a question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open the answer field the moment one is available, including on a prompt
  // retry, where the player keeps the remaining clock.
  const canAnswer = reader.phase === 'buzzed' || reader.phase === 'done';
  useEffect(() => {
    if (canAnswer) inputRef.current?.focus();
  }, [canAnswer, reader.pendingPrompt]);

  // A prompt means "try again, more specifically", so the rejected text goes.
  useEffect(() => {
    if (reader.pendingPrompt) setGiven('');
  }, [reader.pendingPrompt]);

  const toggleStar = useCallback(() => {
    if (!current) return;
    if (starred) {
      setStarred(false);
      void unstar(current.id);
    } else {
      setStarred(true);
      void star(current);
    }
    setStarSaved(true);
    window.setTimeout(() => setStarSaved(false), 1500);
  }, [current, starred]);

  // Space buzzes, but never while a text field has focus: in the buzzed state
  // the field is focused and a space there must type a space.
  //
  // `k` and `y` mirror QB Reader (show/hide last question, copy question id).
  // `s` stars the current question for later; `n` skips it — while reading
  // or buzzed that resolves it with an empty answer (same mechanism as "I
  // don't know"), and once resolved it advances to the next question, so `n`
  // reads as a single "move on" key regardless of phase.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      if (typing || ev.ctrlKey || ev.metaKey || ev.altKey) {
        // Still allow Space -> buzz from the body even if an obscure focus
        // target slips through, but every other binding stays off while
        // typing or when a native shortcut is being used.
        if (
          ev.code === 'Space' &&
          !typing &&
          reader.phase === 'reading'
        ) {
          ev.preventDefault();
          buzz();
        }
        return;
      }

      if (ev.code === 'Space' && reader.phase === 'reading') {
        ev.preventDefault();
        buzz();
        return;
      }
      if (ev.key === 'Enter' && reader.phase === 'resolved') {
        ev.preventDefault();
        void loadNext();
        return;
      }
      if ((ev.key === 'k' || ev.key === 'K') && current) {
        ev.preventDefault();
        setHideQuestion((v) => !v);
        return;
      }
      if ((ev.key === 'y' || ev.key === 'Y') && current) {
        ev.preventDefault();
        void navigator.clipboard
          ?.writeText(current.id)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {
            /* clipboard refused; nothing to tell the user */
          });
        return;
      }
      if ((ev.key === 's' || ev.key === 'S') && current) {
        ev.preventDefault();
        toggleStar();
        return;
      }
      if ((ev.key === 'n' || ev.key === 'N') && current) {
        ev.preventDefault();
        if (reader.phase === 'resolved') {
          void loadNext();
        } else if (reader.phase === 'reading' || canAnswer) {
          submit('');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [buzz, canAnswer, current, loadNext, reader.phase, submit, toggleStar]);

  const onSubmit = useCallback(
    (ev: FormEvent) => {
      ev.preventDefault();
      if (!canAnswer) return;
      if (given.trim().length === 0) return;
      submit(given);
    },
    [canAnswer, given, submit],
  );

  const giveUp = useCallback(() => {
    if (!canAnswer) return;
    submit('');
  }, [canAnswer, submit]);

  // --- Voice mode ---------------------------------------------------------
  const voice = useVoiceSettings();
  const { sync } = reader;
  // True while anything is being read aloud, so the mic never opens over it.
  const [talking, setTalking] = useState(false);

  // Read the question from when reading starts until the buzz. 'done' stays
  // in so the audio isn't cut off if the text finishes first.
  const readAloud =
    voice.read &&
    current !== null &&
    (reader.phase === 'reading' || reader.phase === 'done');
  useEffect(() => {
    if (!readAloud) return;
    const words = reader.words;
    setTalking(true);
    const stop = speak(words.join(' '), {
      rate: rateForWpm(settings.wpm),
      onBoundary: (c) => sync(wordIndexAtChar(words, c)),
      onEnd: (completed) => {
        // Speech finished first: bring the text to the end with it. Not if it
        // never played (no voices, blocked) — then the timer keeps pace alone.
        if (completed) sync(words.length - 1);
        setTalking(false);
      },
    });
    return () => {
      stop();
      setTalking(false);
    };
    // Restart only per question, not on every wpm or phase tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readAloud, current?.id]);

  // Read a moderator prompt out, and the result once it resolves.
  const promptRead = useReadAloud(
    voice.read,
    reader.pendingPrompt && current ? `${current.id}#${reader.pendingPrompt}` : null,
    `Prompt. ${reader.pendingPrompt ?? ''}`,
  );

  useEffect(() => {
    const r = reader.result;
    if (!voice.read || reader.phase !== 'resolved' || !r || !current) return;
    const verdict =
      r.judgement.directive === 'accept'
        ? `Correct. ${r.points} points.`
        : r.points < 0
          ? `Incorrect, minus ${-r.points}.`
          : 'Incorrect.';
    speak(`${verdict} The answer was ${spokenAnswer(current.answerSanitized)}.`);
    // Once per resolution.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.read, reader.phase === 'resolved', current?.id]);

  useEffect(() => stopSpeaking, []);

  const voiceAnswer = useVoiceAnswer(
    voice.answer && canAnswer && !talking && promptRead,
    (text) => {
      setGiven(text);
      if (text.trim()) submit(text);
    },
    reader.pendingPrompt,
  );
  // Show what's being heard in the answer box as it comes in.
  useEffect(() => {
    if (voiceAnswer.state === 'listening' && voiceAnswer.heard) setGiven(voiceAnswer.heard);
  }, [voiceAnswer.state, voiceAnswer.heard]);

  const stats = useMemo(() => summary(events), [events]);

  // Letter-by-letter reveal is driven by `revealedChars` into the joined
  // string. `revealed` (word count) is still the source of truth for scoring,
  // power detection and the status line — only the rendered text uses chars.
  const fullText = useMemo(() => reader.words.join(' '), [reader.words]);
  const shownChars = Math.min(reader.revealedChars, fullText.length);
  const shown = fullText.slice(0, shownChars);
  const rest = fullText.slice(shownChars);
  const powerRange = useMemo(() => {
    if (reader.powerIndex === null) return null;
    let start = 0;
    for (let k = 0; k < reader.powerIndex; k++) {
      start += (reader.words[k] ?? '').length + 1;
    }
    const end = start + (reader.words[reader.powerIndex] ?? '').length;
    return { start, end };
  }, [reader.words, reader.powerIndex]);
  const inPower =
    reader.powerIndex !== null && reader.revealed <= reader.powerIndex + 1;

  // `.read--card` has a bounded height now (see theme.css) so a long tossup
  // scrolls instead of growing the card and pushing Buzz down the page; keep
  // the newest revealed word in view as it fills.
  useEffect(() => {
    const el = readCardRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [shownChars]);

  const result = reader.result;
  const accepted = result?.judgement.directive === 'accept';
  // Read-aloud means playing by ear: no text until the tossup is resolved.
  const hideForVoice = voice.read && current !== null && reader.phase !== 'resolved';

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">{title}</h1>
        <div className="topbar__right">
          <Button variant="ghost" small onClick={onExit}>
            Done
          </Button>
        </div>
      </header>

      <div className="practice-shell">
      <div className="app__body practice-main">
        <PillRow>
          <StatPill label="heard" value={String(stats.heard)} />
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

        <div className="meta">
          <span>
            {current
              ? `${current.category} / ${current.subcategory}`
              : loading
                ? 'loading'
                : 'no question'}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {current
              ? `${current.setName}${current.setYear ? ` / ${current.setYear}` : ''} / diff ${current.difficulty}`
              : ''}
            {queueRef.current?.isOffline ? ' / offline pack' : ''}
            {fromCache ? ' / cached' : ''}
            {current ? (
              <button
                type="button"
                className={`star-toggle${starred ? ' star-toggle--on' : ''}`}
                onClick={toggleStar}
                aria-pressed={starred}
                title={starred ? 'Starred — press S to unstar' : 'Star this question for later (S)'}
              >
                {starred ? '★' : '☆'}
              </button>
            ) : null}
          </span>
        </div>
        {starSaved ? (
          <p className="tiny muted" role="status">
            {starred ? 'Starred for later.' : 'Removed from starred.'}
          </p>
        ) : null}

        {loading && !current ? (
          <RankLoader label="Loading questions" />
        ) : hideQuestion ? (
          <p className="read read--card muted" ref={readCardRef}>
            <em>Question hidden. Press K to show it again.</em>
          </p>
        ) : hideForVoice ? (
          <VoiceHiddenText />
        ) : (
          <p className="read read--card" ref={readCardRef}>
            {powerRange ? (
              <>
                <span>{shown.slice(0, Math.min(shownChars, powerRange.start))}</span>
                <span className="read__power">
                  {shown.slice(
                    Math.min(shownChars, powerRange.start),
                    Math.min(shownChars, powerRange.end),
                  )}
                </span>
                <span>{shown.slice(Math.min(shownChars, powerRange.end))}</span>
              </>
            ) : (
              <span>{shown}</span>
            )}
            {reader.phase === 'resolved' ? (
              rest.length > 0 ? (
                <span className="read__rest">{rest}</span>
              ) : null
            ) : (
              <span className="read__caret" aria-hidden="true" />
            )}
          </p>
        )}
        {copied ? (
          <p className="tiny muted" role="status">
            Question ID copied.
          </p>
        ) : null}

        {/* Vision trainer. Renders only when the question is about a work in
            the curated set, which is a small minority of questions. */}
        <LiveArtPanel
          tossup={current}
          words={reader.words}
          revealed={reader.revealed}
          resolved={reader.phase === 'resolved'}
        />

        {/* Ear trainer. Same contract: silent unless the question is about a
            piece we have motifs for. */}
        <LiveEarPanel
          tossup={current}
          words={reader.words}
          revealed={reader.revealed}
          resolved={reader.phase === 'resolved'}
        />

        <div
          className={[
            'status',
            reader.pendingPrompt
              ? 'status--prompt'
              : reader.phase === 'buzzed'
                ? 'status--buzzed'
                : 'muted',
          ].join(' ')}
        >
          <span>{statusText(reader.phase, loading, dry)}</span>
          <span className="nums">
            {reader.phase === 'buzzed' && reader.secondsLeft !== null ? (
              <span className="clock">{reader.secondsLeft}s</span>
            ) : reader.words.length > 0 ? (
              <>
                word {reader.revealed}/{reader.words.length}
                {inPower && reader.phase === 'reading' ? ' / in power' : ''}
              </>
            ) : null}
          </span>
        </div>

        {reader.pendingPrompt ? (
          <div className="banner banner--prompt" role="status">
            <strong>Prompt</strong> {reader.pendingPrompt}
            <br />
            <span className="tiny">Answer again on the same clock.</span>
          </div>
        ) : null}

        {result ? (
          <div
            className={`banner ${accepted ? 'banner--good' : 'banner--bad'}`}
            role="status"
          >
            <strong>
              {accepted
                ? result.powered
                  ? `Correct, power +${result.points}`
                  : `Correct +${result.points}`
                : `Incorrect ${result.points}`}
            </strong>
            <p className="answerline">{current?.answerSanitized}</p>
          </div>
        ) : null}

        {onProtest && result && current ? (
          protestFiled ? (
            <p className="tiny muted" role="status">
              Protest filed. The match continues.
            </p>
          ) : (
            <Button
              variant="ghost"
              small
              onClick={() => {
                setProtestOpen(true);
                setProtestError(null);
              }}
            >
              Protest this ruling
            </Button>
          )
        ) : null}

        {onProtest && protestOpen && current ? (
          <Sheet
            title="File a protest"
            aside={
              <Button
                variant="ghost"
                small
                onClick={() => {
                  setProtestOpen(false);
                  setProtestError(null);
                }}
                disabled={protestFiling}
              >
                Cancel
              </Button>
            }
          >
            <p className="tiny muted">
              Explain why the ruling should be reviewed. The admin sees the
              reason and your answer, and decides.
            </p>
            <TextInput
              value={protestReason}
              onChange={(e) => setProtestReason(e.target.value)}
              placeholder="at least 10 characters"
              maxLength={1000}
              autoFocus
              aria-label="Protest reason"
              disabled={protestFiling}
            />
            {protestError ? (
              <p className="banner banner--warn">{protestError}</p>
            ) : null}
            <Button
              variant="primary"
              block
              disabled={protestReason.trim().length < 10 || protestFiling}
              onClick={async () => {
                setProtestFiling(true);
                setProtestError(null);
                try {
                  await onProtest({
                    questionId: current.id,
                    givenAnswer: given,
                    reason: protestReason.trim(),
                  });
                  setProtestFiled(true);
                  setProtestOpen(false);
                  setProtestReason('');
                } catch (err) {
                  setProtestError(
                    err instanceof Error ? err.message : 'failed to file',
                  );
                } finally {
                  setProtestFiling(false);
                }
              }}
            >
              {protestFiling ? 'Filing…' : 'File protest'}
            </Button>
          </Sheet>
        ) : null}

        <div className="controls">
          {reader.phase === 'resolved' ? (
            <Button
              variant="primary"
              block
              hint="enter"
              onClick={() => void loadNext()}
              disabled={loading}
            >
              Next question
            </Button>
          ) : (
            <>
              <Button
                variant="buzz"
                hint="space"
                onClick={buzz}
                disabled={reader.phase !== 'reading'}
              >
                BUZZ
              </Button>
              <form className="controls__answer answer-form" onSubmit={onSubmit}>
                <TextInput
                  ref={inputRef}
                  value={given}
                  onChange={(e) => setGiven(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.shiftKey) {
                      e.preventDefault();
                      giveUp();
                    }
                  }}
                  placeholder={
                    canAnswer
                      ? reader.pendingPrompt
                        ? 'be more specific, then Enter'
                        : 'your answer, then Enter'
                      : 'buzz first'
                  }
                  disabled={!canAnswer}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Your answer"
                />
                <Button type="submit" disabled={!canAnswer} small={false}>
                  Submit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!canAnswer}
                  onClick={giveUp}
                  title="Give up on this question and see the answer"
                >
                  I don't know
                </Button>
              </form>
              <VoiceAnswerStatus voice={voiceAnswer} />
            </>
          )}
        </div>

        {reader.phase === 'idle' && !loading && current ? (
          <Button variant="primary" block onClick={start}>
            Start reading
          </Button>
        ) : null}

        {dry ? (
          <Sheet title="No questions">
            <p className="tiny muted">
              Nothing came back from QB Reader, the offline pack, or the local
              cache. Check the network or widen the filters in Settings.
            </p>
          </Sheet>
        ) : null}

        {isEphemeral() ? (
          <p className="banner banner--warn">
            Storage is unavailable, so this session's history is in memory only.
          </p>
        ) : null}
      </div>
      <PracticeSidebar />
      </div>
    </>
  );
}

function statusText(
  phase: ReaderPhase,
  loading: boolean,
  dry: boolean,
): string {
  switch (phase) {
    case 'reading':
      return 'reading, space to buzz';
    case 'buzzed':
      return 'buzzed, answer now';
    case 'done':
      return 'end of question, answer anyway';
    case 'resolved':
      return 'enter for the next question';
    default:
      return dry ? 'out of questions' : loading ? 'loading' : 'ready';
  }
}
