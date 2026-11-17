/**
 * One tournament: players, state, Join / Start controls, and a Tossup reader
 * once the tournament is running.
 *
 * The question picker lives in Tossup via TossupQueue, so Start fetches the
 * pinned sequence here just to persist the ids server-side (so a protest has a
 * concrete question_id to refer to), then hands the actual question reveal to
 * Tossup for the live play. A richer sequencer could walk the saved ids in a
 * fixed order; that is called out in NOTES.md.
 */

import { useCallback, useMemo, useState } from 'react';
import { Button, Field, Sheet, TextInput, filtersFrom, useSettings } from '../ui';
import { useAuth } from '../auth';
import { TossupQueue } from '../data/qbreader';
import Tossup, { type TossupProtestPayload } from './Tossup';
import {
  fileProtest,
  joinTournament,
  startTournament,
  useTournament,
  type TournamentDetail as TournamentDetailData,
  type TournamentQuestion,
} from '../tournaments';

export interface TournamentDetailProps {
  id: number;
  onExit(): void;
}

export default function TournamentDetail({ id, onExit }: TournamentDetailProps) {
  const auth = useAuth();
  const handle = useTournament(id);
  const { tournament } = handle;

  if (handle.loading && !tournament) {
    return (
      <Screen title="Tournament" onExit={onExit}>
        <p className="tiny muted">loading</p>
      </Screen>
    );
  }
  if (handle.error && !tournament) {
    return (
      <Screen title="Tournament" onExit={onExit}>
        <p className="banner banner--warn">{handle.error}</p>
      </Screen>
    );
  }
  if (!tournament) {
    return (
      <Screen title="Tournament" onExit={onExit}>
        <p className="tiny muted">not found</p>
      </Screen>
    );
  }

  const me = auth.user;
  const isCreator = me !== null && me.id === tournament.created_by;
  const isPlayer =
    me !== null && tournament.players.some((p) => p.user_id === me.id);

  if (tournament.state === 'running' && isPlayer) {
    return (
      <PlayView
        tournament={tournament}
        onExit={onExit}
      />
    );
  }

  return (
    <Screen title={tournament.name} onExit={onExit}>
      <Sheet
        title="Status"
        aside={
          <span className="tiny muted" aria-label="State">
            {tournament.state}
          </span>
        }
      >
        <p className="tiny muted">
          host {tournament.creator_username} / {tournament.n_tossups} tossups
          {tournament.n_bonuses > 0
            ? ` + ${tournament.n_bonuses} bonuses`
            : ''}
        </p>
      </Sheet>

      <Sheet title={`Players (${tournament.players.length})`}>
        {tournament.players.length === 0 ? (
          <p className="tiny muted">nobody has joined yet</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tournament.players.map((p) => (
              <li
                key={p.user_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <span>{p.username}</span>
                <span className="tiny muted">{p.team || '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      {tournament.state === 'open' ? (
        <OpenControls
          tournament={tournament}
          isCreator={isCreator}
          isPlayer={isPlayer}
          signedIn={me !== null}
          onUpdate={handle.update}
        />
      ) : tournament.state === 'running' && !isPlayer ? (
        <Sheet title="In progress">
          <p className="tiny muted">
            {me === null
              ? 'Sign in and ask the host to add you.'
              : 'This tournament is already running. Join is closed.'}
          </p>
        </Sheet>
      ) : (
        <Sheet title={tournament.state === 'finished' ? 'Finished' : 'Closed'}>
          <p className="tiny muted">no further action</p>
        </Sheet>
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Open-state controls (join / start)
// ---------------------------------------------------------------------------

function OpenControls({
  tournament,
  isCreator,
  isPlayer,
  signedIn,
  onUpdate,
}: {
  tournament: TournamentDetailData;
  isCreator: boolean;
  isPlayer: boolean;
  signedIn: boolean;
  onUpdate(t: TournamentDetailData): void;
}) {
  const [settings] = useSettings();
  const filters = useMemo(() => filtersFrom(settings), [settings]);
  const [team, setTeam] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doJoin = async () => {
    setBusy(true);
    setError(null);
    try {
      const fresh = await joinTournament(tournament.id, team.trim());
      onUpdate(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to join');
    } finally {
      setBusy(false);
    }
  };

  const doStart = async () => {
    setBusy(true);
    setError(null);
    try {
      const needed = tournament.n_tossups + tournament.n_bonuses;
      const picks = await pickQuestionIds(filters, needed);
      if (picks.length !== needed) {
        throw new Error(
          `could only find ${picks.length} questions; widen filters in Settings`,
        );
      }
      const questions: TournamentQuestion[] = picks.map((question_id, i) => ({
        seq: i,
        question_id,
        question_kind: i < tournament.n_tossups ? 'tossup' : 'bonus',
      }));
      const fresh = await startTournament(tournament.id, questions);
      onUpdate(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to start');
    } finally {
      setBusy(false);
    }
  };

  if (!signedIn) {
    return (
      <Sheet title="Sign in to play">
        <p className="tiny muted">
          You can watch the roster here, but joining needs an account. Sign in
          from Settings.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet title="Controls">
      {!isPlayer ? (
        <>
          <Field label="your team (optional)">
            <TextInput
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              maxLength={40}
              placeholder="leave blank if you're solo"
            />
          </Field>
          <Button variant="primary" block onClick={() => void doJoin()} disabled={busy}>
            {busy ? 'Joining…' : 'Join'}
          </Button>
        </>
      ) : null}
      {isCreator ? (
        <Button
          variant="primary"
          block
          onClick={() => void doStart()}
          disabled={busy}
        >
          {busy
            ? 'Starting…'
            : `Start now (${tournament.n_tossups + tournament.n_bonuses} questions)`}
        </Button>
      ) : null}
      {error ? <p className="banner banner--warn">{error}</p> : null}
    </Sheet>
  );
}

/**
 * Pulls `n` tossup ids from the live queue. The bonus-format tournament still
 * uses tossup ids here; bonuses need a separate client-side fetch path that is
 * out of scope for this task and is called out in NOTES.md.
 */
async function pickQuestionIds(
  filters: ReturnType<typeof filtersFrom>,
  n: number,
): Promise<string[]> {
  const queue = new TossupQueue(filters);
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = await queue.next();
    if (!t) break;
    ids.push(t.id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Running-state play view
// ---------------------------------------------------------------------------

function PlayView({
  tournament,
  onExit,
}: {
  tournament: TournamentDetailData;
  onExit(): void;
}) {
  const onProtest = useCallback(
    async (payload: TossupProtestPayload) => {
      await fileProtest(tournament.id, {
        question_id: payload.questionId,
        reason: payload.reason,
        given_answer: payload.givenAnswer,
      });
    },
    [tournament.id],
  );
  return <Tossup onExit={onExit} onProtest={onProtest} />;
}

// ---------------------------------------------------------------------------
// Shared header
// ---------------------------------------------------------------------------

function Screen({
  title,
  onExit,
  children,
}: {
  title: string;
  onExit(): void;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">{title}</h1>
        <div className="topbar__right">
          <Button variant="ghost" small onClick={onExit}>
            Back
          </Button>
        </div>
      </header>
      <div className="app__body">{children}</div>
    </>
  );
}
