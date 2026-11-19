/**
 * Admin Packets tab.
 *
 * Lists packets uploaded through /api/packets so an admin can remove any of
 * them. The server-side note from the old stub is still rendered when the
 * server sends one, so an older deployment keeps working.
 */

import { Button, Sheet } from '../../ui';
import { removeAdminPacket, useAdminPackets } from '../../admin';

export default function AdminPackets() {
  const list = useAdminPackets();

  const remove = async (id: string) => {
    try {
      await removeAdminPacket(id);
      await list.refresh();
    } catch {
      // Swallow: the list refresh will show whether removal succeeded, and
      // an older 404-stub server still produces this path for unknown ids.
    }
  };

  return (
    <Sheet
      title="Packets"
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
          {list.data && list.data.packets.length > 0 ? (
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
              {list.data.packets.map((p) => (
                <li key={p.id}>
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
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{p.name}</strong>
                      <div className="tiny muted">
                        {p.tossup_count} tossups, {p.bonus_count} bonuses
                        {p.uploader_name ? ` — ${p.uploader_name}` : ''}
                      </div>
                    </div>
                    <Button
                      small
                      variant="danger"
                      onClick={() => void remove(p.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tiny muted">no packets to manage server-side</p>
          )}
        </>
      )}
    </Sheet>
  );
}
