/**
 * Where the app is running, and the service worker registration.
 *
 * The web build is deliberately a lite mode: in a plain browser tab the app is
 * solo practice only, and rooms and packet import are app-only. This is the one
 * place that decides which of those two the current page is.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function capacitor(): CapacitorGlobal | undefined {
  return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True inside the Capacitor Android or iOS shell. */
export function isNative(): boolean {
  const cap = capacitor();
  if (!cap) return false;
  if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
  const p = cap.getPlatform?.();
  return p === 'ios' || p === 'android';
}

/** True once the PWA has been installed and is launched from the home screen. */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari predates display-mode and reports standalone on navigator.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  if (typeof window.matchMedia !== 'function') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches
  );
}

/**
 * The gate for rooms and packet import. A browser tab gets a "get the app"
 * card instead; practice, learn and settings are unaffected.
 */
export function isNativeOrInstalled(): boolean {
  return isNative() || isInstalled();
}

/** Registers the worker built by the `serviceWorker` plugin in vite.config.ts. */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // Dev has no sw.js; registering one would also shadow the /api proxy.
  if (import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* an unregistrable worker just means no offline support */
    });
  });
}
