/**
 * Tournaments hub: list grouped by role (Register / Watch / Finished),
 * create one, or open one for detail.
 *
 * The grouping by state is what gives the page its shape: an open tournament
 * wants a join button, a running one wants a watch-with-standings surface,
 * and a finished one wants a results view. Everyone — signed in or not —
 * can watch a running tournament; joining still requires an account.
 */

import { useMemo, useState, type FormEvent } from 'react';
import { Button, Field, Sheet, TextInput } from '../ui';
import { useAuth } from '../auth';
import {
  createTournament,
  useTournamentList,
  type TournamentFormat,
  type TournamentState,
  type TournamentSummary,
} from '../tournaments';
import TournamentDetail from './TournamentDetail';
import QuickPlay from './QuickPlay';
import './Tournaments.css';

type GroupKey = 'open' | 'running' | 'finished';

const GROUPS: { key: GroupKey; title: string; empty: string }[] = [
  { key: 'open', title: 'Register', empty: 'No tournaments are accepting players right now.' },
  { key: 'running', title: 'Watch live', empty: 'No tournaments are running right now.' },
  { key: 'finished', title: 'Finished', empty: 'No tournaments have finished yet.' },
];

// Fold cancelled tournaments into the finished column: both are terminal and
// neither takes new players, and callers of the detail view handle both.
function groupFor(state: TournamentState): GroupKey {
  if (state === 'open') return 'open';
  if (state === 'running') return 'running';
  return 'finished';
}

export default function Tournaments() {
  const auth = useAuth();
  const list = useTournamentList();
  const [openId, setOpenId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showQuickPlay, setShowQuickPlay] = useState(false);

  const byState = useMemo(() => {
    const out: Record<GroupKey, TournamentSummary[]> = {
      open: [],
      running: [],
      finished: [],
    };
    for (const t of list.tournaments) {
      out[groupFor(t.state)].push(t);
    }
    return out;
  }, [list.tournaments]);

  if (openId !== null) {
    return (
      <TournamentDetail
        id={openId}
        onExit={() => {
          setOpenId(null);
          void list.refresh();
        }}
      />
    );
  }

  if (showQuickPlay) {
    return <QuickPlay onExit={() => setShowQuickPlay(false)} />;
  }

  const canCreate = auth.user !== null;

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">Tournaments</h1>
        <div className="topbar__right">
          <Button variant="ghost" small onClick={() => void list.refresh()}>
            Refresh
          </Button>
        </div>
      </header>

      <div className="app__body">
        {canCreate ? (
          <Button variant="primary" block onClick={() => setShowQuickPlay(true)}>
            Quick Play
          </Button>
        ) : null}

        {canCreate ? (
          <Button
            variant="primary"
            block
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? 'Cancel' : 'Create a tournament'}
          </Button>
        ) : (
          <Sheet title="Sign in to host">
            <p className="tiny muted">
              Hosting and joining need an account. You can still watch a
              running tournament. Sign in from Settings.
            </p>
          </Sheet>
        )}

        {showCreate && canCreate ? (
          <CreateForm
            onDone={async () => {
              setShowCreate(false);
              await list.refresh();
            }}
            onCancel={() => setShowCreate(false)}
          />
        ) : null}

        {list.loading && list.tournaments.length === 0 ? (
          <Sheet>
            <p className="tiny muted">loading</p>
          </Sheet>
        ) : list.error ? (
          <Sheet>
            <p className="banner banner--warn">{list.error}</p>
          </Sheet>
        ) : (
          GROUPS.map((g) => (
            <Sheet key={g.key} title={g.title}>
              <TournamentGroup
                items={byState[g.key]}
                empty={g.empty}
                onOpen={setOpenId}
              />
            </Sheet>
          ))
        )}
      </div>
    </>
  );
}

function TournamentGroup({
  items,
  empty,
  onOpen,
}: {
  items: TournamentSummary[];
  empty: string;
  onOpen(id: number): void;
}) {
  if (items.length === 0) {
    return <p className="tourney-group__empty">{empty}</p>;
  }
  return (
    <div className="tourney-group">
      {items.map((t) => (
        <TournamentCard key={t.id} t={t} onOpen={() => onOpen(t.id)} />
      ))}
    </div>
  );
}

function TournamentCard({
  t,
  onOpen,
}: {
  t: TournamentSummary;
  onOpen(): void;
}) {
  const stateLabel =
    t.state === 'open'
      ? 'Open'
      : t.state === 'running'
        ? 'Live'
        : t.state === 'cancelled'
          ? 'Cancelled'
          : 'Final';
  const stateClass = groupFor(t.state);
  return (
    <button type="button" className="tourney-card" onClick={onOpen}>
      <div className="tourney-card__body">
        <span className="tourney-card__title">{t.name}</span>
        <span className="tourney-card__meta">
          host {t.creator_username} · {t.n_tossups} tossups
          {t.n_bonuses > 0 ? ` + ${t.n_bonuses} bonuses` : ''} ·{' '}
          {t.player_count} player{t.player_count === 1 ? '' : 's'}
        </span>
      </div>
      <span className={`tourney-card__state tourney-card__state--${stateClass}`}>
        {stateLabel}
      </span>
    </button>
  );
}

function CreateForm({
  onDone,
  onCancel,
}: {
  onDone(): void | Promise<void>;
  onCancel(): void;
}) {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('tossups');
  const [nTossups, setNTossups] = useState(10);
  const [team, setTeam] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createTournament({
        name: name.trim(),
        format,
        n_tossups: nTossups,
        team: team.trim(),
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    name.trim().length > 0 &&
    nTossups >= 1 &&
    nTossups <= 50 &&
    !submitting;

  return (
    <Sheet
      title="New tournament"
      aside={
        <Button variant="ghost" small onClick={onCancel} disabled={submitting}>
          Close
        </Button>
      }
    >
      <form onSubmit={submit}>
        <Field label="name">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
          />
        </Field>
        <Field label="format">
          <select
            className="field__input"
            value={format}
            onChange={(e) => setFormat(e.target.value as TournamentFormat)}
          >
            <option value="tossups">tossups only</option>
            <option value="tossups_bonuses">tossups and bonuses</option>
          </select>
        </Field>
        <Field label="tossups" value={String(nTossups)}>
          <input
            type="range"
            className="field__range"
            min={1}
            max={50}
            step={1}
            value={nTossups}
            onChange={(e) => setNTossups(Number(e.target.value))}
          />
        </Field>
        <Field label="your team (optional)">
          <TextInput
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            maxLength={40}
            placeholder="leave blank if you're solo"
          />
        </Field>
        {error ? <p className="banner banner--warn">{error}</p> : null}
        <Button variant="primary" type="submit" block disabled={!canSubmit}>
          {submitting ? 'Creating…' : 'Create and join'}
        </Button>
      </form>
    </Sheet>
  );
}
