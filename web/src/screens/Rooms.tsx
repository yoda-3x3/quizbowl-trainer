/**
 * Multiplayer rooms screen. OWNED FILE.
 *
 * Two surfaces share this file:
 *   - a lobby landing with a hero "Create a room" tile and a focused
 *     four-cell code entry for joining;
 *   - the live room with player chips, the question stage (letter-by-letter
 *     reveal interpolated between server snapshots), the judged banner, a
 *     BUZZ button and the answer input.
 *
 * All visual primitives come from the design system (Sheet / Button / Field);
 * the bespoke parts (four-cell code input, player chips, stage, judged
 * banner) live in Rooms.css so they stay theme-aware through CSS variables
 * rather than inline styles.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { Button, Field, Sheet, TextInput } from '../ui';
import { createRoom } from '../room/client';
import { useRoom } from '../room/useRoom';
import { CODE_ALPHABET, CODE_LENGTH } from '../../workers/room/protocol';
import './Rooms.css';

const CODE_LEN = CODE_LENGTH;
// Matches protocol.ts's makeRoomCode() alphabet exactly. A plain [^A-Z] filter
// here previously stripped every digit the generator can produce (2-9),
// which made most generated codes literally unjoinable through this input.
const CODE_CHARS = new RegExp(`[^${CODE_ALPHABET}]`, 'g');

/** Exported for a direct unit test; see __tests__/roomsCodeEntry.test.ts. */
export function sanitizeCodeInput(raw: string): string {
  return raw.toUpperCase().replace(CODE_CHARS, '').slice(0, CODE_LEN);
}

/**
 * A deterministic hue from the nickname, so two people in the same room read
 * as visually distinct player chips instead of identical gray text — Rooms
 * is the one social, multiplayer surface, and had nothing of its own besides
 * a plain text input.
 */
function avatarHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

export default function Rooms({ baseUrl = '' }: { baseUrl?: string }) {
  const [name, setName] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [joined, setJoined] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  if (joined) {
    return (
      <InRoom
        code={joined}
        name={name}
        baseUrl={baseUrl}
        onLeave={() => setJoined(null)}
      />
    );
  }

  const canJoin = codeInput.length === CODE_LEN && name.trim() !== '';
  const canCreate = !creating && name.trim() !== '';

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      setJoined(await createRoom(baseUrl));
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'failed to create');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="rooms">
      <Sheet>
        <div className="rooms__intro">
          <p>
            Everyone reads the same question at the same instant. Buzz order
            is decided by the server, so the fastest finger wins rather than
            the fastest connection.
          </p>
        </div>
      </Sheet>

      <Sheet title="Your nickname">
        <div className="rooms__nickname">
          {name.trim() ? (
            <span
              className="rooms__avatar"
              style={{ background: `hsl(${avatarHue(name.trim())} 55% 42%)` }}
              aria-hidden="true"
            >
              {name.trim()[0]!.toUpperCase()}
            </span>
          ) : null}
          <Field label="how others see you">
            <TextInput
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              placeholder="pick a nickname"
              autoFocus
            />
          </Field>
        </div>
      </Sheet>

      <Sheet title="Start a room">
        <p className="tiny muted">
          Opens a fresh room and gives you a code to share.
        </p>
        <Button
          variant="primary"
          block
          disabled={!canCreate}
          onClick={() => void create()}
        >
          {creating ? 'Creating…' : 'Create a room'}
        </Button>
        {createError ? (
          <p className="banner banner--warn">{createError}</p>
        ) : null}
      </Sheet>

      <div className="rooms__or">or</div>

      <Sheet title="Join with a code">
        <p className="tiny muted">
          Four characters. Not case-sensitive.
        </p>
        <CodeEntry
          value={codeInput}
          onChange={(v) => setCodeInput(v)}
          onComplete={(v) => {
            if (name.trim() !== '') setJoined(v);
          }}
        />
        <Button
          variant="primary"
          block
          disabled={!canJoin}
          onClick={() => setJoined(codeInput)}
        >
          Join {codeInput ? codeInput : ''}
        </Button>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Four-cell code entry
// ---------------------------------------------------------------------------

/**
 * A single invisible <input maxLength=4> overlays four cells. The cells show
 * the typed letters; the input receives focus and handles paste / backspace
 * naturally. One IME-visible control keeps mobile autocorrect out of the way.
 */
function CodeEntry({
  value,
  onChange,
  onComplete,
}: {
  value: string;
  onChange(v: string): void;
  onComplete(v: string): void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const next = sanitizeCodeInput(e.target.value);
    onChange(next);
    if (next.length === CODE_LEN) onComplete(next);
  };

  const cells = [];
  for (let i = 0; i < CODE_LEN; i++) {
    const ch = value[i] ?? '';
    const isCaret = i === value.length && document.activeElement === ref.current;
    cells.push(
      <span
        key={i}
        className={[
          'code-entry__cell',
          ch ? 'code-entry__cell--filled' : '',
          isCaret ? 'code-entry__cell--caret' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {ch}
      </span>,
    );
  }

  return (
    <label className="code-entry">
      <input
        ref={ref}
        className="code-entry__input"
        value={value}
        onChange={handle}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        maxLength={CODE_LEN}
        aria-label="room code"
      />
      <span className="code-entry__cells">{cells}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// In-room: live play
// ---------------------------------------------------------------------------

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
  const myLockout =
    snap?.players.find((p) => p.id === me)?.lockedOut ?? false;

  useEffect(() => {
    if (iHoldBuzz) inputRef.current?.focus();
  }, [iHoldBuzz]);

  // SPACE buzzes in-room. The tossup screen handles space itself inside its
  // own phase-aware handler, so there is never a collision between them.
  useEffect(() => {
    const onKey = (ev: globalThis.KeyboardEvent) => {
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
  const fullText = words.join(' ');
  const shownChars = Math.min(room.revealedChars, fullText.length);
  const shown = fullText.slice(0, shownChars);
  const rest = fullText.slice(shownChars);
  const powerIndex = snap?.question?.powerIndex ?? null;
  let powerStart = 0;
  let powerEnd = 0;
  if (powerIndex !== null) {
    for (let k = 0; k < powerIndex; k++) {
      powerStart += (words[k] ?? '').length + 1;
    }
    powerEnd = powerStart + (words[powerIndex] ?? '').length;
  }

  const submitAnswer = useCallback(() => {
    if (!iHoldBuzz) return;
    room.answer(given);
    setGiven('');
  }, [given, iHoldBuzz, room]);

  const onAnswerKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submitAnswer();
  };

  return (
    <div className="rooms">
      <Sheet
        title="Room"
        aside={
          <Button variant="ghost" small onClick={onLeave}>
            Leave
          </Button>
        }
      >
        <div className="rooms__topline">
          <span className="rooms__code">{code}</span>
          <span
            className={[
              'rooms__conn',
              room.connection === 'connected' ? 'rooms__conn--on' : '',
              room.connection !== 'connected' ? 'rooms__conn--off' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {room.connection}
          </span>
        </div>

        <div className="rooms__players">
          {(snap?.players ?? []).map((p) => (
            <span
              key={p.id}
              className={[
                'player-chip',
                snap?.buzzer === p.id ? 'player-chip--buzzed' : '',
                p.connected ? '' : 'player-chip--offline',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span>{p.name}</span>
              <span className="player-chip__score">{p.score}</span>
              {p.lockedOut ? (
                <span className="player-chip__out">out</span>
              ) : null}
            </span>
          ))}
          {(snap?.players.length ?? 0) === 0 ? (
            <span className="tiny muted">waiting for players…</span>
          ) : null}
        </div>
      </Sheet>

      <div className="rooms__stage">
        {snap?.question ? (
          <p className="rooms__question">
            {powerIndex !== null ? (
              <>
                <span>{shown.slice(0, Math.min(shownChars, powerStart))}</span>
                <span className="rooms__question--power">
                  {shown.slice(
                    Math.min(shownChars, powerStart),
                    Math.min(shownChars, powerEnd),
                  )}
                </span>
                <span>{shown.slice(Math.min(shownChars, powerEnd))}</span>
              </>
            ) : (
              <span>{shown}</span>
            )}
            {snap.phase === 'resolved' && rest.length > 0 ? (
              <span className="rooms__question--rest">{rest}</span>
            ) : null}
          </p>
        ) : (
          <p className="rooms__waiting">
            {snap?.phase === 'lobby'
              ? 'Anyone can start the next question.'
              : 'Connecting…'}
          </p>
        )}
      </div>

      <div className="rooms__status">
        <span>
          {snap?.phase === 'buzzed' ? (
            <>
              <strong>
                {snap.players.find((p) => p.id === snap.buzzer)?.name ??
                  'someone'}
              </strong>{' '}
              buzzed
              {room.secondsLeft !== null ? ` · ${room.secondsLeft}s` : ''}
            </>
          ) : snap?.phase === 'reading' ? (
            myLockout ? (
              'locked out on this question'
            ) : (
              <>
                press <strong>SPACE</strong> to buzz
              </>
            )
          ) : snap?.phase === 'resolved' ? (
            <strong>{snap.reveal?.answerSanitized ?? ''}</strong>
          ) : (
            ''
          )}
        </span>
        <span>
          {snap?.question ? `${room.revealed}/${words.length}` : ''}
        </span>
      </div>

      {room.lastJudged ? (
        <div
          className={[
            'rooms__judged',
            `rooms__judged--${room.lastJudged.directive}`,
          ].join(' ')}
        >
          <span>
            <b>
              {snap?.players.find((p) => p.id === room.lastJudged?.playerId)
                ?.name}
            </b>{' '}
            {room.lastJudged.directive}
            {room.lastJudged.directedPrompt
              ? ` — ${room.lastJudged.directedPrompt}`
              : ''}
          </span>
          {room.lastJudged.points !== 0 ? (
            <span className="rooms__judged__points">
              {room.lastJudged.points > 0 ? '+' : ''}
              {room.lastJudged.points}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="rooms__actions">
        <Button
          variant="buzz"
          disabled={snap?.phase !== 'reading' || myLockout}
          onClick={room.buzz}
        >
          BUZZ
        </Button>
        <TextInput
          ref={inputRef}
          disabled={!iHoldBuzz}
          value={given}
          placeholder={iHoldBuzz ? 'your answer, then Enter' : '—'}
          onChange={(e) => setGiven(e.target.value)}
          onKeyDown={onAnswerKey}
        />
      </div>

      <div className="rooms__footer">
        <Button
          onClick={room.start}
          disabled={snap?.phase === 'reading'}
        >
          Start question
        </Button>
        <Button variant="ghost" onClick={room.next}>
          Clear
        </Button>
      </div>

      {room.error ? <p className="banner banner--warn">{room.error}</p> : null}
    </div>
  );
}
