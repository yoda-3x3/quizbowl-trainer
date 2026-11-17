/**
 * Render smoke test for the SignIn and SignUp screens.
 *
 * The suite does not exercise typing or submission — there is no jsdom — but
 * server-rendering the screen walks the hook graph, proves the `useAuth` store
 * is wired up, and asserts that neither screen touches the network on mount.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import SignIn from '../SignIn';
import SignUp from '../SignUp';
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

describe('SignIn screen', () => {
  it('renders without touching the network', () => {
    const html = renderQuietly(createElement(SignIn));
    expect(html).toContain('Sign in');
    expect(html).toContain('username');
    expect(html).toContain('password');
  });

  it('shows the switch-to-signup button when a handler is given', () => {
    const html = renderQuietly(
      createElement(SignIn, { onSwitchToSignUp: () => {} }),
    );
    expect(html).toContain('Create an account');
  });
});

describe('SignUp screen', () => {
  it('renders without touching the network', () => {
    const html = renderQuietly(createElement(SignUp));
    expect(html).toContain('Create an account');
    expect(html).toContain('confirm password');
  });

  it('shows the switch-to-signin button when a handler is given', () => {
    const html = renderQuietly(
      createElement(SignUp, { onSwitchToSignIn: () => {} }),
    );
    expect(html).toContain('I already have one');
  });
});
