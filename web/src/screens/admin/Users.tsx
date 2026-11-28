/**
 * Admin Users tab.
 *
 * Search by substring, paginate the result, and act on each row: flip role,
 * ban or unban. Every action calls back into the server; this screen does
 * not keep its own copy of the list, so a refresh after the mutation shows
 * the authoritative state.
 */

import { useEffect, useState } from 'react';
import { Button, Field, Sheet, TextInput } from '../../ui';
import {
  banUser,
  setUserRole,
  unbanUser,
  useAdminUsers,
  type AdminUser,
} from '../../admin';
import { fetchRating, setUserElo, type RatingPublic } from '../../rank';
import RankBadge from '../../RankBadge';
import { useAuth } from '../../auth';

export default function AdminUsers() {
  const auth = useAuth();
  const list = useAdminUsers();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (userId: number, fn: () => Promise<unknown>) => {
    setPendingId(userId);
    setNotice(null);
    try {
      await fn();
      await list.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'action failed');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Sheet
      title="Users"
      aside={
        <Button variant="ghost" small onClick={() => void list.refresh()}>
          Refresh
        </Button>
      }
    >
      <Field label="search">
        <TextInput
          value={list.query}
          onChange={(e) => list.setQuery(e.target.value)}
          placeholder="username substring"
        />
      </Field>

      {notice ? <p className="banner banner--warn">{notice}</p> : null}

      {list.loading ? (
        <p className="tiny muted">loading</p>
      ) : list.error ? (
        <p className="banner banner--warn">{list.error}</p>
      ) : !list.data || list.data.users.length === 0 ? (
        <p className="tiny muted">no users match</p>
      ) : (
        <ul
          className="admin-users__list"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {list.data.users.map((u) => (
            <li key={u.id}>
              <UserRow
                user={u}
                self={auth.user?.id === u.id}
                busy={pendingId === u.id}
                onRoleChange={(role) => run(u.id, () => setUserRole(u.id, role))}
                onBan={() => run(u.id, () => banUser(u.id))}
                onUnban={() => run(u.id, () => unbanUser(u.id))}
              />
            </li>
          ))}
        </ul>
      )}

      {list.data && list.data.pageCount > 1 ? (
        <div
          className="admin-users__pager"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
          }}
        >
          <Button
            small
            variant="ghost"
            disabled={list.page <= 1}
            onClick={() => list.setPage(Math.max(1, list.page - 1))}
          >
            Prev
          </Button>
          <span className="tiny muted">
            page {list.page} of {list.data.pageCount}
          </span>
          <Button
            small
            variant="ghost"
            disabled={list.page >= list.data.pageCount}
            onClick={() => list.setPage(list.page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}

function UserRow({
  user,
  self,
  busy,
  onRoleChange,
  onBan,
  onUnban,
}: {
  user: AdminUser;
  self: boolean;
  busy: boolean;
  onRoleChange(role: 'user' | 'admin'): void;
  onBan(): void;
  onUnban(): void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: '8px 10px',
        border: '1px solid var(--line)',
        borderRadius: 6,
        background: 'var(--surface-2, var(--panel-2))',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div>
          <strong>{user.username}</strong>
          {self ? <span className="tiny muted"> (you)</span> : null}
        </div>
        <div className="tiny muted">
          id {user.id}
          {user.banned_at != null ? ' / banned' : ''}
        </div>
      </div>
      <label className="tiny muted" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        role
        <select
          className="field__input"
          value={user.role}
          disabled={busy}
          onChange={(e) => onRoleChange(e.target.value as 'user' | 'admin')}
          style={{ padding: '2px 4px', width: 'auto' }}
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
      </label>
      <RankEditor userId={user.id} disabled={busy} />
      {user.banned_at != null ? (
        <Button small variant="ghost" disabled={busy} onClick={onUnban}>
          Unban
        </Button>
      ) : (
        <Button
          small
          variant="danger"
          disabled={busy || self}
          onClick={onBan}
        >
          Ban
        </Button>
      )}
    </div>
  );
}

/**
 * Shows the user's current rank (e.g. "Knight 3 · 950 ELO") and lets an admin
 * overwrite the ELO directly — a correction tool for a wrong-looking rank,
 * not a way to fabricate match history, so it only ever touches `elo`.
 * Fetches lazily per row rather than batching: the Users list is already
 * paginated to a handful of rows, and this keeps the server-side shape
 * (`AdminUser` has no rating fields) untouched.
 */
function RankEditor({ userId, disabled }: { userId: number; disabled: boolean }) {
  const [rating, setRating] = useState<RatingPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRating(userId)
      .then((r) => {
        if (!cancelled) setRating(r);
      })
      .catch(() => {
        if (!cancelled) setRating(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <span className="tiny muted">rank: …</span>;

  if (editing) {
    return (
      <form
        className="tiny muted"
        style={{ display: 'flex', gap: 4, alignItems: 'center' }}
        onSubmit={async (e) => {
          e.preventDefault();
          const elo = Number(draft);
          if (!Number.isFinite(elo)) {
            setError('elo must be a number');
            return;
          }
          setSaving(true);
          setError(null);
          try {
            setRating(await setUserElo(userId, elo));
            setEditing(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'failed to save');
          } finally {
            setSaving(false);
          }
        }}
      >
        elo
        <input
          className="field__input"
          type="number"
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          style={{ padding: '2px 4px', width: 70 }}
        />
        <Button small type="submit" disabled={saving}>
          Save
        </Button>
        <Button
          small
          variant="ghost"
          type="button"
          disabled={saving}
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
        {error ? <span style={{ color: '#8a1f11' }}>{error}</span> : null}
      </form>
    );
  }

  return (
    <span className="tiny muted" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {rating ? (
        <>
          <RankBadge rating={rating} variant="compact" plain />
          {` · ${rating.elo} ELO`}
        </>
      ) : (
        'rank unrated'
      )}
      <Button
        small
        variant="ghost"
        disabled={disabled}
        onClick={() => {
          setDraft(String(rating?.elo ?? 400));
          setEditing(true);
        }}
      >
        Edit
      </Button>
    </span>
  );
}
