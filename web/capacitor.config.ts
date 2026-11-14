/**
 * Capacitor wraps the same `dist/` Vite produces for the web. There is no
 * native fork of the codebase: `npm run build && npx cap sync` is the whole
 * pipeline, and the shell only supplies the things a browser tab will not,
 * namely the install itself and `isNativePlatform()` for lite-mode gating.
 */

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.quizbowltrainer.app',
  appName: 'Quizbowl Trainer',
  webDir: 'dist',
  // The bundled shell is loaded from the app's own files; only the QB Reader
  // API and the room Worker go over the network.
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0f1216',
  },
  ios: {
    backgroundColor: '#0f1216',
    // The app draws its own bottom tab bar, so let the webview own the insets
    // rather than letting iOS scroll-adjust under it.
    contentInset: 'always',
  },
};

export default config;
