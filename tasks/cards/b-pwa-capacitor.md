## YOUR TASK — Card B: PWA install and Capacitor shells

Suggested worker tier: **savvy-light**
**Depends on Card A.** If the screens do not exist yet, stop and say so.

### Create

```
web/public/manifest.webmanifest
web/public/icons/           192, 512, and a maskable variant
web/src/sw.ts               or a vite-plugin-pwa config
web/capacitor.config.ts
web/android/                via npx cap add android
web/ios/                    via npx cap add ios
```

### Contract

- Installable on **both** iOS Safari and Android Chrome: correct manifest,
  `display: standalone`, `theme_color` matching `--bg` (`#0f1216`), and an
  apple-touch-icon link, which iOS needs and the manifest alone does not supply.
- Service worker precaches the app shell and the bundled offline question pack.
  **Network-first** for QB Reader API calls, **cache-first** for the shell.
  A failed API call must fall through to the bundled pack, not to an error page.
- Capacitor wraps the same `dist/` output. **Do not fork the codebase.**
- `android/` and `ios/` are generated and gitignored already.

### The web build is deliberately a lite mode

This is a product decision, not an oversight. In a plain browser the app is
**solo practice only**. Multiplayer rooms and packet import are app-only.

Add an `isNativeOrInstalled()` helper (Capacitor native, or
`display-mode: standalone`) and gate the Rooms and Import entry points behind
it, showing a "get the app" affordance in the browser instead. Practice, Learn
and Settings stay fully available on the web.

### Icons

There is no brand yet. Generate something plain and legible at 192px: a dark
`#0f1216` field with a simple mark in `--accent` (`#4fc3f7`). A buzzer dot or a
single letterform is fine. Do not render text smaller than about 40% of the icon
height, and make the maskable variant respect the safe zone.

### Done when

A production build passes Lighthouse's installability check, and `npx cap sync`
completes for both platforms without error.

**Report honestly** whether you could run an emulator. Headless Chrome cannot
reproduce an iPhone's autoplay policy or install behaviour, so do not claim a
device test you did not perform.
