import { defineConfig } from 'vitest/config';

// Set BASE_PATH (e.g. /history-site/) when deploying to GitHub Pages project sites.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  build: { chunkSizeWarningLimit: 700 },
  server: { host: true },
  preview: { host: true },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
});
