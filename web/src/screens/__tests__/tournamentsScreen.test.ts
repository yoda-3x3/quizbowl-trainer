/**
 * Render smoke test for the Tournaments hub and its detail screen.
 *
 * No jsdom and no router: these tests server-render the screens and make sure
 * no fetch runs during that render (React only fires useEffect on hydration,
 * which happens in a real browser). The signInUp test uses the same pattern.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import Tournaments from '../Tournaments';
import TournamentDetail from '../TournamentDetail';
import { __resetAuth } from '../../auth';

afterEach(() => {
  __resetAuth();
  vi.restoreAllMocks();
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

describe('Tournaments hub', () => {
  it('renders the title and a loading list without touching the network', () => {
    const html = renderQuietly(createElement(Tournaments));
    expect(html).toContain('Tournaments');
    // The list groups rendered on first paint: Register (open), Watch live
    // (running) and Finished. loading state renders inside a sheet before
    // the groups appear.
    expect(html).toContain('loading');
    // Anonymous initial state: the sign-in prompt is visible.
    expect(html).toContain('Sign in to host');
  });

  it('refresh and create buttons share the topbar', () => {
    const html = renderQuietly(createElement(Tournaments));
    expect(html).toContain('Refresh');
  });
});

describe('TournamentDetail', () => {
  it('server-renders its loading state for an unknown id', () => {
    const html = renderQuietly(
      createElement(TournamentDetail, { id: 99, onExit: () => {} }),
    );
    expect(html).toContain('Tournament');
    expect(html).toContain('loading');
  });
});
