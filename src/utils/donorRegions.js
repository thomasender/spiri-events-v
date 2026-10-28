// Spender:innen (`donors/*`) belong to one region. Docs written before donors
// were per region have no `regionId` and belong to Vorarlberg (read-time
// fallback, no migration; same rule as the Mollie webhook and firestore.rules).
// Kept free of Firebase imports.
import { resolveRegionId } from './regions.js';

function compareDonorsByOrder(a, b) {
  const aHasOrder = typeof a.order === 'number';
  const bHasOrder = typeof b.order === 'number';
  if (aHasOrder && !bHasOrder) return -1;
  if (!aHasOrder && bHasOrder) return 1;
  if (aHasOrder && bHasOrder && a.order !== b.order) return a.order - b.order;
  return (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0);
}

/** The donors of one region, in admin order. */
export function donorsOfRegion(donors, regionId) {
  return donors.filter((d) => resolveRegionId(d) === regionId).sort(compareDonorsByOrder);
}
