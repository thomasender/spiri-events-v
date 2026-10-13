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
