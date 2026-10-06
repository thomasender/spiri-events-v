import { defineConfig } from 'vitest/config';

// Firestore security-rules tests. Run via `npm run test:rules`, which starts a
// Firestore emulator first. Deliberately NOT part of vitest.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.rules.spec.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
