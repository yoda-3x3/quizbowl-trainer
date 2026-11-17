/**
 * Render smoke test for the Admin shell.
 *
 * The shell is reached from a Settings link, so these tests server-render in
 * each of the three auth states — loading, signed-out, signed-in non-admin
 * and signed-in admin — and confirm the shell neither fetches on mount nor
 * exposes admin controls to a non-admin viewer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import Admin from '../Admin';
import Settings from '../Settings';
import { __resetAuth, __setAuth } from '../../auth';

afterEach(() => {
  __resetAuth();
  vi.restoreAllMocks();
});

beforeEach(() => {
  __resetAuth();
});

function renderQuietly(el: React.ReactElement): string {
  const original = globalThis.fetch;
  const forbidden = vi.fn(() => {
    throw new Error('this screen must not fetch on mount');
  });
  globalThis.fetch = forbidden as unknown as typeof fetch;
  try {
    const html = renderToString(el);
    expect(forbidden).not.toHaveBeenCalled();
    return html;
  } finally {
    globalThis.fetch = original;
  }
}

describe('Admin shell', () => {
  it('renders a loading card while useAuth has not resolved', () => {
    const html = renderQuietly(createElement(Admin));
    expect(html).toContain('Admin');
    expect(html).toContain('Loading');
  });

  it('shows a sign-in nudge to a signed-out viewer', () => {
    __setAuth({ user: null, loading: false, error: null });
    const html = renderQuietly(createElement(Admin));
    expect(html).toContain('Sign in to continue');
    expect(html).not.toContain('role="tab"');
  });

  it('refuses a signed-in non-admin', () => {
    __setAuth({
      user: { id: 2, username: 'bob', role: 'user' },
      loading: false,
      error: null,
    });
    const html = renderQuietly(createElement(Admin));
    expect(html).toContain('administrators only');
    // Tabs are hidden for a non-admin.
    expect(html).not.toContain('role="tab"');
  });

  it('renders the four-tab row for an admin, starting on Users', () => {
    __setAuth({
      user: { id: 1, username: 'alice', role: 'admin' },
      loading: false,
      error: null,
    });
    const html = renderQuietly(createElement(Admin));
    expect(html).toContain('role="tab"');
    for (const label of ['Users', 'Rooms', 'Packets', 'Protests']) {
      expect(html, label).toContain(label);
    }
  });

  it('shows the Done button when onExit is given', () => {
    __setAuth({
      user: { id: 1, username: 'alice', role: 'admin' },
      loading: false,
      error: null,
    });
    const html = renderQuietly(
      createElement(Admin, { onExit: () => {} }),
    );
    expect(html).toContain('Done');
  });
});

describe('Settings link into Admin', () => {
  it('shows "Admin dashboard" to an admin when onOpenAdmin is given', () => {
    __setAuth({
      user: { id: 1, username: 'alice', role: 'admin' },
      loading: false,
      error: null,
    });
    const html = renderQuietly(
      createElement(Settings, { onOpenAdmin: () => {} }),
    );
    expect(html).toContain('Admin dashboard');
  });

  it('hides the link from a non-admin', () => {
    __setAuth({
      user: { id: 2, username: 'bob', role: 'user' },
      loading: false,
      error: null,
    });
    const html = renderQuietly(
      createElement(Settings, { onOpenAdmin: () => {} }),
    );
    expect(html).not.toContain('Admin dashboard');
  });

  it('hides the link when no onOpenAdmin is given, even to an admin', () => {
    __setAuth({
      user: { id: 1, username: 'alice', role: 'admin' },
      loading: false,
      error: null,
    });
    const html = renderQuietly(createElement(Settings));
    expect(html).not.toContain('Admin dashboard');
  });
});
