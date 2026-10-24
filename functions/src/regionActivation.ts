/**
 * Pure rules for switching a region on or off (ticket 32). No Firebase
 * imports, so tests/lib/regionActivation.spec.ts runs without an emulator.
 * Wired up in adminRegions.ts (callables adminSetRegionActive /
 * adminListRegionActivation).
 *
 * A region may be activated when
 *   - at least MIN_REGION_MODERATORS Regions-Moderator:innen have it in their
 *     `admin_users/{uid}.regionIds`, and
 *   - at least MIN_UPCOMING_EVENTS approved, upcoming, non-online events
 *     belong to it (`regionId`; events without one count as Vorarlberg).
 * A Super-Admin may override unmet conditions explicitly. Deactivation has no
 * conditions, except that Vorarlberg (default region, legal entity) can never
 * be deactivated.
 */
import { getEventLastDate } from './eventExpiry';
import { DEFAULT_REGION_ID, REGION_IDS, resolveRegionId } from './regions';

export const MIN_REGION_MODERATORS = 1;
export const MIN_UPCOMING_EVENTS = 15;

/** Region that can never be switched off. */
export const PERMANENT_REGION_ID = DEFAULT_REGION_ID;

export type UnmetCondition = 'moderators' | 'events';

export interface RegionActivationStatus {
  regionId: string;
  moderatorCount: number;
  upcomingEventCount: number;
  /** Conditions for activation that are not met; [] = may be activated. */
  unmet: UnmetCondition[];
}

type Doc = Record<string, unknown>;

/**
 * An event counts for its region when it is approved, not online and its last
 * date (series: last occurrence) is today or later. A series counts once.
 */
export function isUpcomingRegionEvent(event: Doc | null | undefined, todayIso: string): boolean {
  if (!event || event.status !== 'approved' || event.isOnline === true) return false;
  if (typeof event.date !== 'string') return false;
  const last = getEventLastDate(event as Parameters<typeof getEventLastDate>[0]);
  return last !== null && last >= todayIso;
}

/** Upcoming events per region id (every id of REGION_IDS present, 0 if none). */
export function countUpcomingEventsByRegion(
  events: Iterable<Doc>,
  todayIso: string
): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(REGION_IDS.map((id) => [id, 0]));
  for (const event of events) {
    if (!isUpcomingRegionEvent(event, todayIso)) continue;
    const regionId = resolveRegionId(event);
    if (regionId in counts) counts[regionId] += 1;
  }
  return counts;
}

/**
 * Regions-Moderator:innen per region id, from `admin_users` docs. Same shape
 * check as parseStaffRole in staffRoles.ts: role 'RegionModerator' with a list
 * of region ids (unknown ids are ignored, duplicates count once).
 */
export function countModeratorsByRegion(roleDocs: Iterable<Doc>): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(REGION_IDS.map((id) => [id, 0]));
  for (const doc of roleDocs) {
    if (!doc || doc.role !== 'RegionModerator' || !Array.isArray(doc.regionIds)) continue;
    for (const id of new Set(doc.regionIds as unknown[])) {
      if (typeof id === 'string' && id in counts) counts[id] += 1;
    }
  }
  return counts;
}

export function evaluateRegionActivation(
  regionId: string,
  moderatorCount: number,
  upcomingEventCount: number
): RegionActivationStatus {
  const unmet: UnmetCondition[] = [];
  if (moderatorCount < MIN_REGION_MODERATORS) unmet.push('moderators');
  if (upcomingEventCount < MIN_UPCOMING_EVENTS) unmet.push('events');
  return { regionId, moderatorCount, upcomingEventCount, unmet };
}

/** Status of every region, in REGION_IDS order. */
export function regionActivationStatuses(
  roleDocs: Iterable<Doc>,
  events: Iterable<Doc>,
  todayIso: string
): RegionActivationStatus[] {
  const moderators = countModeratorsByRegion(roleDocs);
  const upcoming = countUpcomingEventsByRegion(events, todayIso);
  return REGION_IDS.map((id) => evaluateRegionActivation(id, moderators[id], upcoming[id]));
}

export type RegionActiveDecision =
  | { kind: 'unchanged' }
  | { kind: 'refuse-permanent' }
  | { kind: 'refuse-unmet'; unmet: UnmetCondition[] }
  | { kind: 'write'; override: boolean };

/**
 * What switching `regionId` to `active` means, given its current state and
 * activation status. `override` only matters for an activation with unmet
 * conditions; `override: true` in the decision records that it was used.
 */
export function decideRegionActive(input: {
  regionId: string;
  active: boolean;
  override: boolean;
  currentActive: boolean;
  status: RegionActivationStatus;
}): RegionActiveDecision {
  const { regionId, active, override, currentActive, status } = input;
  if (!active && regionId === PERMANENT_REGION_ID) return { kind: 'refuse-permanent' };
  if (active === currentActive) return { kind: 'unchanged' };
  if (!active) return { kind: 'write', override: false };
  if (status.unmet.length === 0) return { kind: 'write', override: false };
  if (!override) return { kind: 'refuse-unmet', unmet: status.unmet };
  return { kind: 'write', override: true };
}
