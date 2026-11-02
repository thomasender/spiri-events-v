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
  const context = useRegion();
  const { regions, allRegions, comingSoon } = context;
  // The region the page names (a coming-soon page's own region, the visitor's region on the
  // Verwaltung), never the Vorarlberg fallback of pages with a neutral header (bUcG9rBf).
  const regionId = context.namedRegion?.id ?? context.regionId;
  const { role, staffRegionIds } = useAuth();
  return useMemo(
    () =>
      buildRegionChoices({
        activeRegions: regions,
        allRegions,
        access: getStaffAccess(role, staffRegionIds),
        currentRegionId: regionId,
        // Events entered from a coming-soon page belong to that region.
        keepRegionId: comingSoon ? [].concat(keepRegionId || [], regionId) : keepRegionId,
      }),
    [regions, allRegions, role, staffRegionIds, regionId, keepRegionId, comingSoon]
  );
}
