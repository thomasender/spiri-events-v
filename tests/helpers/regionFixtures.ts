import { execFileSync } from 'child_process';

/** Ids of the `[Region-Test]` events written by scripts/seed-region-fixtures.mjs. */
export const REGION_EVENT_IDS = {
  tirolInnsbruck: 'region-test-tirol-innsbruck',
  tirolKufstein: 'region-test-tirol-kufstein',
  tirolOnline: 'region-test-tirol-online',
  vorarlbergDornbirn: 'region-test-vorarlberg-dornbirn',
} as const;

export const REGION_EVENT_TITLE_PREFIX = '[Region-Test]';

/**
 * Reconciles the regions (vorarlberg, tirol, wien) and writes the
 * `[Region-Test]` events. Idempotent; call from a dedicated spec's beforeAll.
 * globalSetup already loads the regions, but NOT the events (see AGENTS.md).
 */
export function loadRegionEventFixtures(): void {
  execFileSync('node', ['scripts/seed-region-fixtures.mjs', '--events'], { stdio: 'inherit' });
}

/**
 * Deletes the `[Region-Test]` events again (emulator REST, owner token), so a
 * spec that loaded them does not change counts for the specs running after it.
 */
export async function removeRegionEventFixtures(): Promise<void> {
  await Promise.all(
    Object.values(REGION_EVENT_IDS).map((id) =>
      fetch(
        `http://127.0.0.1:8181/v1/projects/spirieventsvbg/databases/(default)/documents/events/${id}`,
        { method: 'DELETE', headers: { Authorization: 'Bearer owner' } }
      ).catch(() => {})
    )
  );
}
