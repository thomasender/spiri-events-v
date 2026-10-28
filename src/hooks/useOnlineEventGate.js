import { useAuth } from './useAuth';
import { useOrganizerProfile } from './useOrganizerProfile';
import { getStaffAccess } from '../utils/staffRoles';
import { onlineEligibilityHint } from '../utils/onlineEventEligibility';

/**
 * Event forms: may the signed-in person mark this event as online? Only with
 * two or more active regions (`enabled` = `regionChoices.enabled`) and only
 * for non-staff: then their directory listing must be in the event's region
 * and name one of its Bezirke / Landkreise (src/utils/onlineEventEligibility.js).
 * Reads the person's public profile only while the rule applies.
 * `offered` is false while that profile is loading; `hint` is the German
 * reason when it is not offered.
 */
export function useOnlineEventGate({ enabled, region, regions }) {
  const { user, role, staffRegionIds } = useAuth();
  const access = getStaffAccess(role, staffRegionIds);
  const applies = Boolean(enabled) && !access.isSuperAdmin && !access.isRegionModerator;
  const { profile, loading } = useOrganizerProfile(applies ? user?.uid : null);
  if (!applies) return { offered: true, hint: null };
  if (loading) return { offered: false, hint: null };
  const hint = onlineEligibilityHint(profile, region, regions);
  return { offered: !hint, hint };
}
