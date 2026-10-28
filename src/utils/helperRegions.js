// Mithelfer (`helpers/*`) belong to one region. Docs written before helpers
// were per region have no `regionId` and belong to Vorarlberg (read-time
// fallback, no migration; same rule as helperRegionId in firestore.rules).
// Kept free of Firebase imports.
import { resolveRegionId } from './regions.js';

function compareHelpersByOrder(a, b) {
  const aHasOrder = typeof a.order === 'number';
  const bHasOrder = typeof b.order === 'number';
  if (aHasOrder && !bHasOrder) return -1;
  if (!aHasOrder && bHasOrder) return 1;
  if (aHasOrder && bHasOrder && a.order !== b.order) return a.order - b.order;
  return (a.name ?? '').localeCompare(b.name ?? '', 'de');
}

/** The helpers of one region, in display order. */
export function helpersOfRegion(helpers, regionId) {
  return helpers.filter((h) => resolveRegionId(h) === regionId).sort(compareHelpersByOrder);
}
