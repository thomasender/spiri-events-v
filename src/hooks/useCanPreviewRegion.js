import { useAuth } from './useAuth';
import { getStaffAccess } from '../utils/staffRoles';

/**
 * Whether someone may look at a region that is not active yet: Super-Admins
 * every region, a Regions-Moderator:in her own regions.
 * Seam for the preview banner (ticket 27): nothing renders differently yet.
 */
export function canPreviewRegion(auth, regionId) {
  return getStaffAccess(auth?.role, auth?.staffRegionIds).canModerateRegion(regionId);
}

export function useCanPreviewRegion(regionId) {
  return canPreviewRegion(useAuth(), regionId);
}
