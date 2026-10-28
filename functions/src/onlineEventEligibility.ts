import { DEFAULT_REGION_ID, LEGACY_REGION_ALIASES, isRegionId } from './regions';

/**
 * Synced copy of the pure part of src/utils/onlineEventEligibility.js (Trello
 * lVFp6Dvw; guarded by tests/lib/functionsRegions.spec.ts): an online event of
 * a non-staff organiser shows in a region only when the organiser's directory
 * listing is in that region and names one of its Bezirke / Landkreise. Only
 * with two or more active regions; otherwise nothing is annotated.
 */

export interface EligibilityRegion {
  id: string;
  active: boolean;
  bezirke: readonly string[];
}

type Listing = Record<string, unknown> | null | undefined;

const MAX_DIRECTORY_REGION_IDS = 10;

function directoryRegionIds(listing: Record<string, unknown>): string[] {
  const raw = Array.isArray(listing.directoryRegionIds) ? listing.directoryRegionIds : [];
  const ids = [
    ...new Set(
      raw
        .map((id) => (typeof id === 'string' ? (LEGACY_REGION_ALIASES[id] ?? id) : id))
        .filter(isRegionId)
    ),
  ].slice(0, MAX_DIRECTORY_REGION_IDS);
  return ids.length > 0 ? ids : [DEFAULT_REGION_ID];
}

export function organizerQualifiesForOnline(
  listing: Listing,
  regionId: string,
  regions: readonly EligibilityRegion[]
): boolean {
  if (!listing || listing.listedInDirectory !== true || listing.directoryHidden === true) {
    return false;
  }
  if (!directoryRegionIds(listing).includes(regionId)) return false;
  const districts = new Set(regions.find((r) => r.id === regionId)?.bezirke ?? []);
  const named = Array.isArray(listing.directoryRegions) ? listing.directoryRegions : [];
  return named.some((d) => typeof d === 'string' && districts.has(d));
}

export function onlineRegionIdsFor(
  listing: Listing,
  regions: readonly EligibilityRegion[]
): string[] {
  return regions
    .filter((r) => r.active)
    .map((r) => r.id)
    .filter((id) => organizerQualifiesForOnline(listing, id, regions));
}

interface OnlineEventLike {
  isOnline?: unknown;
  createdBy?: unknown;
  onlineRegionIds?: unknown;
}

function isOnline(event: OnlineEventLike | null | undefined): boolean {
  return event?.isOnline === true || event?.isOnline === 'true';
}

export function annotateOnlineRegionIds<T extends OnlineEventLike>(
  events: T[],
  {
    regions,
    listings = {},
    staffUids = [],
  }: {
    regions: readonly EligibilityRegion[];
    listings?: Record<string, Listing>;
    staffUids?: Iterable<string>;
  }
): T[] {
  if (regions.filter((r) => r.active).length < 2) return events;
  const staff = new Set(staffUids);
  return events.map((event) => {
    const uid = event?.createdBy;
    if (!isOnline(event) || typeof uid !== 'string' || !uid || staff.has(uid)) return event;
    return { ...event, onlineRegionIds: onlineRegionIdsFor(listings[uid] ?? null, regions) };
  });
}

export function onlineOrganizerUids(events: readonly OnlineEventLike[]): string[] {
  const uids = events
    .filter((e) => isOnline(e) && typeof e.createdBy === 'string' && e.createdBy)
    .map((e) => e.createdBy as string);
  return [...new Set(uids)].sort();
}

/** Fail open: an online event without `onlineRegionIds` shows everywhere. */
export function onlineEventVisibleIn(
  event: OnlineEventLike | null | undefined,
  regionIds: readonly string[]
): boolean {
  if (!isOnline(event) || !Array.isArray(event?.onlineRegionIds)) return true;
  const allowed = event?.onlineRegionIds as unknown[];
  return regionIds.some((id) => allowed.includes(id));
}
