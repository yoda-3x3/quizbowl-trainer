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

  return (
    <>
      <header className="topbar">
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
          <>
            <nav
              className="admin__tabs"
              role="tablist"
              aria-label="Admin sections"
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 12,
              }}
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 4,
                    border: '1px solid var(--line)',
                    background:
                      tab === t.id
                        ? 'var(--accent, var(--surface-2, var(--panel-2)))'
                        : 'var(--surface-2, var(--panel-2))',
                    color: 'var(--ink)',
                    fontWeight: tab === t.id ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {tab === 'users' ? <AdminUsers /> : null}
            {tab === 'rooms' ? <AdminRooms /> : null}
            {tab === 'packets' ? <AdminPackets /> : null}
            {tab === 'protests' ? <AdminProtests /> : null}
          </>
        )}
      </div>
    </>
  );
}
