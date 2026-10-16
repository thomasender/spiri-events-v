import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { getStaffAccess } from '../utils/staffRoles';

/**
 * Staff role of the signed-in person:
 *   isSuperAdmin        admin_users role 'Admin' (or token claim), unchanged
 *   isRegionModerator   role 'RegionModerator' with at least one valid region
 *   moderatorRegionIds  her regions (canonical order), [] otherwise
 *   canModerateRegion   (regionId) => boolean; always true for Super-Admins
 * `loading` is true until the role is known: decide about access only after.
 */
export function useStaffRole() {
  const { role, staffRegionIds, loading } = useAuth();
  const key = Array.isArray(staffRegionIds) ? staffRegionIds.join(',') : '';
  return useMemo(
    () => ({ ...getStaffAccess(role, key ? key.split(',') : []), loading: Boolean(loading) }),
    [role, key, loading]
  );
}
