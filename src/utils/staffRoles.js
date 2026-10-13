// Staff roles in `admin_users/{uid}` (written only via the Admin SDK):
//   { role: 'Admin' }                                   Super-Admin
//   { role: 'RegionModerator', regionIds: ['tirol'] }   Regions-Moderator:in
// Server side: functions/src/staffRoles.ts; rules: firestore.rules
// (isAdminViaFirestore / isRegionModerator). Kept free of Firebase imports.
import { REGION_SLUGS } from './regions.js';

export const SUPER_ADMIN_ROLE = 'Admin';
export const REGION_MODERATOR_ROLE = 'RegionModerator';

/**
 * Parses a comma separated region list ("steiermark,tirol"). Returns the ids
 * in canonical REGION_SLUGS order, or throws on unknown ids, duplicates or an
 * empty list.
 */
export function parseModeratorRegions(value) {
  const ids = String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) throw new Error('--regions needs at least one region id');
  const unknown = ids.filter((id) => !REGION_SLUGS.includes(id));
  if (unknown.length) {
    throw new Error(
      `Unknown region id(s): ${unknown.join(', ')} (valid: ${REGION_SLUGS.join(', ')})`
    );
  }
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate region id in --regions');
  return REGION_SLUGS.filter((id) => ids.includes(id));
}

/**
 * Decides what making a user a region moderator means, given the current
 * admin_users doc (or null) and the user's custom claims. Super-Admins
 * (doc role 'Admin', a doc without moderator role, or claim role 'Admin') are
 * never converted. Same regions again = nothing to do (idempotent).
 */
export function planModeratorPromotion({ currentDoc, claims, regionIds }) {
  if (claims?.role === SUPER_ADMIN_ROLE) {
    return { action: 'refuse', reason: 'user is a Super-Admin (token claim role=Admin)' };
  }
  if (currentDoc && currentDoc.role !== REGION_MODERATOR_ROLE) {
    return {
      action: 'refuse',
      reason: `user already has admin_users role "${currentDoc.role ?? '(none)'}"`,
    };
  }
  const before = Array.isArray(currentDoc?.regionIds) ? currentDoc.regionIds : null;
  if (
    before &&
    before.length === regionIds.length &&
    before.every((id, i) => id === regionIds[i])
  ) {
    return { action: 'unchanged', regionIds };
  }
  return { action: 'write', before, regionIds };
}
