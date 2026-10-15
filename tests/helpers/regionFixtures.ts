import { execFileSync } from 'child_process';

/** Ids of the `[Region-Test]` events written by scripts/seed-region-fixtures.mjs. */
export const REGION_EVENT_IDS = {
  tirolInnsbruck: 'region-test-tirol-innsbruck',
  tirolKufstein: 'region-test-tirol-kufstein',
  tirolOnline: 'region-test-tirol-online',
  vorarlbergDornbirn: 'region-test-vorarlberg-dornbirn',
  // no regionId ("before the migration")
  vorarlbergLegacy: 'region-test-vorarlberg-legacy',
} as const;

const MARKER_URL =
  'http://127.0.0.1:8181/v1/projects/spirieventsvbg/databases/(default)/documents/app_settings/regionMigration';

/**
 * Sets (`true`) or deletes (`false`) the regionId-migration marker that
 * switches the public lists to region-scoped queries. Only for specs in the
 * `destructive` project: while it is set, events without regionId (all seed
 * events) are missing from the calendar.
 */
export async function setRegionMigrationMarker(complete: boolean): Promise<void> {
  const res = complete
    ? await fetch(MARKER_URL, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { complete: { booleanValue: true } } }),
      })
    : await fetch(MARKER_URL, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) throw new Error(`regionMigration marker: HTTP ${res.status}`);
}

export const REGION_EVENT_TITLE_PREFIX = '[Region-Test]';

/**
 * Reconciles the regions (vorarlberg, tirol, wien) and writes the
 * `[Region-Test]` events. Idempotent; call from a dedicated spec's beforeAll.
 * globalSetup already loads the regions, but NOT the events (see docs/regions.md, Tests).
 */
export function loadRegionEventFixtures(): void {
  execFileSync('node', ['scripts/seed-region-fixtures.mjs', '--events'], { stdio: 'inherit' });
}

/**
 * Deletes the `[Region-Test]` events again (emulator REST, owner token), so a
 * spec that loaded them does not change counts for the specs running after it.
 */
export async function removeRegionEventFixtures(): Promise<void> {
  // Tirol is only active while the fixtures are loaded (see seed-region-fixtures.mjs).
  await fetch(
    'http://127.0.0.1:8181/v1/projects/spirieventsvbg/databases/(default)/documents/regions/tirol?updateMask.fieldPaths=active',
    {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { active: { booleanValue: false } } }),
    }
  ).catch(() => {});
  await Promise.all(
    Object.values(REGION_EVENT_IDS).map((id) =>
      fetch(
        `http://127.0.0.1:8181/v1/projects/spirieventsvbg/databases/(default)/documents/events/${id}`,
        { method: 'DELETE', headers: { Authorization: 'Bearer owner' } }
      ).catch(() => {})
    )
  );
}
