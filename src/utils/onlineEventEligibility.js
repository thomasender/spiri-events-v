import {
  STATIC_REGIONS,
  getBezirke,
  getSubdivisionLabel,
  resolveDirectoryRegionIds,
} from './regions.js';

// Online events need a regional anchor (Trello lVFp6Dvw). An online event of a
// non-staff organiser (`createdBy`) shows in a region only when that organiser
// is listed in the directory of that region AND names at least one Bezirk /
// Landkreis of that region (`users/{uid}/publicProfile/data`:
// `listedInDirectory`, `directoryRegionIds`, `directoryRegions`; the "Online"
// chip does not count, a listing hidden by a moderator counts as not listed).
// The event forms offer "Online-Event" only under the same condition.
//
// Dark launch: the rule applies only with two or more active regions. With one
// (today: only Vorarlberg) nothing changes: the option is always offered, no
// event gets `onlineRegionIds` and every online event shows.
//
// The server works out `onlineRegionIds` (the active regions an online event
// may show in) for /api/events.json and the ICS feed; the public list never
// carries `createdBy`. An online event WITHOUT `onlineRegionIds` (one active
// region, staff organiser, no `createdBy`, Firestore fallback path) is shown
// everywhere as before (fail open).
// functions/src/onlineEventEligibility.ts is a synced copy of the pure part
// (guarded by tests/lib/functionsRegions.spec.ts).

/** True when the rule is in force (two or more active regions). */
export function onlineEligibilityEnabled(activeRegionCount) {
  return Number(activeRegionCount) >= 2;
}

/**
 * Why `listing` (a publicProfile doc, or null) does not qualify for online
 * events in `regionId`: 'not-listed' (no listing, not in the directory, hidden,
 * or not listed in that region), 'no-district' (listed there but no Bezirk /
 * Landkreis of that region), or null when it qualifies. `regions` = merged
 * register (`allRegions`).
 */
export function onlineEligibilityReason(listing, regionId, regions = STATIC_REGIONS) {
  if (!listing || listing.listedInDirectory !== true || listing.directoryHidden === true) {
    return 'not-listed';
  }
  if (!resolveDirectoryRegionIds(listing).includes(regionId)) return 'not-listed';
  const districts = new Set(getBezirke(regionId, regions));
  const named = Array.isArray(listing.directoryRegions) ? listing.directoryRegions : [];
  return named.some((d) => districts.has(d)) ? null : 'no-district';
}

export function organizerQualifiesForOnline(listing, regionId, regions = STATIC_REGIONS) {
  return onlineEligibilityReason(listing, regionId, regions) === null;
}

/** Active regions (ids) in which `listing` may show online events. */
export function onlineRegionIdsFor(listing, regions = STATIC_REGIONS) {
  return regions
    .filter((r) => r.active)
    .map((r) => r.id)
    .filter((id) => organizerQualifiesForOnline(listing, id, regions));
}

/**
 * Adds `onlineRegionIds` to the online events of non-staff organisers. Only
 * with two or more active regions; otherwise `events` comes back unchanged
 * (same array). `listings`: `{ [uid]: publicProfile doc | null }`,
 * `staffUids`: uids with an `admin_users` doc (exempt).
 */
export function annotateOnlineRegionIds(
  events,
  { regions = STATIC_REGIONS, listings = {}, staffUids = [] } = {}
) {
  if (!Array.isArray(events)) return events;
  if (!onlineEligibilityEnabled(regions.filter((r) => r.active).length)) return events;
  const staff = new Set(staffUids);
  return events.map((event) => {
    const uid = event?.createdBy;
    if (!event?.isOnline || typeof uid !== 'string' || !uid || staff.has(uid)) return event;
    return { ...event, onlineRegionIds: onlineRegionIdsFor(listings[uid] ?? null, regions) };
  });
}

/** Uids of the organisers of online events (whose listings are needed). */
export function onlineOrganizerUids(events) {
  if (!Array.isArray(events)) return [];
  const uids = events
    .filter((e) => e?.isOnline && typeof e.createdBy === 'string' && e.createdBy)
    .map((e) => e.createdBy);
  return [...new Set(uids)].sort();
}

/** Whether an event may show in a view of `regionIds` (fail open without `onlineRegionIds`). */
export function onlineEventVisibleIn(event, regionIds) {
  if (!event?.isOnline || !Array.isArray(event.onlineRegionIds)) return true;
  return regionIds.some((id) => event.onlineRegionIds.includes(id));
}

/** Public lists: drops online events not allowed in `regionIds`. */
export function filterOnlineEventsForRegions(events, regionIds) {
  if (!Array.isArray(events)) return events;
  if (!events.some((e) => e?.isOnline && Array.isArray(e.onlineRegionIds))) return events;
  return events.filter((event) => onlineEventVisibleIn(event, regionIds));
}

/** Short German hint for the event form, or null when the organiser qualifies. */
export function onlineEligibilityHint(listing, region, regions = STATIC_REGIONS) {
  const regionId = region?.id;
  const reason = onlineEligibilityReason(listing, regionId, regions);
  if (!reason) return null;
  const name = region?.name || regionId;
  const label = getSubdivisionLabel(regionId, regions);
  if (reason === 'no-district') {
    return `Online-Events sind nur möglich, wenn dein Verzeichnis-Eintrag mindestens einen ${label} in ${name} nennt. Das kannst du in deinem Profil ergänzen.`;
  }
  return `Online-Events sind nur möglich, wenn du im Verzeichnis für ${name} gelistet bist und dort mindestens einen ${label} angibst. Das geht in deinem Profil.`;
}
