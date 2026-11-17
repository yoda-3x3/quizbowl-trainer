/**
 * Tournaments hub: list open and running tournaments, create one, or open one
 * for detail. Hosting and joining require a signed-in account; browsing the
 * list does not, so anyone can see what is on.
 *
 * Creating opens an inline sheet rather than a separate screen; the project
 * settles on sheets for short forms.
 */

import { useState, type FormEvent } from 'react';
import { Button, Field, Sheet, TextInput } from '../ui';
import { useAuth } from '../auth';
import {
  createTournament,
  useTournamentList,
  type TournamentFormat,
  type TournamentSummary,
} from '../tournaments';
import TournamentDetail from './TournamentDetail';

export default function Tournaments() {
  const auth = useAuth();
  const list = useTournamentList();
  const [openId, setOpenId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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
              Hosting and joining a tournament need an account. Browsing the
              list does not. Sign in from Settings.
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

        <Sheet title="Open and running">
          {list.loading ? (
            <p className="tiny muted">loading</p>
          ) : list.error ? (
            <p className="banner banner--warn">{list.error}</p>
          ) : list.tournaments.length === 0 ? (
            <p className="tiny muted">
              No tournaments yet.
              {canCreate ? ' Start one with the button above.' : ''}
            </p>
          ) : (
            <ul className="tournaments__list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {list.tournaments.map((t) => (
                <li key={t.id}>
                  <TournamentCard t={t} onOpen={() => setOpenId(t.id)} />
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      </div>
    </>
  );
}

function TournamentCard({
  t,
  onOpen,
}: {
  t: TournamentSummary;
  onOpen(): void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        background: 'var(--surface-2, var(--panel-2))',
        border: '1px solid var(--line)',
        borderRadius: 6,
        color: 'var(--ink)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{t.name}</strong>
        <span className="tiny muted">{t.state}</span>
      </div>
      <div className="tiny muted">
        host {t.creator_username} / {t.n_tossups} tossups
        {t.n_bonuses > 0 ? ` + ${t.n_bonuses} bonuses` : ''} /{' '}
        {t.player_count} player{t.player_count === 1 ? '' : 's'}
      </div>
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
