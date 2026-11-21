/**
 * The lite-mode gate and the manifest it is paired with.
 *
 * Tests run in the node environment, so `window` is stubbed per case. That is
 * the point: the helper has to survive both a missing window and an iOS Safari
 * that predates `display-mode`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isInstalled, isNative, isNativeOrInstalled } from '../platform';

interface FakeWindow {
  navigator: { standalone?: boolean };
  matchMedia?: (q: string) => { matches: boolean };
}

const g = globalThis as unknown as {
  window?: FakeWindow;
  Capacitor?: unknown;
};

function setWindow(opts: { standalone?: boolean; display?: string | null }) {
  g.window = {
    navigator: opts.standalone === undefined ? {} : { standalone: opts.standalone },
    matchMedia: (q: string) => ({
      matches: opts.display !== null && opts.display !== undefined
        ? q.includes(opts.display)
        : false,
    }),
  };
}

afterEach(() => {
  delete g.window;
  delete g.Capacitor;
});

describe('isNative', () => {
  it('is false with no Capacitor global', () => {
    expect(isNative()).toBe(false);
  });

  it('trusts isNativePlatform when present', () => {
    g.Capacitor = { isNativePlatform: () => true };
    expect(isNative()).toBe(true);
    g.Capacitor = { isNativePlatform: () => false };
    expect(isNative()).toBe(false);
  });

  it('falls back to getPlatform, and web is not native', () => {
    g.Capacitor = { getPlatform: () => 'ios' };
    expect(isNative()).toBe(true);
    g.Capacitor = { getPlatform: () => 'web' };
    expect(isNative()).toBe(false);
  });
});

describe('isInstalled', () => {
  it('is false with no window at all', () => {
    expect(isInstalled()).toBe(false);
  });

  it('is false in a plain browser tab', () => {
    setWindow({ display: null });
    expect(isInstalled()).toBe(false);
  });

  it('is true for display-mode: standalone', () => {
    setWindow({ display: 'standalone' });
    expect(isInstalled()).toBe(true);
  });

  it('accepts fullscreen and minimal-ui installs too', () => {
    setWindow({ display: 'fullscreen' });
    expect(isInstalled()).toBe(true);
    setWindow({ display: 'minimal-ui' });
    expect(isInstalled()).toBe(true);
  });

  it('honours the legacy iOS navigator.standalone flag', () => {
    setWindow({ standalone: true, display: null });
    expect(isInstalled()).toBe(true);
  });

  it('survives a window with no matchMedia', () => {
    g.window = { navigator: {} };
    expect(isInstalled()).toBe(false);
  });
});

describe('isNativeOrInstalled', () => {
  it('opens the gate for either, and shuts it for a plain tab', () => {
    setWindow({ display: null });
    expect(isNativeOrInstalled()).toBe(false);

    g.Capacitor = { isNativePlatform: () => true };
    expect(isNativeOrInstalled()).toBe(true);

    delete g.Capacitor;
    setWindow({ display: 'standalone' });
    expect(isNativeOrInstalled()).toBe(true);
  });
});

describe('manifest', () => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'public/manifest.webmanifest'), 'utf8'),
  ) as {
    display: string;
    start_url: string;
    theme_color: string;
    background_color: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };

  it('is installable: standalone, scoped, and themed to --bg', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.theme_color).toBe('#0b0a08');
    expect(manifest.background_color).toBe('#0b0a08');
  });

  it('ships 192, 512 and a maskable icon, and they exist on disk', () => {
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      const buf = readFileSync(join(process.cwd(), 'public', icon.src));
      // PNG signature, then IHDR width/height.
      expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
      const [w] = icon.sizes.split('x');
      expect(buf.readUInt32BE(16)).toBe(Number(w));
    }
  });

  it('links an apple-touch-icon, which iOS needs and the manifest never supplies', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('rel="manifest"');
    const icon = readFileSync(
      join(process.cwd(), 'public/icons/apple-touch-icon-180.png'),
    );
    expect(icon.readUInt32BE(16)).toBe(180);
  });
});
