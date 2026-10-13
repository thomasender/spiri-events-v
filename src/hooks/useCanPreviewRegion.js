import { useAuth } from './useAuth';

/**
 * Whether someone may look at a region that is not active yet. Today only
 * admins; regional moderators follow with the moderator role (ticket 18).
 * Seam for the preview banner (ticket 27): nothing renders differently yet.
 */
export function canPreviewRegion(auth, _regionId) {
  return auth?.role === 'Admin';
}

export function useCanPreviewRegion(regionId) {
  return canPreviewRegion(useAuth(), regionId);
}
