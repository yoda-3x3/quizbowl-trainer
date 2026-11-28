/**
 * Quick Play (Tournaments v2 step 5): public matchmaking that affects ELO,
 * plus a private invite-code game that doesn't. Both play through the exact
 * same H2H Room DO as a bracket match (see H2HMatchRoom.tsx) — this screen's
 * job is only matchmaking: finding (or waiting for) an opponent and handing
 * off the room code + side once one exists.
 *
 * The public queue and the private host both "wait" the same way: poll
 * `queueStatus`, which resolves to the caller's active match (if any) once
 * someone else has joined — see workers/room/quickplay.ts's
 * getActiveMatchFor for why a waiting player can't just read their own
 * request's response.
 */

import { useEffect, useRef, useState } from 'react';
import { Button, Sheet, TextInput } from '../ui';
import {
  createPrivateGame,
  joinPrivateGame,
  joinQueue,
  leaveQueue,
  queueStatus,
  type QuickPlayMatchPublic,
} from '../quickplay';
import H2HMatchRoom from './H2HMatchRoom';
import RankBadge from '../RankBadge';
import { useMyRank } from '../myRank';
import type { Side } from '../../workers/room/protocol';
import './Tournaments.css';
import './Rooms.css';

type Mode =
  | { kind: 'menu' }
  | { kind: 'queued' }
  | { kind: 'private-host'; inviteCode: string }
  | { kind: 'private-join' }
  | { kind: 'match'; roomCode: string; side: Side | null; rated: boolean };

const POLL_MS = 2000;

export default function QuickPlay({ onExit }: { onExit(): void }) {
  const [mode, setMode] = useState<Mode>({ kind: 'menu' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const myRank = useMyRank();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };
  useEffect(() => stopPolling, []);

  const enterMatch = (match: QuickPlayMatchPublic) => {
    stopPolling();
    setMode({ kind: 'match', roomCode: match.room_code ?? '', side: match.side, rated: match.rated });
  };

  const startWaitPolling = () => {
    stopPolling();
    pollRef.current = setInterval(() => {
      void queueStatus()
        .then((status) => {
          if (status.match && status.match.room_code) enterMatch(status.match);
        })
        .catch(() => {
          /* transient network hiccup; next tick retries */
        });
    }, POLL_MS);
  };

  const findMatch = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await joinQueue();
      if (result.status === 'matched') {
        enterMatch(result.match);
      } else {
        setMode({ kind: 'queued' });
        startWaitPolling();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to join the queue');
    } finally {
      setBusy(false);
    }
  };

  const cancelQueue = async () => {
    stopPolling();
    setMode({ kind: 'menu' });
    try {
      await leaveQueue();
    } catch {
      /* best effort; the server-side row expires on its own via the match
         it would otherwise form, so a failed leave here is harmless */
    }
  };

  const createPrivate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await createPrivateGame();
      setMode({ kind: 'private-host', inviteCode: result.invite_code });
      startWaitPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to create a private game');
    } finally {
      setBusy(false);
    }
  };

  if (mode.kind === 'match') {
    return (
      <H2HMatchRoom
        roomCode={mode.roomCode}
        side={mode.side}
        title="Quick Play"
        tieNote={
          mode.rated
            ? 'the match tied — no rating change either way.'
            : "the match tied — it's a private game, so nothing's recorded."
        }
        onExit={() => {
          stopPolling();
          setMode({ kind: 'menu' });
          onExit();
        }}
      />
    );
  }

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">Quick Play</h1>
        <div className="topbar__right">
          <Button variant="ghost" small onClick={onExit}>
            Done
          </Button>
        </div>
      </header>

      <div className="app__body">
        {mode.kind === 'menu' ? (
          <>
            <Sheet title="Find a match">
              {myRank ? (
                <div className="quickplay__rank">
                  <RankBadge rating={myRank} />
                </div>
              ) : null}
              <p className="tiny muted">
                Regulation 20 tossups against the next person who also wants a match. Rated — wins
                and losses move your ELO.
              </p>
              <Button variant="primary" block onClick={() => void findMatch()} disabled={busy}>
                {busy ? 'Finding…' : 'Find a match'}
              </Button>
            </Sheet>

            <Sheet title="Private game">
              <p className="tiny muted">
                Play a friend with an invite code instead. Unrated — no ELO change for either of you.
              </p>
              <div className="row">
                <Button block onClick={() => void createPrivate()} disabled={busy}>
                  Create a game
                </Button>
                <Button block variant="ghost" onClick={() => setMode({ kind: 'private-join' })} disabled={busy}>
                  Join with a code
                </Button>
              </div>
            </Sheet>
          </>
        ) : null}

        {mode.kind === 'queued' ? (
          <Sheet title="Finding an opponent…">
            <p className="tiny muted">Hang tight — this page updates automatically once someone's found.</p>
            <Button block variant="ghost" onClick={() => void cancelQueue()}>
              Cancel
            </Button>
          </Sheet>
        ) : null}

        {mode.kind === 'private-host' ? (
          <Sheet title="Waiting for your opponent">
            <p className="tiny muted">Share this code. The game starts as soon as they join.</p>
            <div className="rooms__code-display">
              <span className="rooms__code">{mode.inviteCode}</span>
              <Button
                small
                variant="ghost"
                onClick={() => void navigator.clipboard?.writeText(mode.inviteCode)}
              >
                Copy
              </Button>
            </div>
            <Button
              block
              variant="ghost"
              onClick={() => {
                stopPolling();
                setMode({ kind: 'menu' });
              }}
            >
              Cancel
            </Button>
          </Sheet>
        ) : null}

        {mode.kind === 'private-join' ? (
          <PrivateJoinForm
            busy={busy}
            onBack={() => setMode({ kind: 'menu' })}
            onSubmit={async (code) => {
              setBusy(true);
              setError(null);
              try {
                const result = await joinPrivateGame(code);
                enterMatch(result.match);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'failed to join that game');
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : null}

        {error ? <p className="banner banner--warn">{error}</p> : null}
      </div>
    </>
  );
}

function PrivateJoinForm({
  busy,
  onBack,
  onSubmit,
}: {
  busy: boolean;
  onBack(): void;
  onSubmit(code: string): void | Promise<void>;
}) {
  const [code, setCode] = useState('');

  return (
    <Sheet
      title="Join with a code"
      aside={
        <Button variant="ghost" small onClick={onBack}>
          Back
        </Button>
      }
    >
      <TextInput
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="6-character code"
        maxLength={6}
        autoFocus
      />
      <Button
        variant="primary"
        block
        disabled={busy || code.trim().length === 0}
        onClick={() => void onSubmit(code)}
      >
        {busy ? 'Joining…' : 'Join game'}
      </Button>
    </Sheet>
  );
}
