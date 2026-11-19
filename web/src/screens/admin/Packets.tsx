/**
 * Admin Packets tab.
 *
 * Lists packets uploaded through /api/packets so an admin can remove any of
 * them, and exposes a qbreader.org fetcher so an admin can seed sets without
 * leaving the browser. The server-side note from the old stub is still
 * rendered when the server sends one, so an older deployment keeps working.
 */

import { useState } from 'react';
import { Button, Sheet } from '../../ui';
import { removeAdminPacket, useAdminPackets } from '../../admin';
import { uploadServerPacket } from '../../packets';
import {
  fetchQbreaderNumPackets,
  fetchQbreaderPacket,
  qbreaderPacketName,
} from '../../qbreader-import';

const FETCH_GAP_MS = 400;

function QbreaderFetcher({ onDone }: { onDone: () => void }) {
  const [setName, setSetName] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [existingNames, setExistingNames] = useState<Set<string> | null>(null);

  const push = (line: string) => setLog((lines) => [...lines, line]);

  async function run() {
    const name = setName.trim();
    if (!name) return;
    setBusy(true);
    setLog([`Starting ${name}…`]);
    try {
      // Snapshot existing names once so we skip duplicates mid-run.
      if (!existingNames) {
        const res = await fetch('/api/packets', { credentials: 'same-origin' });
        if (res.ok) {
          const body = (await res.json()) as { packets?: { name: string }[] };
          setExistingNames(new Set((body.packets ?? []).map((p) => p.name)));
        }
      }
      const num = await fetchQbreaderNumPackets(name);
      push(`${num} packets to walk.`);
      let up = 0;
      let skip = 0;
      let fail = 0;
      for (let n = 1; n <= num; n++) {
        const packetName = qbreaderPacketName(name, n);
        if (existingNames?.has(packetName)) {
          skip++;
          continue;
        }
        try {
          const data = await fetchQbreaderPacket(name, n);
          if ((data.tossups?.length ?? 0) + (data.bonuses?.length ?? 0) === 0) {
            skip++;
            continue;
          }
          await uploadServerPacket(packetName, data);
          existingNames?.add(packetName);
          up++;
          push(`✓ ${packetName}`);
        } catch (e) {
          fail++;
          push(`✗ ${packetName}: ${e instanceof Error ? e.message : String(e)}`);
        }
        await new Promise((r) => setTimeout(r, FETCH_GAP_MS));
      }
      push(`Done. uploaded=${up} skipped=${skip} failed=${fail}`);
      onDone();
    } catch (e) {
      push(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--line)',
        borderRadius: 6,
        background: 'var(--surface-2, var(--panel-2))',
        marginBottom: 12,
      }}
    >
      <div className="tiny muted" style={{ marginBottom: 6 }}>
        Fetch a whole set from qbreader.org and upload every packet. Skips any
        packet whose name already exists.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="e.g. 2024 ACF Fall"
          value={setName}
          onChange={(e) => setSetName(e.target.value)}
          disabled={busy}
          style={{
            flex: 1,
            padding: '6px 8px',
            background: 'var(--panel)',
            color: 'var(--text)',
            border: '1px solid var(--line)',
            borderRadius: 4,
          }}
        />
        <Button small onClick={() => void run()} disabled={busy || !setName.trim()}>
          {busy ? 'Fetching…' : 'Fetch & upload'}
        </Button>
      </div>
      {log.length > 0 ? (
        <pre
          className="tiny muted"
          style={{
            marginTop: 8,
            maxHeight: 180,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {log.join('\n')}
        </pre>
      ) : null}
    </div>
  );
}

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
      <QbreaderFetcher onDone={() => void list.refresh()} />
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
