/**
 * Admin Protests tab.
 *
 * Lists pending protests by default, with Accept / Reject controls and an
 * optional note field. After the mutation succeeds the row drops out of the
 * pending list on the next refresh. Point restitution is not yet implemented
 * server-side: see web/NOTES.md, point 19.
 */

import { useState } from 'react';
import { Button, Field, Sheet, TextInput } from '../../ui';
import {
  resolveAdminProtest,
  useAdminProtests,
  type AdminProtest,
  type ProtestFilter,
} from '../../admin';

const FILTERS: Array<{ id: ProtestFilter; label: string }> = [
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

export default function AdminProtests() {
  const list = useAdminProtests();
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const resolve = async (
    id: number,
    decision: 'accepted' | 'rejected',
  ) => {
    setPendingId(id);
    setNotice(null);
    try {
      await resolveAdminProtest(id, decision, notes[id]);
      setNotes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await list.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'resolve failed');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Sheet
      title="Protests"
      aside={
        <Button variant="ghost" small onClick={() => void list.refresh()}>
          Refresh
        </Button>
      }
    >
      <div
        className="admin-protests__filters"
        role="tablist"
        aria-label="Protest filter"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}
      >
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={list.filter === f.id}
            onClick={() => list.setFilter(f.id)}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: '1px solid var(--line)',
              background:
                list.filter === f.id
                  ? 'var(--accent, var(--surface-2, var(--panel-2)))'
                  : 'var(--surface-2, var(--panel-2))',
              color: 'var(--ink)',
              fontWeight: list.filter === f.id ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {notice ? <p className="banner banner--warn">{notice}</p> : null}

      {list.loading ? (
        <p className="tiny muted">loading</p>
      ) : list.error ? (
        <p className="banner banner--warn">{list.error}</p>
      ) : !list.data || list.data.length === 0 ? (
        <p className="tiny muted">
          {list.filter === 'pending' ? 'no pending protests' : 'no protests here'}
        </p>
      ) : (
        <ul
          className="admin-protests__list"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {list.data.map((p) => (
            <li key={p.id}>
              <ProtestRow
                protest={p}
                note={notes[p.id] ?? ''}
                busy={pendingId === p.id}
                onNoteChange={(v) =>
                  setNotes((prev) => ({ ...prev, [p.id]: v }))
                }
                onAccept={() => void resolve(p.id, 'accepted')}
                onReject={() => void resolve(p.id, 'rejected')}
              />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function ProtestRow({
  protest,
  note,
  busy,
  onNoteChange,
  onAccept,
  onReject,
}: {
  protest: AdminProtest;
  note: string;
  busy: boolean;
  onNoteChange(v: string): void;
  onAccept(): void;
  onReject(): void;
}) {
  const resolved = protest.state !== 'pending';
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--line)',
        borderRadius: 6,
        background: 'var(--surface-2, var(--panel-2))',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
      >
        <strong>{protest.tournament_name || `tournament ${protest.tournament_id}`}</strong>
        <span className="tiny muted">#{protest.id} / {protest.state}</span>
      </div>
      <div className="tiny muted">
        raised by {protest.raised_by_username || `user ${protest.raised_by}`} / question {protest.question_id}
      </div>
      {protest.given_answer ? (
        <div className="tiny">
          <span className="muted">given answer:</span> {protest.given_answer}
        </div>
      ) : null}
      <div className="tiny">{protest.reason}</div>
      {protest.resolved_note ? (
        <div className="tiny muted">note: {protest.resolved_note}</div>
      ) : null}
      {!resolved ? (
        <>
          <Field label="note (optional)">
            <TextInput
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              maxLength={1000}
              placeholder="shown next to the resolution"
            />
          </Field>
          <div className="row">
            <Button
              small
              variant="primary"
              disabled={busy}
              onClick={onAccept}
            >
              Accept
            </Button>
            <Button
              small
              variant="danger"
              disabled={busy}
              onClick={onReject}
            >
              Reject
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
