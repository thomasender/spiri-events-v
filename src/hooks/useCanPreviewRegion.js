import { useAuth } from './useAuth';
import { getStaffAccess } from '../utils/staffRoles';

/**
 * Whether someone may look at a region that is not active yet: Super-Admins
 * every region, a Regions-Moderator:in her own regions.
 * Today only the coming-soon page shows a note for them; a full preview banner
 * is a follow-up.
 */
export function canPreviewRegion(auth, regionId) {
  return getStaffAccess(auth?.role, auth?.staffRegionIds).canModerateRegion(regionId);
}

export function useCanPreviewRegion(regionId) {
  return canPreviewRegion(useAuth(), regionId);
}
