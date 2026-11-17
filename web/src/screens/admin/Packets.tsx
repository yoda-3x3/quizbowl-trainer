/**
 * Admin Packets tab — placeholder shell.
 *
 * Packet import is still client-side (see web/NOTES.md); the real tab lands in
 * the "Admin tabs" commit and will surface the server note when nothing is
 * persisted server-side.
 */

import { Sheet } from '../../ui';

export default function AdminPackets() {
  return (
    <Sheet title="Packets">
      <p className="tiny muted">Loading in the next change.</p>
    </Sheet>
  );
}
