/**
 * H2H bracket match room: the exact same websocket buzz-lockout engine as an
 * ordinary Rooms.tsx room (see useRoom/RoomClient), but joined with a `side`
 * so the server aggregates scores per side instead of per player. The room
 * itself decides when regulation is complete and reports the winner to the
 * bracket (workers/room/room.ts's reportMatchResultIfOver) — this screen just
 * reflects that back once `snapshot.match.over` flips true.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Sheet, TextInput } from '../ui';
import { useAuth } from '../auth';
import { useRoom } from '../room/useRoom';
import type { Side } from '../../workers/room/protocol';
import './Rooms.css';
import './Tournaments.css';

export interface H2HMatchRoomProps {
  roomCode: string;
  side: Side | null;
  onExit(): void;
  /** Defaults to "H2H Match" (bracket matches); Quick Play passes its own. */
  title?: string;
  /** Shown on a tied regulation finish. Defaults to the bracket TD note. */
  tieNote?: string;
}

export default function H2HMatchRoom({
  roomCode,
  side,
  onExit,
  title = 'H2H Match',
  tieNote = 'the match tied — the TD will resolve this bracket slot by hand.',
}: H2HMatchRoomProps) {
  const auth = useAuth();
  const name = auth.user?.username ?? 'player';
  const room = useRoom(roomCode, name, '', side ?? undefined);
  const [given, setGiven] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const snap = room.snapshot;
  const me = room.playerId;
  const iHoldBuzz = snap?.buzzer != null && snap.buzzer === me;
  const myLockout = snap?.players.find((p) => p.id === me)?.lockedOut ?? false;
  const match = snap?.match ?? null;

  useEffect(() => {
    if (iHoldBuzz) inputRef.current?.focus();
  }, [iHoldBuzz]);

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
    for (let k = 0; k < powerIndex; k++) powerStart += (words[k] ?? '').length + 1;
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

  const sideAPlayers = (snap?.players ?? []).filter((p) => p.side === 'a');
  const sideBPlayers = (snap?.players ?? []).filter((p) => p.side === 'b');

  return (
    <div className="rooms">
      <Sheet
        title={title}
        aside={
          <Button variant="ghost" small onClick={onExit}>
            Leave
          </Button>
        }
      >
        {match ? (
          <div className="h2h__scoreline">
            <SidePlayers label="Side A" players={sideAPlayers} score={match.sideScores.a} buzzer={snap?.buzzer} />
            <span className="h2h__vs">
              {match.tossupsPlayed}/{match.regulationTossups}
            </span>
            <SidePlayers label="Side B" players={sideBPlayers} score={match.sideScores.b} buzzer={snap?.buzzer} />
          </div>
        ) : (
          <p className="tiny muted">Connecting to the match room…</p>
        )}
        <div className="rooms__topline">
          <span className="rooms__code">{roomCode}</span>
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
      </Sheet>

      {match?.over ? (
        <Sheet title="Match complete">
          <p className="tiny muted">
            Regulation is finished
            {match.sideScores.a !== match.sideScores.b
              ? `; ${match.sideScores.a > match.sideScores.b ? 'Side A' : 'Side B'} wins the match.`
              : `; ${tieNote}`}
          </p>
        </Sheet>
      ) : (
        <>
          <div className="rooms__stage">
            {snap?.question ? (
              <p className="rooms__question">
                {powerIndex !== null ? (
                  <>
                    <span>{shown.slice(0, Math.min(shownChars, powerStart))}</span>
                    <span className="rooms__question--power">
                      {shown.slice(Math.min(shownChars, powerStart), Math.min(shownChars, powerEnd))}
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
                {snap?.phase === 'lobby' ? 'Either side can start the next tossup.' : 'Connecting…'}
              </p>
            )}
          </div>

          <div className="rooms__status">
            <span>
              {snap?.phase === 'buzzed' ? (
                <>
                  <strong>{snap.players.find((p) => p.id === snap.buzzer)?.name ?? 'someone'}</strong> buzzed
                  {room.secondsLeft !== null ? ` · ${room.secondsLeft}s` : ''}
                </>
              ) : snap?.phase === 'reading' ? (
                myLockout ? (
                  'locked out on this tossup'
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
            <span>{snap?.question ? `${room.revealed}/${words.length}` : ''}</span>
          </div>

          {room.lastJudged ? (
            <div className={['rooms__judged', `rooms__judged--${room.lastJudged.directive}`].join(' ')}>
              <span>
                <b>{snap?.players.find((p) => p.id === room.lastJudged?.playerId)?.name}</b>{' '}
                {room.lastJudged.directive}
                {room.lastJudged.directedPrompt ? ` — ${room.lastJudged.directedPrompt}` : ''}
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
            <Button variant="buzz" disabled={snap?.phase !== 'reading' || myLockout} onClick={room.buzz}>
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
            <Button onClick={room.start} disabled={snap?.phase === 'reading'}>
              Start tossup
            </Button>
          </div>
        </>
      )}

      {room.error ? <p className="banner banner--warn">{room.error}</p> : null}
    </div>
  );
}

function SidePlayers({
  label,
  players,
  score,
  buzzer,
}: {
  label: string;
  players: Array<{ id: string; name: string; connected: boolean; lockedOut: boolean }>;
  score: number;
  buzzer?: string | null;
}) {
  return (
    <div className="h2h__side">
      <div className="h2h__side-label">
        {label} <span className="h2h__side-score">{score}</span>
      </div>
      <div className="rooms__players">
        {players.map((p) => (
          <span
            key={p.id}
            className={[
              'player-chip',
              buzzer === p.id ? 'player-chip--buzzed' : '',
              p.connected ? '' : 'player-chip--offline',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span>{p.name}</span>
            {p.lockedOut ? <span className="player-chip__out">out</span> : null}
          </span>
        ))}
        {players.length === 0 ? <span className="tiny muted">waiting…</span> : null}
      </div>
    </div>
  );
}
