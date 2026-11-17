/**
 * Install-prompt plumbing for the PWA.
 *
 * Chrome, Edge and Android Chrome fire `beforeinstallprompt` when the manifest
 * and the service worker are both satisfied, give us the event, and then stay
 * quiet. We capture it, prevent the browser's own mini-infobar, and expose a
 * single `canInstall` + `promptInstall()` surface the UI can bind to a real
 * button.
 *
 * iOS Safari fires nothing: there is no programmatic install. All we can do is
 * detect iOS and show the Share -> Add to Home Screen instructions; `isIOS`
 * exists for that one case.
 *
 * Once the user accepts the prompt the event is spent and the browser fires
 * `appinstalled`. We clear state on both signals so the button hides itself
 * without a reload.
 */

import { useEffect, useState } from 'react';
import { isInstalled } from './platform';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let captured: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (ev) => {
    // The browser's own banner would race ours. Prevent it, keep the event,
    // and let the UI decide when to show the prompt.
    ev.preventDefault();
    captured = ev as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    captured = null;
    notify();
  });
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Mac; the touch-point check separates it from a real
  // Mac. Everything else is straightforward UA sniffing, which is fine because
  // this only decides whether to show installation hints.
  const iPad = ua.includes('Macintosh') && (navigator.maxTouchPoints ?? 0) > 1;
  return /iPhone|iPod/.test(ua) || iPad;
}

export interface InstallState {
  /** True when a native install prompt is queued and ready to show. */
  canInstall: boolean;
  /** True on iOS Safari, where install goes through the Share sheet. */
  isIOS: boolean;
  /** True once the app is running from the home screen or a native shell. */
  installed: boolean;
  /**
   * Trigger the queued prompt and resolve with whether the user accepted it.
   * Safe to call when `canInstall` is false; it resolves to false immediately.
   */
  promptInstall(): Promise<boolean>;
}

export function useInstallState(): InstallState {
  const [, bump] = useState(0);

  useEffect(() => {
    const listen = () => bump((n) => n + 1);
    listeners.add(listen);
    return () => {
      listeners.delete(listen);
    };
  }, []);

  const installed = isInstalled();
  const canInstall = !installed && captured !== null;
  const isIOS = !installed && isIOSDevice();

  return {
    canInstall,
    isIOS,
    installed,
    async promptInstall() {
      const event = captured;
      if (!event) return false;
      try {
        await event.prompt();
        const choice = await event.userChoice;
        // A spent event cannot be re-prompted; the browser will fire a new
        // one if it decides the user should be asked again.
        captured = null;
        notify();
        return choice.outcome === 'accepted';
      } catch {
        return false;
      }
    },
  };
}
