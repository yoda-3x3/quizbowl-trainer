/**
 * Admin dashboard shell.
 *
 * Not a tab: this screen is reached only from a link in the Settings "Account"
 * block or with the keyboard shortcut `A`, and only when the signed-in user's
 * role is `admin`. Non-admins see a short explanation instead of the four-tab
 * body; signed-out viewers see a sign-in nudge. Every admin endpoint is
 * guarded again on the server, so this client-side gate is a UX affordance,
 * not the security boundary.
 *
 * The screen hosts four sub-sections — Users, Rooms, Packets, Protests — in a
 * local tab row, picked small on purpose so the admin can scan at a glance
 * without leaving the dashboard.
 */

import { useState } from 'react';
import { Button, Sheet } from '../ui';
import { useAuth } from '../auth';
import AdminUsers from './admin/Users';
import AdminRooms from './admin/Rooms';
import AdminPackets from './admin/Packets';
import AdminProtests from './admin/Protests';
import '../admin.css';

export type AdminTab = 'users' | 'rooms' | 'packets' | 'protests';

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: 'users', label: 'Users' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'packets', label: 'Packets' },
  { id: 'protests', label: 'Protests' },
];

export interface AdminProps {
  onExit?(): void;
}

export default function Admin({ onExit }: AdminProps) {
  const auth = useAuth();
  const [tab, setTab] = useState<AdminTab>('users');

  const gated = auth.loading || !auth.user || auth.user.role !== 'admin';

  return (
    <>
      <header className={gated ? 'topbar' : 'topbar admin-plain'}>
        <h1 className="topbar__title">Admin</h1>
        {onExit ? (
          <div className="topbar__right">
            <Button variant="ghost" small onClick={onExit}>
              Done
            </Button>
          </div>
        ) : null}
      </header>

      <div className="app__body">
        {auth.loading ? (
          <Sheet title="Loading">
            <p className="tiny muted">Checking your account.</p>
          </Sheet>
        ) : !auth.user ? (
          <Sheet title="Sign in to continue">
            <p className="tiny muted">
              This dashboard is only visible to signed-in administrators. Sign
              in from Settings and try again.
            </p>
          </Sheet>
        ) : auth.user.role !== 'admin' ? (
          <Sheet title="Not available">
            <p className="tiny muted">
              This area is for administrators only.
            </p>
          </Sheet>
        ) : (
          <div className="admin-plain">
            <nav
              className="admin-plain__nav"
              role="tablist"
              aria-label="Admin sections"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {tab === 'users' ? <AdminUsers /> : null}
            {tab === 'rooms' ? <AdminRooms /> : null}
            {tab === 'packets' ? <AdminPackets /> : null}
            {tab === 'protests' ? <AdminProtests /> : null}
          </div>
        )}
      </div>
    </>
  );
}
