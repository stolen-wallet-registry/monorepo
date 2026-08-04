import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only `test/` — files under `src/` are loaded by ponder as indexing functions.
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
