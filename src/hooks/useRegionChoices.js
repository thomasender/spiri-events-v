import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { useRegion } from './useRegion';
import { getStaffAccess } from '../utils/staffRoles';
import { buildRegionChoices } from '../utils/regionChoices';

/**
 * What the event / profile forms offer as "Region". With only one active
 * region `enabled` is false and the forms look exactly as before. Ordinary
 * users choose among the active regions; Super-Admins and Regions-Moderator:innen
 * may also pick inactive regions they can moderate. `keepRegionId` (the region
 * an event already has) always stays selectable so an edit never loses it.
 */
export function useRegionChoices({ keepRegionId = '' } = {}) {
  const { regionId, regions, allRegions } = useRegion();
  const { role, staffRegionIds } = useAuth();
  return useMemo(
    () =>
      buildRegionChoices({
        activeRegions: regions,
        allRegions,
        access: getStaffAccess(role, staffRegionIds),
        currentRegionId: regionId,
        keepRegionId,
      }),
    [regions, allRegions, role, staffRegionIds, regionId, keepRegionId]
  );
}
