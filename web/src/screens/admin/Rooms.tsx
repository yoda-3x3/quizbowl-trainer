/**
 * Admin Rooms tab.
 *
 * Lists live rooms from `GET /api/admin/rooms` with per-row Close buttons.
 * Polls every five seconds while the document is visible so an admin
 * watching a room empty out sees it drop from the list without manual
 * refresh; polling pauses when the tab is hidden so a backgrounded
 * dashboard does not bombard the worker.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Sheet } from '../../ui';
import { closeAdminRoom, useAdminRooms } from '../../admin';

const POLL_MS = 5000;

/** Short, dependency-free relative-time formatter: "12s ago", "3m ago", etc. */
function relative(now: number, then: number): string {
  const d = Math.max(0, Math.floor((now - then) / 1000));
  if (d < 60) return `${d}s ago`;
  const m = Math.floor(d / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export default function AdminRooms() {
  const list = useAdminRooms();
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Refresh handle stays stable across re-renders so the polling effect
  // does not reset its interval every tick.
  const refreshRef = useRef(list.refresh);
  refreshRef.current = list.refresh;

  // Poll every 5s while the tab is visible. Any hidden->visible transition
  // kicks off an immediate refresh so the list matches reality on re-focus.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let id: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      setNow(Date.now());
      void refreshRef.current();
    };
    const start = () => {
      if (id !== null) return;
      id = setInterval(tick, POLL_MS);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        tick();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const close = useCallback(
    async (id: string) => {
      if (
        typeof window !== 'undefined' &&
        !window.confirm(`Close room ${id}? Every connected client will be kicked.`)
      ) {
        return;
      }
      setPending(id);
      setNotice(null);
      try {
        await closeAdminRoom(id);
        setNotice(`sent close request to ${id}`);
        await list.refresh();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'close failed');
      } finally {
        setPending(null);
      }
    },
    [list],
  );

  return (
    <Sheet
      title="Rooms"
      aside={
        <Button variant="ghost" small onClick={() => void list.refresh()}>
          Refresh
        </Button>
      }
    >
      {list.loading && !list.data ? (
        <p className="tiny muted">loading</p>
      ) : list.error ? (
        <p className="banner banner--warn">{list.error}</p>
      ) : list.data && list.data.rooms.length > 0 ? (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.9em',
          }}
        >
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
              <th style={{ padding: '6px 8px' }}>id</th>
              <th style={{ padding: '6px 8px' }}>created</th>
              <th style={{ padding: '6px 8px' }}>players</th>
              <th style={{ padding: '6px 8px' }}>last seen</th>
              <th style={{ padding: '6px 8px' }} />
            </tr>
          </thead>
          <tbody>
            {list.data.rooms.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>
                  <strong>{r.id}</strong>
                </td>
                <td style={{ padding: '6px 8px' }} className="tiny muted">
                  {relative(now, r.created_at)}
                </td>
                <td style={{ padding: '6px 8px' }}>{r.player_count}</td>
                <td style={{ padding: '6px 8px' }} className="tiny muted">
                  {relative(now, r.last_seen)}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  <Button
                    small
                    variant="danger"
                    disabled={pending === r.id}
                    onClick={() => void close(r.id)}
                  >
                    {pending === r.id ? 'Closing…' : 'Close'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="tiny muted">no live rooms right now</p>
      )}
      {notice ? <p className="banner banner--warn">{notice}</p> : null}
    </Sheet>
  );
}
