/**
 * React binding for a multiplayer room. OWNED FILE.
 *
 * The interesting part is `revealed`. The server sends a snapshot only when
 * something changes, so between snapshots this interpolates locally against
 * the synced clock. That gives a smooth word-by-word read at 60fps with a
 * handful of messages per question, and every device lands on the same word at
 * the same instant because they all extrapolate from the same server clock.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomSnapshot, ServerMessage } from '../../workers/room/protocol';
import { revealedAt, revealedCharsAt } from '../engine/pacing';
import { RoomClient, type ConnectionState } from './client';

export interface RoomView {
  connection: ConnectionState;
  snapshot: RoomSnapshot | null;
  playerId: string | undefined;
  /** Words to show right now, interpolated between snapshots. */
  revealed: number;
  /** Characters of `words.join(' ')` to show right now. Lets the UI type the
   * question out letter-by-letter instead of popping whole words in. */
  revealedChars: number;
  /** Whole seconds left on the buzzer's answer window, or null. */
  secondsLeft: number | null;
  /** The most recent judgement, for a flash of feedback. */
  lastJudged: Extract<ServerMessage, { t: 'judged' }> | null;
  error: string | null;
  start(): void;
  buzz(): void;
  answer(given: string): void;
  next(): void;
}

export function useRoom(
  code: string | null,
  name: string,
  baseUrl = '',
): RoomView {
  const clientRef = useRef<RoomClient | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('closed');
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [lastJudged, setLastJudged] =
    useState<Extract<ServerMessage, { t: 'judged' }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [revealedChars, setRevealedChars] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Guards against a late snapshot briefly rewinding the visible text.
  const lastQuestionId = useRef<string | null>(null);
  const highWater = useRef(0);
  const highWaterChars = useRef(0);

  useEffect(() => {
    if (!code) return;

    const client = new RoomClient(baseUrl, code, name, {
      connection: setConnection,
      snapshot: (s) => {
        setSnapshot(s);
        if (s.question?.id !== lastQuestionId.current) {
          lastQuestionId.current = s.question?.id ?? null;
          highWater.current = 0;
          highWaterChars.current = 0;
          setLastJudged(null);
        }
      },
      message: (m) => {
        if (m.t === 'judged') setLastJudged(m);
        if (m.t === 'error') setError(m.message);
      },
    });

    clientRef.current = client;
    client.connect();

    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [code, name, baseUrl]);

  // Animation loop: interpolate the word count and the answer countdown.
  useEffect(() => {
    let frame = 0;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const client = clientRef.current;
      const snap = client?.snapshot;
      if (!client || !snap) return;

      if (snap.question && snap.schedule.length > 0) {
        const drift = snap.clock.running
          ? client.serverNow() - snap.serverNow
          : 0;
        const elapsed = snap.clock.elapsed + Math.max(0, drift);
        const n = Math.min(
          revealedAt(snap.schedule, elapsed),
          snap.question.words.length,
        );
        const chars = revealedCharsAt(
          snap.question.words,
          snap.schedule,
          elapsed,
        );
        if (n > highWater.current) highWater.current = n;
        if (chars > highWaterChars.current) highWaterChars.current = chars;
        if (snap.phase === 'resolved') {
          setRevealed(snap.question.words.length);
          setRevealedChars(snap.question.words.join(' ').length);
        } else {
          setRevealed(highWater.current);
          setRevealedChars(highWaterChars.current);
        }
      } else {
        setRevealed(0);
        setRevealedChars(0);
      }

      if (snap.answerDeadline !== null && snap.phase === 'buzzed') {
        const left = snap.answerDeadline - client.serverNow();
        setSecondsLeft(left > 0 ? Math.ceil(left / 1000) : 0);
      } else {
        setSecondsLeft(null);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const start = useCallback(() => clientRef.current?.start(), []);
  const buzz = useCallback(() => clientRef.current?.buzz(), []);
  const answer = useCallback((g: string) => clientRef.current?.answer(g), []);
  const next = useCallback(() => clientRef.current?.next(), []);

  return {
    connection,
    snapshot,
    playerId: clientRef.current?.playerId,
    revealed,
    revealedChars,
    secondsLeft,
    lastJudged,
    error,
    start,
    buzz,
    answer,
    next,
  };
}
