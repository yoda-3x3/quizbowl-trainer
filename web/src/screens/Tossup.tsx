/**
 * Solo tossup practice.
 *
 * The engine owns every clock in here. This screen renders
 * `reader.words.slice(0, reader.revealed)` and nothing else, and all it does
 * with time is read `reader.secondsLeft`. Any reveal logic added here would
 * drift against the room server, which shares `pacing.ts`.
 */

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
import LiveArtPanel from '../art/LiveArtPanel';
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

export interface TossupProps {
  /** Back to the practice home. */
  onExit(): void;
}

export default function Tossup({ onExit }: TossupProps) {
  const [settings] = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<TossupQueue | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);

  const [current, setCurrent] = useState<TossupQuestion | null>(null);
  const [given, setGiven] = useState('');
  const [events, setEvents] = useState<AttemptEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [dry, setDry] = useState(false);

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

  const handleResolved = useCallback((e: AttemptEvent) => {
    void append(e).then(() => all().then(setEvents));
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

    let next = await queueRef.current!.next();
    let cached = false;

    // Last resort: the network is down and the bundled pack is exhausted, so
    // replay something we fetched earlier rather than dead-ending.
    if (!next) {
      next = pickUnseen(await cachedTossups(), seenRef.current);
      cached = next !== null;
    }

    setLoading(false);
    setFromCache(cached);

    if (!next) {
      setDry(true);
      busyRef.current = false;
      return;
    }

    seenRef.current.add(next.id);
    if (next.source === 'qbreader') void cacheTossups([next]);

    setCurrent(next);
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

  // Space buzzes, but never while a text field has focus: in the buzzed state
  // the field is focused and a space there must type a space.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;

      if (ev.code === 'Space' && !typing && reader.phase === 'reading') {
        ev.preventDefault();
        buzz();
        return;
      }
      if (ev.key === 'Enter' && !typing && reader.phase === 'resolved') {
        ev.preventDefault();
        void loadNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [buzz, loadNext, reader.phase]);

  const onSubmit = useCallback(
    (ev: FormEvent) => {
      ev.preventDefault();
      if (!canAnswer) return;
      if (given.trim().length === 0) return;
      submit(given);
    },
    [canAnswer, given, submit],
  );

  const stats = useMemo(() => summary(events), [events]);

  const shown = reader.words.slice(0, reader.revealed);
  const rest = reader.words.slice(reader.revealed);
  const inPower =
    reader.powerIndex !== null && reader.revealed <= reader.powerIndex + 1;

  const result = reader.result;
  const accepted = result?.judgement.directive === 'accept';

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">Tossups</h1>
        <div className="topbar__right">
          <Button variant="ghost" small onClick={onExit}>
            Done
          </Button>
        </div>
      </header>

      <div className="app__body">
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
          <span>
            {current
              ? `${current.setName}${current.setYear ? ` / ${current.setYear}` : ''} / diff ${current.difficulty}`
              : ''}
            {queueRef.current?.isOffline ? ' / offline pack' : ''}
            {fromCache ? ' / cached' : ''}
          </span>
        </div>

        <p className="read read--card">
          {shown.map((word, i) => (
            <span
              key={i}
              className={
                reader.powerIndex !== null && i === reader.powerIndex
                  ? 'read__power'
                  : undefined
              }
            >
              {word}{' '}
            </span>
          ))}
          {reader.phase === 'resolved' ? (
            rest.length > 0 ? (
              <span className="read__rest">{rest.join(' ')}</span>
            ) : null
          ) : (
            <span className="read__caret" aria-hidden="true" />
          )}
        </p>

        {/* Vision trainer. Renders only when the question is about a work in
            the curated set, which is a small minority of questions. */}
        <LiveArtPanel
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
              </form>
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
