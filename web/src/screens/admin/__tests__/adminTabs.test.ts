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

// ---------------------------------------------------------------------------
// ProtestRow — restitution surface
// ---------------------------------------------------------------------------

import { ProtestRow } from '../Protests';
import type { AdminProtest } from '../../../admin';

function protestStub(over: Partial<AdminProtest> = {}): AdminProtest {
  return {
    id: 1,
    tournament_id: 1,
    tournament_name: 'Friday Quiz',
    question_id: 'q0',
    raised_by: 2,
    raised_by_username: 'bob',
    reason: 'answer should have been accepted',
    given_answer: 'dickens',
    state: 'pending',
    created_at: 1_700_000_000_000,
    resolved_by: null,
    resolved_at: null,
    resolved_note: null,
    restitution_delta: null,
    ...over,
  };
}

describe('ProtestRow', () => {
  const noop = () => {};

  it('shows a positive restitution on an accepted protest', () => {
    const html = renderToString(
      createElement(ProtestRow, {
        protest: protestStub({
          state: 'accepted',
          restitution_delta: 15,
          resolved_at: 1,
          resolved_by: 1,
        }),
        note: '',
        busy: false,
        onNoteChange: noop,
        onAccept: noop,
        onReject: noop,
      }),
    );
    expect(html).toContain('restitution:');
    // React SSR injects `<!-- -->` between adjacent text nodes, so the sign,
    // number and unit are joined with those markers. Assert on fragments.
    expect(html).toMatch(/\+.*15.*pts/s);
    expect(html).toContain('var(--good');
  });

  it('shows a zero-delta note when the player already had the points', () => {
    const html = renderToString(
      createElement(ProtestRow, {
        protest: protestStub({
          state: 'accepted',
          restitution_delta: 0,
          resolved_at: 1,
          resolved_by: 1,
        }),
        note: '',
        busy: false,
        onNoteChange: noop,
        onAccept: noop,
        onReject: noop,
      }),
    );
    expect(html).toContain('no change');
  });

  it('shows "no attempt row to adjust" when restitution_delta is null', () => {
    const html = renderToString(
      createElement(ProtestRow, {
        protest: protestStub({
          state: 'accepted',
          restitution_delta: null,
          resolved_at: 1,
          resolved_by: 1,
        }),
        note: '',
        busy: false,
        onNoteChange: noop,
        onAccept: noop,
        onReject: noop,
      }),
    );
    expect(html).toContain('no attempt row to adjust');
  });

  it('does not render a restitution line on a rejected protest', () => {
    const html = renderToString(
      createElement(ProtestRow, {
        protest: protestStub({
          state: 'rejected',
          restitution_delta: null,
          resolved_at: 1,
          resolved_by: 1,
        }),
        note: '',
        busy: false,
        onNoteChange: noop,
        onAccept: noop,
        onReject: noop,
      }),
    );
    expect(html).not.toContain('restitution:');
  });

  it('does not render a restitution line on a pending protest', () => {
    const html = renderToString(
      createElement(ProtestRow, {
        protest: protestStub({ state: 'pending' }),
        note: '',
        busy: false,
        onNoteChange: noop,
        onAccept: noop,
        onReject: noop,
      }),
    );
    expect(html).not.toContain('restitution:');
    // Pending still exposes the Accept/Reject controls.
    expect(html).toContain('Accept');
    expect(html).toContain('Reject');
  });
});
