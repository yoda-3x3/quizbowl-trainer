/**
 * Render smoke tests for the four Admin tab screens.
 *
 * No jsdom: every test server-renders the tab and either asserts the initial
 * loading markup or runs the hook graph against a stubbed `fetch`. This pattern
 * is shared with the other screen tests in the project.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import AdminUsers from '../Users';
import AdminRooms from '../Rooms';
import AdminPackets from '../Packets';
import AdminProtests from '../Protests';
import { __resetAuth, __setAuth } from '../../../auth';

type FetchStub = (path: string, init?: RequestInit) => Promise<Response>;

function stubFetch(handler: FetchStub) {
  const g = globalThis as unknown as { fetch: typeof fetch };
  g.fetch = handler as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  __resetAuth();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

describe('AdminUsers', () => {
  it('server-renders the title, search field and initial loading row', () => {
    __setAuth({
      user: { id: 1, username: 'alice', role: 'admin' },
      loading: false,
      error: null,
    });
    stubFetch(async () =>
      jsonResponse({ users: [], page: 1, pageCount: 1, total: 0 }),
    );
    const html = renderToString(createElement(AdminUsers));
    expect(html).toContain('Users');
    expect(html).toContain('search');
    expect(html).toContain('loading');
  });

  it('does not expose a search box labelled for anything but username', () => {
    stubFetch(async () =>
      jsonResponse({ users: [], page: 1, pageCount: 1, total: 0 }),
    );
    const html = renderToString(createElement(AdminUsers));
    expect(html).toContain('username substring');
  });
});

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

describe('AdminRooms', () => {
  it('server-renders the close field even while the list is loading', () => {
    stubFetch(async () =>
      jsonResponse({ rooms: [], note: 'live listing not implemented' }),
    );
    const html = renderToString(createElement(AdminRooms));
    expect(html).toContain('Rooms');
    expect(html).toContain('close a room by code');
  });
});

// ---------------------------------------------------------------------------
// Packets
// ---------------------------------------------------------------------------

describe('AdminPackets', () => {
  it('server-renders the title and a Refresh control', () => {
    stubFetch(async () =>
      jsonResponse({
        packets: [],
        note: 'packet import is client-side; nothing to manage server-side yet',
      }),
    );
    const html = renderToString(createElement(AdminPackets));
    expect(html).toContain('Packets');
    expect(html).toContain('Refresh');
    expect(html).toContain('loading');
  });
});

// ---------------------------------------------------------------------------
// Protests
// ---------------------------------------------------------------------------

describe('AdminProtests', () => {
  it('server-renders the four filters, with Pending selected by default', () => {
    stubFetch(async () => jsonResponse({ protests: [] }));
    const html = renderToString(createElement(AdminProtests));
    expect(html).toContain('Protests');
    for (const label of ['Pending', 'Accepted', 'Rejected', 'All']) {
      expect(html, label).toContain(label);
    }
    // The "Pending" filter button starts as the selected tab.
    const selectedBlock = html.match(
      /<button[^>]*aria-selected="true"[^>]*>Pending<\/button>/,
    );
    expect(selectedBlock).not.toBeNull();
  });
});
