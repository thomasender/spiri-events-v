import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type TestRole = 'admin' | 'user' | 'unverified' | 'regionModerator';

/**
 * The accounts the integration suite uses. They are created by
 * `scripts/import-test-users.mjs`, which globalSetup runs against the emulator.
 * `regionModerator` is a Regions-Moderator:in for Tirol: no token claim, only
 * `admin_users/{uid}` = { role: 'RegionModerator', regionIds: ['tirol'] }
 * (written by `scripts/seed-region-fixtures.mjs`).
 */
export const TEST_ROLES: Record<TestRole, { email: string; password: string }> = {
  admin: { email: 'admin@test.com', password: 'testpassword123' },
  user: { email: 'user@test.local', password: 'testpassword123' },
  unverified: { email: 'unverified@test.local', password: 'testpassword123' },
  regionModerator: { email: 'tirol-mod@test.local', password: 'testpassword123' },
};

export function storageStatePath(role: TestRole): string {
  return path.resolve(__dirname, '..', '.auth', `${role}.json`);
}

/** Convenience map for `test.use({ storageState: STORAGE_STATE.admin })`. */
export const STORAGE_STATE = {
  admin: storageStatePath('admin'),
  user: storageStatePath('user'),
  unverified: storageStatePath('unverified'),
  regionModerator: storageStatePath('regionModerator'),
} as const;
