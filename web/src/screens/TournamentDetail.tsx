/**
 * One tournament: players, state, Join / Start controls, the sequencer that
 * drives Tossup / Bonus while it is running, and the live scoreboard.
 *
 * The picker in `OpenControls` fetches both tossup and bonus ids at Start,
 * matching the stored `question_kind`. The sequencer in `PlayView` walks
 * those pinned rows: a run of tossups mounts a single Tossup backed by a
 * `TossupSource`, and each bonus seq mounts a Bonus backed by a one-shot
 * `BonusSource`. After each resolve the attempt is persisted to the server
 * and the scoreboard refreshes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Field, Sheet, TextInput, filtersFrom, useSettings } from '../ui';
import { useAuth } from '../auth';
import Tossup, {
  type TossupProtestPayload,
  type TossupSource,
} from './Tossup';
import Bonus, { type BonusSource } from './Bonus';
import BracketPanel from './BracketPanel';
import {
  pickQuestionIds,
  publicToBonus,
  publicToTossup,
} from './tournamentSequence';
import {
  fetchScoreboard,
  fetchTournamentQuestion,
  fileProtest,
  joinTournament,
  recordAttempt,
  startTournament,
  useTournament,
  type AttemptDirective,
  type ScoreboardEntry,
  type TournamentDetail as TournamentDetailData,
  type TournamentQuestion,
} from '../tournaments';
import './Tournaments.css';

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

      <BracketPanel
        tournamentId={tournament.id}
        isCreator={isCreator}
        tournamentOpen={tournament.state === 'open'}
      />

      {tournament.state === 'open' ? (
        <OpenControls
          tournament={tournament}
          isCreator={isCreator}
          isPlayer={isPlayer}
          signedIn={me !== null}
          onUpdate={handle.update}
        />
      ) : tournament.state === 'running' && !isPlayer ? (
        <Sheet title="Spectating" aside={<LivePulse />}>
          <p className="tiny muted">
            {me === null
              ? 'Sign in to join future tournaments. You can still watch this one live.'
              : 'This tournament is already running — join is closed, but you can follow the live standings below.'}
          </p>
        </Sheet>
      ) : null}

      {tournament.state === 'running' || tournament.state === 'finished' ? (
        <LiveScoreboard
          tournamentId={tournament.id}
          meId={me?.id ?? null}
          isPlayer={isPlayer}
          live={tournament.state === 'running'}
        />
      ) : null}

      {tournament.state === 'running' && !isPlayer ? (
        <PredictionsSheet tournament={tournament} />
      ) : null}

      {tournament.state === 'cancelled' ? (
        <Sheet title="Cancelled">
          <p className="tiny muted">This tournament was cancelled.</p>
        </Sheet>
      ) : null}
    </Screen>
  );
}

function LiveScoreboard({
  tournamentId,
  meId,
  isPlayer,
  live,
}: {
  tournamentId: number;
  meId: number | null;
  isPlayer: boolean;
  live: boolean;
}) {
  const [scoreboard, setScoreboard] = useState<ScoreboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setScoreboard(await fetchScoreboard(tournamentId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load');
    }
  }, [tournamentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Auto-refresh while the tournament is live so spectators do not need to
  // tap. Players running questions don't need this: the PlayView already
  // triggers a refresh after every attempt.
  useEffect(() => {
    if (!live || isPlayer) return;
    const handle = window.setInterval(() => void refresh(), 10000);
    return () => window.clearInterval(handle);
  }, [live, isPlayer, refresh]);

  if (error) {
    return (
      <Sheet title="Standings">
        <p className="banner banner--warn">{error}</p>
      </Sheet>
    );
  }
  if (!scoreboard) {
    return (
      <Sheet title="Standings">
        <p className="tiny muted">loading</p>
      </Sheet>
    );
  }
  return <StandingsSheet scoreboard={scoreboard} meId={meId} live={live} />;
}

/**
 * The live bracket-style standings board. Two modes share one sheet:
 *   - During a running tournament it polls for refreshes and shows a
 *     pulsing LIVE dot in the header.
 *   - After a tournament finishes it just shows the final order.
 * Top three places pick up gold/silver/bronze rank colours.
 */
function StandingsSheet({
  scoreboard,
  meId,
  live,
}: {
  scoreboard: ScoreboardEntry[];
  meId: number | null;
  live: boolean;
}) {
  return (
    <Sheet
      title="Standings"
      aside={live ? <LivePulse /> : <span className="tiny muted">Final</span>}
    >
      {scoreboard.length === 0 ? (
        <p className="standings__empty">
          No points scored yet — the first buzz will show up here.
        </p>
      ) : (
        <ol className="standings" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {scoreboard.map((e, i) => {
            const rank = i + 1;
            const medal =
              rank === 1
                ? 'gold'
                : rank === 2
                  ? 'silver'
                  : rank === 3
                    ? 'bronze'
                    : '';
            return (
              <li
                key={e.user_id}
                className={[
                  'standings__row',
                  medal ? `standings__row--${medal}` : '',
                  e.user_id === meId ? 'standings__row--me' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="standings__rank">{rank}</span>
                <span className="standings__name">
                  <strong>{e.username}</strong>
                  {e.team ? (
                    <span className="standings__team">{e.team}</span>
                  ) : null}
                </span>
                <span className="standings__pts">
                  {e.points}
                  {e.restitution_delta !== 0 ? (
                    <small>
                      {e.base_points >= 0 ? '+' : ''}
                      {e.base_points}
                      {e.restitution_delta >= 0 ? ' +' : ' '}
                      {e.restitution_delta}
                    </small>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Sheet>
  );
}

/** Tiny animated LIVE indicator, used as the Sheet aside while polling. */
function LivePulse() {
  return (
    <span className="standings__live">
      <span className="standings__live__dot" aria-hidden />
      Live
    </span>
  );
}

/**
 * Predictions placeholder — the ranked-system hook is not live yet, so
 * this sheet shows what the surface will become. Rendering it on the
 * spectator path (not for players, who are too busy) foreshadows the
 * feature without pretending it works.
 */
function PredictionsSheet({
  tournament,
}: {
  tournament: TournamentDetailData;
}) {
  const top = tournament.players.slice(0, 3);
  return (
    <Sheet
      title="Predictions"
      aside={<span className="tiny muted">Preview</span>}
    >
      <div className="predictions">
        {top.length === 0 ? (
          <p className="predictions__footnote">
            Predictions will appear once players join.
          </p>
        ) : (
          top.map((p, i) => (
            <div key={p.user_id} className="predictions__row">
              <span>
                {i + 1}. {p.username}
                {p.team ? ` · ${p.team}` : ''}
              </span>
              <span className="pts">— rating</span>
            </div>
          ))
        )}
        <p className="predictions__footnote">
          A ranked system is coming. Once ratings go live this card will show
          each player's win-probability and point projection for the rest of
          the match.
        </p>
      </div>
    </Sheet>
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
      const picks = await pickQuestionIds(
        filters,
        tournament.n_tossups,
        tournament.n_bonuses,
      );
      const needed = tournament.n_tossups + tournament.n_bonuses;
      if (picks.length !== needed) {
        throw new Error(
          `could only find ${picks.length} questions; widen filters in Settings`,
        );
      }
      const questions: TournamentQuestion[] = picks.map((p, i) => ({
        seq: i,
        question_id: p.id,
        question_kind: p.kind,
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

// ---------------------------------------------------------------------------
// Running-state play view (sequencer)
// ---------------------------------------------------------------------------

/**
 * Walks the pinned question sequence. For each seq entry the server already
 * knows is a tossup it fetches the resolved question, hands it to a Tossup
 * instance, and records the attempt on resolve. When the next question is a
 * bonus (or we've run out), the sequencer rebuilds with the next seq and
 * mounts the matching screen.
 *
 * The seq cursor and source live here rather than in Tossup so switching
 * between tossup and bonus doesn't need Tossup to know about bonuses.
 */
function PlayView({
  tournament,
  onExit,
}: {
  tournament: TournamentDetailData;
  onExit(): void;
}) {
  const auth = useAuth();
  const me = auth.user;
  const totalSeq = tournament.questions.length;
  const [cursor, setCursor] = useState(0);
  const [scoreboard, setScoreboard] = useState<ScoreboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshScoreboard = useCallback(async () => {
    try {
      setScoreboard(await fetchScoreboard(tournament.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load scoreboard');
    }
  }, [tournament.id]);

  useEffect(() => {
    void refreshScoreboard();
  }, [refreshScoreboard]);

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

  if (totalSeq === 0) {
    return (
      <Screen title={tournament.name} onExit={onExit}>
        <Sheet title="No questions">
          <p className="tiny muted">
            This tournament has no pinned questions.
          </p>
        </Sheet>
      </Screen>
    );
  }

  if (cursor >= totalSeq) {
    return (
      <Screen title={tournament.name} onExit={onExit}>
        <Sheet title="Tournament complete">
          <p className="tiny muted">
            You've finished every pinned question. The scoreboard shows the
            running totals.
          </p>
        </Sheet>
        {scoreboard ? <ScoreboardSheet scoreboard={scoreboard} meId={me?.id ?? null} /> : null}
        {error ? <p className="banner banner--warn">{error}</p> : null}
      </Screen>
    );
  }

  const current = tournament.questions[cursor];
  if (!current) {
    // Defensive: cursor is checked above, but noUncheckedIndexedAccess.
    return (
      <Screen title={tournament.name} onExit={onExit}>
        <p className="tiny muted">loading</p>
      </Screen>
    );
  }

  if (current.question_kind === 'tossup') {
    return (
      <TossupBurst
        key={`burst-${cursor}`}
        tournament={tournament}
        startSeq={cursor}
        onEndAt={(seq) => {
          setCursor(seq);
          void refreshScoreboard();
        }}
        onProtest={onProtest}
        onExit={onExit}
        onAttempt={() => void refreshScoreboard()}
        scoreboard={scoreboard}
        meId={me?.id ?? null}
      />
    );
  }
  return (
    <BonusBurst
      key={`bonus-${cursor}`}
      tournament={tournament}
      seq={cursor}
      onDone={() => {
        setCursor(cursor + 1);
        void refreshScoreboard();
      }}
      onExit={onExit}
      onAttempt={() => void refreshScoreboard()}
      scoreboard={scoreboard}
      meId={me?.id ?? null}
    />
  );
}

function TossupBurst({
  tournament,
  startSeq,
  onEndAt,
  onProtest,
  onExit,
  onAttempt,
  scoreboard,
  meId,
}: {
  tournament: TournamentDetailData;
  startSeq: number;
  onEndAt(nextSeq: number): void;
  onProtest(payload: TossupProtestPayload): Promise<void>;
  onExit(): void;
  onAttempt(): void;
  scoreboard: ScoreboardEntry[] | null;
  meId: number | null;
}) {
  // Walks tournament.questions from `startSeq` for as long as the kind is
  // 'tossup'. When it hits a bonus or the end, the source returns null and
  // Tossup calls onEnd, which bumps the parent's cursor to the stop position.
  const seqRef = useRef(startSeq);

  const source: TossupSource = useMemo(
    () => ({
      async next() {
        while (seqRef.current < tournament.questions.length) {
          const q = tournament.questions[seqRef.current];
          if (!q || q.question_kind !== 'tossup') return null;
          const fetched = await fetchTournamentQuestion(
            tournament.id,
            seqRef.current,
          );
          if (fetched.question_kind !== 'tossup') return null;
          seqRef.current += 1;
          return publicToTossup(fetched.tossup);
        }
        return null;
      },
      onResolved(event) {
        // Attempt to seq corresponds to the question we JUST resolved, which
        // is one before the cursor because next() advanced after yielding.
        const persistedSeq = seqRef.current - 1;
        const persistedQ = tournament.questions[persistedSeq];
        if (!persistedQ) return;
        void recordAttempt(tournament.id, {
          seq: persistedSeq,
          question_id: persistedQ.question_id,
          given_answer: event.givenAnswer,
          directive: (event.directive ?? 'reject') as AttemptDirective,
          points: event.points,
          powered: event.points === 15,
          buzz_word_index: event.buzzWordIndex,
          total_words: event.totalWords,
          power_word_index: event.powerWordIndex,
          ms_to_answer: event.msToAnswer,
        })
          .then(() => onAttempt())
          .catch(() => {
            /* a failed record is non-fatal; the UI continues. */
          });
      },
      onEnd() {
        onEndAt(seqRef.current);
      },
    }),
    [tournament.id, tournament.questions, onEndAt, onAttempt],
  );

  return (
    <>
      <Tossup onExit={onExit} onProtest={onProtest} source={source} />
      {scoreboard ? (
        <div className="app__body">
          <ScoreboardSheet scoreboard={scoreboard} meId={meId} compact />
        </div>
      ) : null}
    </>
  );
}

function BonusBurst({
  tournament,
  seq,
  onDone,
  onExit,
  onAttempt,
  scoreboard,
  meId,
}: {
  tournament: TournamentDetailData;
  seq: number;
  onDone(): void;
  onExit(): void;
  onAttempt(): void;
  scoreboard: ScoreboardEntry[] | null;
  meId: number | null;
}) {
  // One bonus at a time: the source yields exactly one, then null → onEnd →
  // the parent advances.
  const yielded = useRef(false);

  const source: BonusSource = useMemo(
    () => ({
      async next() {
        if (yielded.current) return null;
        yielded.current = true;
        const fetched = await fetchTournamentQuestion(tournament.id, seq);
        if (fetched.question_kind !== 'bonus') return null;
        return publicToBonus(fetched.bonus);
      },
      onResolved(event) {
        void recordAttempt(tournament.id, {
          seq,
          question_id: event.questionId,
          given_answer: event.givenAnswer,
          directive: (event.directive ?? 'reject') as AttemptDirective,
          points: event.points,
          powered: false,
          buzz_word_index: null,
          total_words: event.totalWords,
          power_word_index: null,
          ms_to_answer: null,
        })
          .then(() => onAttempt())
          .catch(() => {
            /* non-fatal */
          });
      },
      onEnd() {
        onDone();
      },
    }),
    [tournament.id, seq, onDone, onAttempt],
  );

  return (
    <>
      <Bonus onExit={onExit} source={source} />
      {scoreboard ? (
        <div className="app__body">
          <ScoreboardSheet scoreboard={scoreboard} meId={meId} compact />
        </div>
      ) : null}
    </>
  );
}

function ScoreboardSheet({
  scoreboard,
  meId,
  compact,
}: {
  scoreboard: ScoreboardEntry[];
  meId: number | null;
  compact?: boolean;
}) {
  return (
    <Sheet title="Scoreboard">
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {scoreboard.map((e) => (
          <li
            key={e.user_id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              fontSize: compact ? 12 : 13,
              fontWeight: e.user_id === meId ? 600 : 400,
            }}
          >
            <span>
              {e.username}
              {e.team ? ` / ${e.team}` : ''}
            </span>
            <span className="nums">
              {e.points}
              {e.restitution_delta !== 0 ? (
                <span className="tiny muted">
                  {' '}
                  ({e.base_points >= 0 ? '+' : ''}
                  {e.base_points}
                  {e.restitution_delta >= 0 ? ' +' : ' '}
                  {e.restitution_delta})
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
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
