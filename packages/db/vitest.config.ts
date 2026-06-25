import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: [],
    include: ['src/**/*.test.ts'],
    testTimeout: 30000,
    pool: 'forks', // Aísla cada archivo de tests; necesario para spike RLS.
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
