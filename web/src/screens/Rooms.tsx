/**
 * Multiplayer rooms screen. OWNED FILE.
 *
 * Deliberately plain: this exists to exercise the room protocol against the
 * real Durable Object. Card A owns the visual system; this screen should adopt
 * its primitives once they land.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoom } from '../room/client';
import { useRoom } from '../room/useRoom';

export default function Rooms({ baseUrl = '' }: { baseUrl?: string }) {
  const [name, setName] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [joined, setJoined] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  if (!joined) {
    return (
      <div style={S.wrap}>
        <h2 style={S.h2}>Rooms</h2>
        <p style={S.hint}>
          Everyone reads the same question at the same instant. Buzz order is
          decided by the server, so the fastest finger wins rather than the
          fastest connection.
        </p>

        <label style={S.label}>
          your name
          <input
            style={S.input}
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            placeholder="nickname"
          />
        </label>

        <div style={S.row}>
          <input
            style={{ ...S.input, textTransform: 'uppercase', letterSpacing: 4 }}
            value={codeInput}
            maxLength={4}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="CODE"
          />
          <button
            style={S.btn}
            disabled={codeInput.length !== 4 || name.trim() === ''}
            onClick={() => setJoined(codeInput)}
          >
            Join
          </button>
        </div>

        <button
          style={S.btnPrimary}
          disabled={creating || name.trim() === ''}
          onClick={async () => {
            setCreating(true);
            setCreateError(null);
            try {
              setJoined(await createRoom(baseUrl));
            } catch (err) {
              setCreateError(err instanceof Error ? err.message : 'failed');
            } finally {
              setCreating(false);
            }
          }}
        >
          {creating ? 'creating…' : 'Create a room'}
        </button>

        {createError ? <p style={S.err}>{createError}</p> : null}
      </div>
    );
  }

  return <InRoom code={joined} name={name} baseUrl={baseUrl} onLeave={() => setJoined(null)} />;
}

function InRoom({
  code,
  name,
  baseUrl,
  onLeave,
}: {
  code: string;
  name: string;
  baseUrl: string;
  onLeave(): void;
}) {
  const room = useRoom(code, name, baseUrl);
  const [given, setGiven] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const snap = room.snapshot;
  const me = room.playerId;
  const iHoldBuzz = snap?.buzzer != null && snap.buzzer === me;

  useEffect(() => {
    if (iHoldBuzz) inputRef.current?.focus();
  }, [iHoldBuzz]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      const typing = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA';
      if (ev.code === 'Space' && !typing && snap?.phase === 'reading') {
        ev.preventDefault();
        room.buzz();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [room, snap?.phase]);

  const words = snap?.question?.words ?? [];
  const shown = words.slice(0, room.revealed);
  const myLockout = snap?.players.find((p) => p.id === me)?.lockedOut ?? false;

  return (
    <div style={S.wrap}>
      <div style={S.topline}>
        <span style={S.code}>{code}</span>
        <span style={S.conn(room.connection)}>{room.connection}</span>
        <button style={S.linkBtn} onClick={onLeave}>
          leave
        </button>
      </div>

      <div style={S.players}>
        {(snap?.players ?? []).map((p) => (
          <span
            key={p.id}
            style={{
              ...S.player,
              opacity: p.connected ? 1 : 0.4,
              borderColor:
                snap?.buzzer === p.id ? 'var(--accent)' : 'var(--line)',
            }}
          >
            <span>{p.name}</span>
            <strong style={S.score}>{p.score}</strong>
            {p.lockedOut ? <span style={S.lock}>out</span> : null}
          </span>
        ))}
      </div>

      <div style={S.card}>
        {snap?.question ? (
          <p style={S.question}>
            {shown.map((w, i) => (
              <span
                key={i}
                style={
                  snap.question?.powerIndex === i
                    ? { color: 'var(--gold)' }
                    : undefined
                }
              >
                {w}{' '}
              </span>
            ))}
            {snap.phase === 'resolved' ? (
              <span style={{ color: 'var(--ink-soft)' }}>
                {words.slice(room.revealed).join(' ')}
              </span>
            ) : null}
          </p>
        ) : (
          <p style={S.waiting}>
            {snap?.phase === 'lobby'
              ? 'Waiting. Anyone can start the next question.'
              : 'connecting…'}
          </p>
        )}
      </div>

      <div style={S.status}>
        <span>
          {snap?.phase === 'buzzed'
            ? `${snap.players.find((p) => p.id === snap.buzzer)?.name ?? 'someone'} buzzed${
                room.secondsLeft !== null ? ` · ${room.secondsLeft}s` : ''
              }`
            : snap?.phase === 'reading'
              ? myLockout
                ? 'locked out on this question'
                : 'SPACE to buzz'
              : snap?.phase === 'resolved'
                ? (snap.reveal?.answerSanitized ?? '')
                : ''}
        </span>
        <span style={{ color: 'var(--ink-soft)' }}>
          {snap?.question ? `${room.revealed}/${words.length}` : ''}
        </span>
      </div>

      {room.lastJudged ? (
        <div
          style={{
            ...S.judged,
            borderColor:
              room.lastJudged.directive === 'accept'
                ? 'var(--good)'
                : room.lastJudged.directive === 'prompt'
                  ? 'var(--gold)'
                  : 'var(--bad)',
          }}
        >
          {snap?.players.find((p) => p.id === room.lastJudged?.playerId)?.name}{' '}
          {room.lastJudged.directive}
          {room.lastJudged.directedPrompt
            ? ` — ${room.lastJudged.directedPrompt}`
            : ''}{' '}
          {room.lastJudged.points !== 0
            ? `${room.lastJudged.points > 0 ? '+' : ''}${room.lastJudged.points}`
            : ''}
        </div>
      ) : null}

      <div style={S.row}>
        <button
          style={{ ...S.buzz, opacity: snap?.phase === 'reading' && !myLockout ? 1 : 0.35 }}
          disabled={snap?.phase !== 'reading' || myLockout}
          onClick={room.buzz}
        >
          BUZZ
        </button>
        <input
          ref={inputRef}
          style={{ ...S.input, opacity: iHoldBuzz ? 1 : 0.35 }}
          disabled={!iHoldBuzz}
          value={given}
          placeholder={iHoldBuzz ? 'your answer, then Enter' : '—'}
          onChange={(e) => setGiven(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && iHoldBuzz) {
              room.answer(given);
              setGiven('');
            }
          }}
        />
      </div>

      <div style={S.row}>
        <button style={S.btn} onClick={room.start} disabled={snap?.phase === 'reading'}>
          Start question
        </button>
        <button style={S.btn} onClick={room.next}>
          Clear
        </button>
      </div>

      {room.error ? <p style={S.err}>{room.error}</p> : null}
    </div>
  );
}

const S = {
  wrap: {
    width: '100%',
    maxWidth: 1040,
    margin: '0 auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxSizing: 'border-box',
  } as CSSProperties,
  h2: { margin: 0, fontSize: 18 } as CSSProperties,
  hint: { margin: 0, fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--ink-soft)' } as CSSProperties,
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  input: {
    flex: 1,
    minWidth: 140,
    background: 'var(--panel-2)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    color: 'var(--ink)',
    padding: '0 12px',
    minHeight: 44,
  } as CSSProperties,
  btn: {
    background: 'transparent',
    color: 'var(--ink)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    padding: '0 16px',
    minHeight: 44,
  } as CSSProperties,
  btnPrimary: {
    background: 'var(--accent)',
    color: '#0b1016',
    border: 0,
    borderRadius: 6,
    padding: '0 16px',
    minHeight: 44,
    fontWeight: 600,
  } as CSSProperties,
  buzz: {
    background: 'var(--bad)',
    color: '#fff',
    border: 0,
    borderRadius: 6,
    padding: '0 22px',
    minHeight: 48,
    fontWeight: 700,
    letterSpacing: 0.6,
  } as CSSProperties,
  linkBtn: {
    background: 'none',
    border: 0,
    color: 'var(--ink-soft)',
    fontSize: 11,
    textDecoration: 'underline',
  } as CSSProperties,
  topline: { display: 'flex', alignItems: 'center', gap: 10 } as CSSProperties,
  code: { fontSize: 20, letterSpacing: 6, fontWeight: 700 } as CSSProperties,
  conn: (c: string): CSSProperties => ({
    fontSize: 10,
    letterSpacing: 0.5,
    color: c === 'connected' ? 'var(--good)' : 'var(--gold)',
    border: '1px solid var(--line)',
    borderRadius: 3,
    padding: '1px 6px',
  }),
  players: { display: 'flex', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  player: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    border: '1px solid var(--line)',
    borderRadius: 5,
    padding: '4px 8px',
    fontSize: 12,
  } as CSSProperties,
  score: { fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  lock: { fontSize: 9, color: 'var(--bad)' } as CSSProperties,
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: '18px 20px',
    minHeight: 170,
    maxWidth: 820,
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
  } as CSSProperties,
  question: { margin: 0, fontFamily: 'var(--font-read)', fontSize: 17, lineHeight: 1.62 } as CSSProperties,
  waiting: { margin: 0, color: 'var(--ink-soft)', fontSize: 13 } as CSSProperties,
  status: { display: 'flex', justifyContent: 'space-between', fontSize: 11, minHeight: 16 } as CSSProperties,
  judged: { border: '1px solid', borderRadius: 6, padding: '8px 10px', fontSize: 12 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 12, margin: 0 } as CSSProperties,
};
