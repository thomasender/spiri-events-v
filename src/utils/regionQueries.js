// Server-side region queries (ticket 11): which Firestore queries a public
// list runs for the current region. Pure, no Firebase imports, so Vitest can
// pin every query shape (and firestore.indexes.json can be checked against it).
//
// Safety switch: documents written before the regionId migration have no
// `regionId` / `directoryRegionIds` and count as Vorarlberg, but Firestore
// cannot query for a missing field. The region-scoped queries are therefore
// only used while the marker `app_settings/regionMigration` says
// `{ complete: true }`. scripts/migrate-region-ids.mjs writes it at the end of
// a successful --apply (control read: 0 docs left to migrate, 0 invalid) and
// --revert deletes it first. Without the marker every list loads all approved
// events / listed profiles exactly as before, and the client-side filter
// (filterEventsForRegion / filterDirectoryForRegion) decides.
import { REGION_SLUGS } from './regions.js';

export const REGION_MIGRATION_MARKER = Object.freeze({
  collection: 'app_settings',
  id: 'regionMigration',
});

// Firestore limit for `in` / `array-contains-any` values.
export const MAX_IN_VALUES = 30;

/** True only for a marker doc that explicitly says the migration is complete. */
export function isRegionMigrationComplete(data) {
  return Boolean(data && typeof data === 'object' && data.complete === true);
}

const APPROVED = ['status', '==', 'approved'];
const LISTED = ['listedInDirectory', '==', true];

function validRegionIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter((id) => REGION_SLUGS.includes(id)))];
}

/**
 * Event queries behind the public lists (calendar, favourites, similar events).
 * Each query is `{ key, constraints: [[field, op, value], ...] }` (the shape
 * `subscribeEventQueries` takes); the results are merged by id.
 *
 *   marker missing / not complete  -> `all`: every approved event (today's query)
 *   region R                       -> `region`: regionId == R
 *                                     `online`: isOnline == true (online events are
 *                                     visible in every region; the client filter drops
 *                                     those of inactive regions)
 *   combined view (isNational)     -> `regions`: regionId in [active regions]
 *                                     (online events carry their regionId too)
 *
 * Returns `null` while the marker state is unknown (`markerComplete === null`):
 * the caller waits instead of starting the expensive full query.
 * No order constraints: lists are sorted on the client (compareEventsByDateTime).
 */
export function buildPublicEventQueryPlan({
  markerComplete,
  regionId = null,
  isNational = false,
  activeRegionIds = [],
} = {}) {
  if (markerComplete === null || markerComplete === undefined) return null;
  const all = { mode: 'all', queries: [{ key: 'all', constraints: [APPROVED] }] };
  if (markerComplete !== true) return all;

  if (isNational || !regionId) {
    const ids = validRegionIds(activeRegionIds);
    // Nothing active: nothing to show (the client filter would drop it all).
    if (ids.length === 0) return { mode: 'national', queries: [] };
    if (ids.length > MAX_IN_VALUES) return all;
    return {
      mode: 'national',
      queries: [{ key: 'regions', constraints: [APPROVED, ['regionId', 'in', ids]] }],
    };
  }

  if (!REGION_SLUGS.includes(regionId)) return all;
  return {
    mode: 'region',
    queries: [
      { key: 'region', constraints: [APPROVED, ['regionId', '==', regionId]] },
      { key: 'online', constraints: [APPROVED, ['isOnline', '==', true]] },
    ],
  };
}

/**
 * Directory query (collection group `publicProfile`), same switch:
 *   marker missing  -> listedInDirectory == true (today's query)
 *   region R        -> + directoryRegionIds array-contains R
 *   combined view   -> + directoryRegionIds array-contains-any [active regions]
 * Returns `null` while the marker state is unknown.
 */
export function buildDirectoryQueryPlan({
  markerComplete,
  regionId = null,
  isNational = false,
  activeRegionIds = [],
} = {}) {
  if (markerComplete === null || markerComplete === undefined) return null;
  const all = { mode: 'all', constraints: [LISTED] };
  if (markerComplete !== true) return all;

  if (isNational || !regionId) {
    const ids = validRegionIds(activeRegionIds);
    if (ids.length === 0) return { mode: 'national', constraints: null };
    if (ids.length > MAX_IN_VALUES) return all;
    return {
      mode: 'national',
      constraints: [LISTED, ['directoryRegionIds', 'array-contains-any', ids]],
    };
  }

  if (!REGION_SLUGS.includes(regionId)) return all;
  return {
    mode: 'region',
    constraints: [LISTED, ['directoryRegionIds', 'array-contains', regionId]],
  };
}

/** Stable string for a plan (effect dependency / resubscribe key). */
export function queryPlanKey(plan) {
  return plan === null ? 'pending' : JSON.stringify(plan);
}
