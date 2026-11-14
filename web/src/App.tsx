/**
 * Core harness. Card A replaces this with the real screens; it exists so the
 * engine can be exercised end to end and so there is something drillable while
 * the delegated UI work happens.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useReader } from './engine/reader';
import { append, all, isEphemeral } from './engine/log';
import { TossupQueue, defaultFilters } from './data/qbreader';
import { summary } from './learn/derive';
import Rooms from './screens/Rooms';
import type { AttemptEvent, Tossup } from './types';

const WPM = 150;
const POST_BUZZ_SECONDS = 5;

export default function App() {
  const [view, setView] = useState<'solo' | 'rooms'>('solo');
  return (
    <div style={S.app}>
      <nav style={S.nav}>
        <button
          onClick={() => setView('solo')}
          style={{ ...S.navBtn, ...(view === 'solo' ? S.navOn : {}) }}
        >
          Solo
        </button>
        <button
          onClick={() => setView('rooms')}
          style={{ ...S.navBtn, ...(view === 'rooms' ? S.navOn : {}) }}
        >
          Rooms
        </button>
      </nav>
      {view === 'solo' ? <Solo /> : <Rooms />}
    </div>
  );
}

function Solo() {
  const queueRef = useRef(new TossupQueue(defaultFilters()));
  const inputRef = useRef<HTMLInputElement>(null);

  const [current, setCurrent] = useState<Tossup | null>(null);
  const [given, setGiven] = useState('');
  const [events, setEvents] = useState<AttemptEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const handleResolved = useCallback((e: AttemptEvent) => {
    void append(e).then(() => all().then(setEvents));
  }, []);

  const reader = useReader({
    wpm: WPM,
    postBuzzSeconds: POST_BUZZ_SECONDS,
    onResolved: handleResolved,
  });

  const { reset, start, buzz, submit } = reader;

  const loadNext = useCallback(async () => {
    setLoading(true);
    setGiven('');
    const t = await queueRef.current.next();
    setLoading(false);
    if (!t) return;
    setCurrent(t);
    reset(t);
    start();
  }, [reset, start]);

  useEffect(() => {
    void all().then(setEvents);
  }, []);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  // Focus the field the moment a buzz opens it, and when a prompt arrives.
  useEffect(() => {
    if (reader.phase === 'buzzed' || reader.phase === 'done') {
      inputRef.current?.focus();
    }
  }, [reader.phase, reader.pendingPrompt]);

  // Space buzzes, but never while the answer field has focus.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (ev.code === 'Space' && !typing && reader.phase === 'reading') {
        ev.preventDefault();
        buzz();
      }
      if (ev.key === 'Enter' && reader.phase === 'resolved') {
        ev.preventDefault();
        void loadNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [buzz, loadNext, reader.phase]);

  const stats = useMemo(() => summary(events), [events]);

  const shown = reader.words.slice(0, reader.revealed);
  const rest = reader.words.slice(reader.revealed);
  const canAnswer = reader.phase === 'buzzed' || reader.phase === 'done';

  const statusText = (() => {
    switch (reader.phase) {
      case 'reading':
        return 'reading — SPACE to buzz';
      case 'buzzed':
        return reader.pendingPrompt
          ? `PROMPT: ${reader.pendingPrompt}`
          : `buzzed — ${reader.secondsLeft ?? 0}s`;
      case 'done':
        return 'end of question — answer anyway';
      case 'resolved':
        return 'ENTER for the next question';
      default:
        return loading ? 'loading…' : 'ready';
    }
  })();

  const statusColor =
    reader.phase === 'buzzed'
      ? reader.pendingPrompt
        ? 'var(--gold)'
        : 'var(--accent)'
      : 'var(--ink-soft)';

  return (
    <div style={S.app}>
      <header style={S.header}>
        <div style={S.brand}>
          quizbowl<span style={{ color: 'var(--ink-soft)' }}>/trainer</span>
          <span style={S.coreTag}>core harness</span>
        </div>
        <div style={S.statRow}>
          <Stat label="heard" value={String(stats.heard)} />
          <Stat label="acc" value={pct(stats.accuracy)} />
          <Stat label="power" value={pct(stats.powerRate)} />
          <Stat label="neg" value={pct(stats.negRate)} />
          <Stat
            label="buzz pt"
            value={
              stats.meanBuzzFraction === null
                ? '—'
                : pct(stats.meanBuzzFraction)
            }
          />
          <Stat label="pts" value={String(stats.points)} />
        </div>
      </header>

      <main style={S.main}>
        <div style={S.meta}>
          <span>
            {current
              ? `${current.category} · ${current.subcategory}`
              : 'no question'}
          </span>
          <span>
            {current
              ? `${current.setName}${current.setYear ? ` · ${current.setYear}` : ''} · diff ${current.difficulty}`
              : ''}
            {queueRef.current.isOffline ? ' · offline pack' : ''}
          </span>
        </div>

        <div style={S.card}>
          <p style={S.question}>
            {shown.map((w, i) => (
              <span
                key={i}
                style={
                  reader.powerIndex !== null && i === reader.powerIndex
                    ? { color: 'var(--gold)' }
                    : undefined
                }
              >
                {w}{' '}
              </span>
            ))}
            {reader.phase === 'resolved' ? null : (
              <span style={S.caret} aria-hidden="true" />
            )}
            {reader.phase === 'resolved' && rest.length > 0 ? (
              <span style={{ color: 'var(--ink-soft)' }}>{rest.join(' ')}</span>
            ) : null}
          </p>
        </div>

        <div style={{ ...S.status, color: statusColor }}>
          {statusText}
          {reader.phase === 'reading' ? (
            <span style={S.progress}>
              word {reader.revealed}/{reader.words.length}
              {reader.powerIndex !== null &&
              reader.revealed <= reader.powerIndex + 1
                ? ' · in power'
                : ''}
            </span>
          ) : null}
        </div>

        {reader.result ? (
          <div
            style={{
              ...S.result,
              borderColor:
                reader.result.points > 0 ? 'var(--good)' : 'var(--bad)',
            }}
          >
            <strong
              style={{
                color: reader.result.points > 0 ? 'var(--good)' : 'var(--bad)',
              }}
            >
              {reader.result.judgement.directive === 'accept'
                ? reader.result.powered
                  ? 'CORRECT — POWER'
                  : 'CORRECT'
                : 'INCORRECT'}{' '}
              {reader.result.points > 0 ? '+' : ''}
              {reader.result.points}
            </strong>
            <div style={S.answerLine}>{current?.answerSanitized}</div>
          </div>
        ) : null}

        <div style={S.controls}>
          <button
            onClick={buzz}
            disabled={reader.phase !== 'reading'}
            style={{
              ...S.buzz,
              opacity: reader.phase === 'reading' ? 1 : 0.35,
            }}
          >
            BUZZ <span style={S.key}>space</span>
          </button>

          <input
            ref={inputRef}
            value={given}
            onChange={(e) => setGiven(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canAnswer) {
                submit(given);
                setGiven('');
              }
            }}
            placeholder={canAnswer ? 'your answer, then Enter' : '—'}
            disabled={!canAnswer}
            style={{ ...S.input, opacity: canAnswer ? 1 : 0.35 }}
          />

          <button
            onClick={() => void loadNext()}
            style={S.next}
            disabled={loading}
          >
            Next →
          </button>
        </div>

        {isEphemeral() ? (
          <p style={S.warn}>
            Storage unavailable, so this session's stats are in memory only.
          </p>
        ) : null}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span style={S.stat}>
      <span style={S.statLabel}>{label}</span>
      <span style={S.statValue}>{value}</span>
    </span>
  );
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

const S: Record<string, CSSProperties> = {
  app: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    borderBottom: '1px solid var(--line)',
    padding: '10px 16px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    fontSize: 13,
    letterSpacing: 0.4,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  coreTag: {
    fontSize: 10,
    color: 'var(--ink-soft)',
    border: '1px solid var(--line)',
    borderRadius: 3,
    padding: '1px 5px',
  },
  statRow: { display: 'flex', gap: 14, flexWrap: 'wrap' },
  stat: { display: 'flex', flexDirection: 'column', lineHeight: 1.2 },
  statLabel: { fontSize: 9, color: 'var(--ink-soft)', letterSpacing: 0.6 },
  statValue: { fontSize: 14, fontVariantNumeric: 'tabular-nums' },
  main: {
    flex: 1,
    width: '100%',
    maxWidth: 760,
    margin: '0 auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  meta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
    fontSize: 11,
    color: 'var(--ink-soft)',
  },
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: '18px 20px',
    minHeight: 190,
  },
  question: {
    margin: 0,
    fontFamily: 'var(--font-read)',
    fontSize: 18,
    lineHeight: 1.62,
  },
  caret: {
    display: 'inline-block',
    width: 8,
    height: 17,
    background: 'var(--accent)',
    verticalAlign: '-2px',
  },
  status: {
    fontSize: 11,
    letterSpacing: 0.5,
    display: 'flex',
    justifyContent: 'space-between',
    minHeight: 16,
  },
  progress: { color: 'var(--ink-soft)', fontVariantNumeric: 'tabular-nums' },
  result: {
    border: '1px solid',
    borderRadius: 6,
    padding: '10px 12px',
    background: 'var(--panel-2)',
    fontSize: 13,
  },
  answerLine: { marginTop: 4, color: 'var(--ink-soft)', fontSize: 12 },
  controls: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  buzz: {
    background: 'var(--bad)',
    color: '#fff',
    border: 0,
    borderRadius: 6,
    padding: '14px 20px',
    fontWeight: 700,
    letterSpacing: 0.6,
    minHeight: 48,
  },
  key: { fontSize: 10, fontWeight: 400, opacity: 0.85, marginLeft: 6 },
  input: {
    flex: 1,
    minWidth: 180,
    background: 'var(--panel-2)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    color: 'var(--ink)',
    padding: '0 12px',
    minHeight: 48,
  },
  next: {
    background: 'transparent',
    color: 'var(--ink)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    padding: '0 16px',
    minHeight: 48,
  },
  warn: { fontSize: 11, color: 'var(--gold)', margin: 0 },
  nav: {
    display: 'flex',
    gap: 4,
    padding: '8px 16px 0',
    borderBottom: '1px solid var(--line)',
  },
  navBtn: {
    background: 'transparent',
    border: 0,
    borderBottom: '2px solid transparent',
    color: 'var(--ink-soft)',
    padding: '6px 10px',
    fontSize: 12,
  },
  navOn: {
    color: 'var(--ink)',
    borderBottomColor: 'var(--accent)',
  },
};
