/**
 * ThemeBackdrop renders the painting + font link for each named theme and
 * nothing at all for classic. Smoke tests also render the App shell under
 * each theme to confirm neither the attribute wiring nor the backdrop crash
 * the tree.
 *
 * The suite uses `react-dom/server`, which does not run effects. That is
 * deliberate: the Google Fonts `<link>` is a mount-only effect, so these
 * tests assert the initial HTML (background image, inert attribute,
 * pointer-events: none) and the App wrapper carries the theme attribute.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import ThemeBackdrop, { THEME_VISUALS } from '../ThemeBackdrop';
import App from '../App';
import { THEMES, updateSettings, __resetSettings, type ThemeId } from '../ui/useSettings';
import { __resetAuth } from '../auth';

beforeEach(() => {
  __resetSettings();
  __resetAuth();
});

afterEach(() => {
  __resetSettings();
  __resetAuth();
  vi.restoreAllMocks();
});

function renderQuietly(el: ReactElement): string {
  const original = globalThis.fetch;
  const forbidden = vi.fn(() => {
    throw new Error('mounting the app must not fetch on first render');
  });
  globalThis.fetch = forbidden as unknown as typeof fetch;
  try {
    return renderToString(el);
  } finally {
    globalThis.fetch = original;
  }
}

describe('ThemeBackdrop', () => {
  it('renders nothing for the classic theme', () => {
    const html = renderToString(createElement(ThemeBackdrop, { theme: 'classic' }));
    expect(html).toBe('');
  });

  for (const theme of ['art', 'science', 'literature', 'mythology', 'math'] as const) {
    it(`renders the painting for the ${theme} theme`, () => {
      const html = renderToString(createElement(ThemeBackdrop, { theme }));
      expect(html).toContain(`data-theme-backdrop="${theme}"`);
      expect(html).toContain(THEME_VISUALS[theme].image);
      // Backdrop must never intercept clicks on the app shell above it.
      expect(html).toMatch(/pointer-events:\s*none/);
      // The painting rides under a dark scrim gradient so ink stays legible.
      expect(html).toContain('linear-gradient');
    });
  }

  it('names a distinct Google Fonts stylesheet for each themed theme', () => {
    const seen = new Set<string>();
    for (const [id, visual] of Object.entries(THEME_VISUALS)) {
      expect(visual.fontHref).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/);
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });
});

describe('App theme wiring', () => {
  for (const theme of THEMES.map((t) => t.id)) {
    it(`renders the shell under the ${theme} theme`, () => {
      updateSettings({ theme: theme as ThemeId });
      const html = renderQuietly(createElement(App));
      expect(html).toContain(`data-theme="${theme}"`);
      if (theme === 'classic') {
        expect(html).not.toContain('data-theme-backdrop');
      } else {
        expect(html).toContain(`data-theme-backdrop="${theme}"`);
      }
    });
  }
});
