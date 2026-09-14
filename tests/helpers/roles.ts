import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type TestRole = 'admin' | 'user' | 'unverified';

/**
 * The three accounts the integration suite actually uses. They are created by
 * `scripts/import-test-users.mjs`, which globalSetup runs against the emulator.
 */
export const TEST_ROLES: Record<TestRole, { email: string; password: string }> = {
  admin: { email: 'admin@test.com', password: 'testpassword123' },
  user: { email: 'user@test.local', password: 'testpassword123' },
  unverified: { email: 'unverified@test.local', password: 'testpassword123' },
};

export function storageStatePath(role: TestRole): string {
  return path.resolve(__dirname, '..', '.auth', `${role}.json`);
}

/** Convenience map for `test.use({ storageState: STORAGE_STATE.admin })`. */
export const STORAGE_STATE = {
  admin: storageStatePath('admin'),
  user: storageStatePath('user'),
  unverified: storageStatePath('unverified'),
} as const;
