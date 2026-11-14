/**
 * Render smoke test for the Import screen.
 *
 * `tsc` proves the screen typechecks and `vite build` proves it bundles, but
 * neither runs it. Server-rendering it once exercises the hooks, the module
 * graph and the initial render, and in particular proves the screen does NOT
 * reach for the network on mount: the fetch implementation is replaced with
 * one that fails the test if it is called.
 */

import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import Import from '../../screens/Import';

describe('Import screen', () => {
  it('renders without touching the network', () => {
    const original = globalThis.fetch;
    const forbidden = vi.fn(() => {
      throw new Error('the Import screen must not fetch on mount');
    });
    // Swap the global only for the duration of this render.
    globalThis.fetch = forbidden as unknown as typeof fetch;

    try {
      const html = renderToString(createElement(Import));
      expect(html).toContain('Import a packet');
      // The three routes are all offered.
      expect(html).toContain('Choose a file');
      expect(html).toContain('Paste text from a PDF');
      expect(html).toContain('Fetch one round');
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });

  it('says where the packets come from and how they are used', () => {
    const html = renderToString(createElement(Import));
    expect(html).toContain('quizbowlpackets.com');
    expect(html).toMatch(/study and practice/i);
    // No catalogue is shipped or loaded, so no round list exists yet.
    expect(html).not.toContain('Import</button>');
  });

  it('accepts an onImported handler without requiring one', () => {
    const onImported = vi.fn();
    expect(() =>
      renderToString(createElement(Import, { onImported })),
    ).not.toThrow();
    expect(onImported).not.toHaveBeenCalled();
  });
});
