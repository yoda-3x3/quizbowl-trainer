/**
 * Admin Rooms tab.
 *
 * The server does not enumerate live Durable Objects today, so this tab
 * primarily surfaces the server's `note` and offers a Close control that,
 * for now, posts to a 501 stub. See web/NOTES.md for the follow-up.
 */

import { useState } from 'react';
import { Button, Field, Sheet, TextInput } from '../../ui';
import { closeAdminRoom, useAdminRooms } from '../../admin';

export default function AdminRooms() {
  const list = useAdminRooms();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const close = async () => {
    const trimmed = code.trim();
    if (trimmed.length === 0) return;
    setPending(true);
    setNotice(null);
    try {
      await closeAdminRoom(trimmed);
      setNotice(`sent close request to ${trimmed}`);
      await list.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'close failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      title="Rooms"
      aside={
        <Button variant="ghost" small onClick={() => void list.refresh()}>
          Refresh
        </Button>
      }
    >
      {list.loading ? (
        <p className="tiny muted">loading</p>
      ) : list.error ? (
        <p className="banner banner--warn">{list.error}</p>
      ) : (
        <>
          {list.data?.note ? (
            <p className="banner banner--warn">{list.data.note}</p>
          ) : null}
          {list.data && list.data.rooms.length > 0 ? (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {list.data.rooms.map((r) => (
                <li key={r.code}>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      padding: '8px 10px',
                      border: '1px solid var(--line)',
                      borderRadius: 6,
                      background: 'var(--surface-2, var(--panel-2))',
                    }}
                  >
                    <strong style={{ flex: 1 }}>{r.code}</strong>
                    <span className="tiny muted">
                      {r.player_count} player{r.player_count === 1 ? '' : 's'}
                    </span>
                    <Button
                      small
                      variant="danger"
                      disabled={pending}
                      onClick={async () => {
                        setCode(r.code);
                        await close();
                      }}
                    >
                      Close
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tiny muted">no live rooms to list</p>
          )}
        </>
      )}

      <Field label="close a room by code" hint="a 4-character room code">
        <TextInput
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
          placeholder="e.g. AB7K"
        />
      </Field>
      <div className="row">
        <Button
          small
          variant="danger"
          onClick={() => void close()}
          disabled={pending || code.trim().length === 0}
        >
          {pending ? 'Closing…' : 'Close room'}
        </Button>
      </div>
      {notice ? <p className="banner banner--warn">{notice}</p> : null}
    </Sheet>
  );
}
