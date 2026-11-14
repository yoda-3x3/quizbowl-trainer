import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      // `npx wrangler dev` serves the room Worker on 8787.
      '/api': {
        target: 'http://127.0.0.1:8787',
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
