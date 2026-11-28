/**
 * The leaderboard lives in its own bottom-bar tab ("Ranks"), no longer
 * behind a button on Tourneys, and it renders without a Done button when it
 * is a tab rather than an overlay.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import App from '../App';
import Leaderboard from '../screens/Leaderboard';
import Tournaments from '../screens/Tournaments';
import { __resetSettings } from '../ui/useSettings';
import { __resetAuth } from '../auth';

beforeEach(() => {
  __resetSettings();
  __resetAuth();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('leaderboard tab', () => {
  it('the bottom bar has a Ranks tab between Tourneys and Settings', () => {
    const html = renderToString(createElement(App));
    const tourneys = html.indexOf('Tourneys');
    const ranks = html.indexOf('Ranks');
    const settings = html.lastIndexOf('Settings');
    expect(ranks).toBeGreaterThan(tourneys);
    expect(settings).toBeGreaterThan(ranks);
  });

  it('as a tab, the leaderboard has no Done button', () => {
    const html = renderToString(createElement(Leaderboard));
    expect(html).toContain('Leaderboard');
    expect(html).not.toContain('>Done<');
  });

  it('as an overlay, it still offers Done', () => {
    const html = renderToString(createElement(Leaderboard, { onExit: () => {} }));
    expect(html).toContain('>Done<');
  });

  it('Tourneys no longer carries its own Leaderboard button', () => {
    const html = renderToString(createElement(Tournaments));
    expect(html).not.toContain('>Leaderboard<');
  });
});
