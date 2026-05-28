import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 10_000,
    // Tester må kjøre sekvensielt fordi de deler DB
    // (bruker samme Neon-instans + cleanup mellom tester)
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
