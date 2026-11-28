import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * Compiles src/sw.ts to dist/sw.js once the app bundle exists, injecting the
 * hashed asset names as the precache list.
 *
 * Hand-rolled rather than vite-plugin-pwa: the worker is about a hundred lines
 * with two routing rules, esbuild already ships inside Vite, and a generated
 * Workbox worker would be harder to reason about than the thing it replaces.
 */
function serviceWorker(): Plugin {
  return {
    name: 'qb-service-worker',
    apply: 'build',
    enforce: 'post',
    async writeBundle(options, bundle) {
      const outDir = options.dir ?? 'dist';
      const assets = Object.keys(bundle)
        .filter((f) => /\.(js|css)$/.test(f))
        .map((f) => `/${f}`);
      const precache = [
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/icons/icon-maskable-512.png',
        '/icons/apple-touch-icon-180.png',
        ...assets,
      ];
      const version = createHash('sha256')
        .update(precache.join('\n'))
        .digest('hex')
        .slice(0, 12);

      const out = await esbuild({
        entryPoints: [join(ROOT, 'src/sw.ts')],
        bundle: true,
        format: 'iife',
        target: 'es2020',
        minify: true,
        write: false,
        define: {
          PRECACHE: JSON.stringify(precache),
          CACHE_VERSION: JSON.stringify(version),
        },
      });
      const code = out.outputFiles[0]?.text;
      if (!code) throw new Error('service worker produced no output');
      writeFileSync(join(outDir, 'sw.js'), code);
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    port: 5180,
    proxy: {
      // `npx wrangler dev` serves the room Worker on 8787. QB_API_TARGET points
      // it at a deployed Worker instead (e.g. dev-quizbowl-rooms), for things
      // local wrangler can't run, like the Workers AI voice.
      '/api': {
        target: process.env.QB_API_TARGET ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['{src,workers}/**/__tests__/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
