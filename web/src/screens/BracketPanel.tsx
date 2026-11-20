/**
 * Bracket mode panel for a tournament's detail page.
 *
 * Shown to everyone once a bracket exists (as a read-only round-by-round
 * tree); the TD additionally gets a "Set up bracket" form while the
 * tournament is still open and a result/confirm control on each ready or
 * awaiting-confirm match. Recording an actual match's result is a stand-in
 * until the H2H match room (a later build step) reports results itself —
 * `recordBracketMatchResult` on the server is written so that module can
 * call it directly instead of only through this form.
 */

import { useState } from 'react';
import { Button, Field, Sheet, TextInput } from '../ui';
import {
  confirmBracketMatch,
  createBracket,
  recordBracketResult,
  useBracket,
  type BracketMatch,
  type SeedingMode,
} from '../brackets';
import './Tournaments.css';

export interface BracketPanelProps {
  tournamentId: number;
  isCreator: boolean;
  tournamentOpen: boolean;
}

export default function BracketPanel({ tournamentId, isCreator, tournamentOpen }: BracketPanelProps) {
  const handle = useBracket(tournamentId);

  if (handle.loading && !handle.bracket) {
    return null;
  }

  if (!handle.bracket) {
    if (!isCreator || !tournamentOpen) return null;
    return <CreateBracketForm tournamentId={tournamentId} onCreated={() => void handle.refresh()} />;
  }

  return (
    <Sheet title="Bracket" aside={<span className="tiny muted">{handle.bracket.seeding_mode} seeding</span>}>
      {handle.error ? <p className="banner banner--warn">{handle.error}</p> : null}
      <div className="bracket">
        {handle.bracket.rounds.map((r) => (
          <div key={r.round} className="bracket__round">
            <div className="bracket__round-title">
              {r.round === handle.bracket!.rounds.length ? 'Final' : `Round ${r.round}`}
            </div>
            {r.matches.map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                tournamentId={tournamentId}
                isCreator={isCreator}
                onChanged={() => void handle.refresh()}
              />
            ))}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function MatchRow({
  match,
  tournamentId,
  isCreator,
  onChanged,
}: {
  match: BracketMatch;
  tournamentId: number;
  isCreator: boolean;
  onChanged(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = (e: BracketMatch['entrant_a']) => (e ? e.label : match.state === 'finished' ? '—' : 'TBD');

  const pickWinner = async (key: string) => {
    setBusy(true);
    setError(null);
    try {
      await recordBracketResult(tournamentId, match.id, key);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to record result');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await confirmBracketMatch(tournamentId, match.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to confirm');
    } finally {
      setBusy(false);
    }
  };

  const canPick = isCreator && match.state === 'ready' && match.entrant_a && match.entrant_b;

  return (
    <div className="bracket__match">
      <div className="bracket__entrant">
        <span className={match.winner_key && match.winner_key === match.entrant_a?.key ? 'bracket__winner' : ''}>
          {label(match.entrant_a)}
        </span>
        {canPick && match.entrant_a ? (
          <Button small variant="ghost" onClick={() => void pickWinner(match.entrant_a!.key)} disabled={busy}>
            Won
          </Button>
        ) : null}
      </div>
      <div className="bracket__vs">vs</div>
      <div className="bracket__entrant">
        <span className={match.winner_key && match.winner_key === match.entrant_b?.key ? 'bracket__winner' : ''}>
          {label(match.entrant_b)}
        </span>
        {canPick && match.entrant_b ? (
          <Button small variant="ghost" onClick={() => void pickWinner(match.entrant_b!.key)} disabled={busy}>
            Won
          </Button>
        ) : null}
      </div>
      {match.state === 'awaiting_confirm' && isCreator ? (
        <Button small variant="primary" onClick={() => void confirm()} disabled={busy}>
          Confirm advance
        </Button>
      ) : (
        <span className="tiny muted bracket__state">
          {match.state === 'awaiting_confirm' ? 'awaiting TD confirm' : match.state}
        </span>
      )}
      {error ? <p className="banner banner--warn">{error}</p> : null}
    </div>
  );
}

const SEEDING_MODES: { value: SeedingMode; label: string }[] = [
  { value: 'random', label: 'Random' },
  { value: 'elo', label: 'ELO (highest seed 1)' },
  { value: 'manual', label: 'Manual (set seed order below)' },
];

function CreateBracketForm({
  tournamentId,
  onCreated,
}: {
  tournamentId: number;
  onCreated(): void;
}) {
  const [seedingMode, setSeedingMode] = useState<SeedingMode>('random');
  const [advanceMode, setAdvanceMode] = useState<'auto' | 'manual'>('auto');
  const [eloMin, setEloMin] = useState('');
  const [eloMax, setEloMax] = useState('');
  const [manualSeeds, setManualSeeds] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await createBracket(tournamentId, {
        seeding_mode: seedingMode,
        advance_mode: advanceMode,
        elo_min: eloMin.trim() ? Number(eloMin) : undefined,
        elo_max: eloMax.trim() ? Number(eloMax) : undefined,
        manual_seeds:
          seedingMode === 'manual'
            ? manualSeeds
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to seed bracket');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Bracket mode">
      <p className="tiny muted">
        Set up a single-elimination bracket from the players who have joined. Byes go to the
        highest seeds automatically. This can only be done once, while the tournament is open.
      </p>
      <Field label="seeding">
        <select
          value={seedingMode}
          onChange={(e) => setSeedingMode(e.target.value as SeedingMode)}
          className="field__input"
        >
          {SEEDING_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
      {seedingMode === 'manual' ? (
        <Field label="seed order (entrant keys, best first, comma-separated)">
          <TextInput
            value={manualSeeds}
            onChange={(e) => setManualSeeds(e.target.value)}
            placeholder="u:12, t:Alpha, u:7"
          />
        </Field>
      ) : null}
      <Field label="advancement">
        <select
          value={advanceMode}
          onChange={(e) => setAdvanceMode(e.target.value as 'auto' | 'manual')}
          className="field__input"
        >
          <option value="auto">Auto-advance winners</option>
          <option value="manual">TD confirms each round</option>
        </select>
      </Field>
      <div className="row">
        <Field label="min ELO (optional)">
          <TextInput value={eloMin} onChange={(e) => setEloMin(e.target.value)} placeholder="none" />
        </Field>
        <Field label="max ELO (optional)">
          <TextInput value={eloMax} onChange={(e) => setEloMax(e.target.value)} placeholder="none" />
        </Field>
      </div>
      <Button variant="primary" block onClick={() => void doCreate()} disabled={busy}>
        {busy ? 'Seeding…' : 'Seed bracket'}
      </Button>
      {error ? <p className="banner banner--warn">{error}</p> : null}
    </Sheet>
  );
}
