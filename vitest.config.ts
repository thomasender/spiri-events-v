import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    // Undo vi.spyOn / vi.stubGlobal / vi.stubEnv after every test, so mocks
    // cannot leak into the next one.
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    // Random order locally-on-demand: `SHUFFLE=1 npm run test`. Used by
    // `npm run test:shuffle` to flush out order-dependent tests.
    sequence: { shuffle: !!process.env.SHUFFLE },
    setupFiles: ['./tests/vitest.setup.ts'],
    include: [
      'tests/components/**/*.spec.{ts,tsx}',
      'tests/components/**/*.test.{ts,tsx}',
      'tests/lib/**/*.spec.{ts,tsx}',
      'tests/lib/**/*.test.{ts,tsx}',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
