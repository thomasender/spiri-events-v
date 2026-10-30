import { assignmentForEntry, assignmentForGemeinde } from './placeDistrict.js';
import { eventPosition, haversineKm } from './placeSearch.js';
import { findGemeinde } from './gemeinden.js';
import { foldSearchText } from './regionSearch.js';
import { DEFAULT_REGION_ID, getAllDistricts, isLegacyBezirk } from './regions.js';

// Pure planning for scripts/realign-event-regions.mjs (QG0GR5lv, staging only): events whose
// region is no longer a register region, or whose Bezirk / Landkreis is not a district of their
// region, are re-placed by their Ort (same logic as the event form: placeDistrict.js + the
// place list) or marked for deletion. Also the profile / moderator fields that point at former
// regions or districts. No Firebase imports, so Vitest covers it.

/** Fallback region for a moderator who has no valid region left. */
export const FALLBACK_ADMIN_REGION_ID = 'steiermark';

const text = (v) => (typeof v === 'string' ? v.trim() : '');

/** Whether an event needs a new place: retired region, or Bezirk that is not in its region. */
export function needsRealign(event, regions) {
  const rawId = text(event.regionId);
  const regionId = rawId || DEFAULT_REGION_ID;
  const region = regions.find((r) => r.id === regionId);
  if (!region) return true;
  if (event.isOnline) return false;
  const bezirk = text(event.bezirk);
  if (isLegacyBezirk(bezirk)) return false;
  if (regionId === DEFAULT_REGION_ID) {
    // Vorarlberg (or no region): only a Bezirk of another region is wrong, never an empty one.
    return Boolean(bezirk) && !(region.bezirke ?? []).includes(bezirk);
  }
  return !bezirk || !(region.bezirke ?? []).includes(bezirk);
}

// Candidates of the place list for a stored Ort, as `{ entry, regionId, bezirk }`.
function candidatesFor(index, regions, city) {
  const key = foldSearchText(city);
  if (!index || !key) return [];
  const seen = new Set();
  const found = [];
  for (const entry of index.byName.get(key) ?? []) {
    if (entry.kind !== 'place' || seen.has(entry)) continue;
    seen.add(entry);
    const a = assignmentForEntry(entry, regions);
    if (a) found.push({ entry, ...a });
  }
  return found;
}

/**
 * The place a stored `city` stands for, or null (-> delete). A Vorarlberg Gemeinde, or the
 * places of that name: one distinct district wins; else the best by hints of the old data
 * (same Bezirk, same region, same country), then nearest to the stored lat / lng, then the
 * biggest place (what the form would suggest first).
 */
export function resolveStoredPlace(event, index, regions) {
  const city = text(event.city);
  if (!city) return null;
  const gemeinde = findGemeinde(city);
  if (gemeinde) {
    const a = assignmentForGemeinde(gemeinde, regions);
    return { city: gemeinde.name, bezirk: a.bezirk, regionId: a.regionId };
  }
  const candidates = candidatesFor(index, regions, city);
  if (candidates.length === 0) return null;
  const distinct = new Set(candidates.map((c) => `${c.regionId}|${c.bezirk}`));
  let best = candidates[0];
  if (distinct.size > 1) {
    const oldRegion = regions.find((r) => r.id === text(event.regionId));
    const oldBezirk = text(event.bezirk);
    const lat = Number(event.lat);
    const lng = Number(event.lng);
    const hasPos =
      event.lat != null && event.lng != null && Number.isFinite(lat) && Number.isFinite(lng);
    const score = (c) =>
      (oldBezirk && c.bezirk === oldBezirk ? 4 : 0) +
      (c.regionId === text(event.regionId) ? 2 : 0) +
      (oldRegion &&
      index.stateBySlug.get(c.entry.stateSlug) &&
      c.entry.country === oldRegion.country
        ? 1
        : 0);
    const dist = (c) => (hasPos ? haversineKm(lat, lng, c.entry.lat, c.entry.lon) : 0);
    best = [...candidates].sort(
      (a, b) =>
        score(b) - score(a) || dist(a) - dist(b) || (b.entry.size ?? 0) - (a.entry.size ?? 0)
    )[0];
  }
  return { city: best.entry.name, bezirk: best.bezirk, regionId: best.regionId };
}

/**
 * Plan for `events` (`[{ id, data }]`): one row per event that needs a change,
 * `{ id, title, old: { city, bezirk, regionId }, action: 'update' | 'delete', next }`;
 * `next` = `{ city, bezirk, regionId, lat, lng }` for an update.
 */
export function planEventRealign(events, index, regions) {
  const rows = [];
  for (const { id, data } of events) {
    if (!needsRealign(data, regions)) continue;
    const old = { city: text(data.city), bezirk: text(data.bezirk), regionId: text(data.regionId) };
    const base = { id, title: text(data.title), old };
    const place = resolveStoredPlace(data, index, regions);
    if (!place) {
      rows.push({ ...base, action: 'delete', next: null });
      continue;
    }
    const pos = eventPosition({ ...place, isOnline: false }, index, regions);
    rows.push({
      ...base,
      action: 'update',
      next: { ...place, lat: pos?.lat ?? null, lng: pos?.lng ?? null },
    });
  }
  return rows;
}

const isValidRegionId = (id, regions) => typeof id === 'string' && regions.some((r) => r.id === id);

/**
 * Directory fields of a profile doc (`users/{uid}`, `users/{uid}/publicProfile/data`): invalid
 * `directoryRegionIds` (former regions) and `directoryRegions` (districts that no longer exist;
 * "Online" stays) are removed. Returns `{ set: {field: list}, remove: [field] }` (empty when
 * nothing changes); a list that would become empty is removed.
 */
export function planProfileFields(data, regions) {
  const set = {};
  const remove = [];
  const checks = [
    ['directoryRegionIds', (v) => isValidRegionId(v, regions)],
    [
      'directoryRegions',
      (v) => {
        const districts = getAllDistricts(regions);
        return (
          typeof v === 'string' && (v === 'Online' || districts.includes(v) || isLegacyBezirk(v))
        );
      },
    ],
  ];
  for (const [field, valid] of checks) {
    const list = data?.[field];
    if (!Array.isArray(list)) continue;
    const kept = list.filter(valid);
    if (kept.length === list.length) continue;
    if (kept.length === 0) remove.push(field);
    else set[field] = kept;
  }
  return { set, remove };
}

/**
 * `admin_users/{uid}.regionIds`: retired ids are dropped; when nothing valid remains the
 * list becomes `['steiermark']`. Returns the new list, or null when nothing changes.
 */
export function planAdminRegionIds(data, regions) {
  const list = data?.regionIds;
  if (!Array.isArray(list)) return null;
  const kept = list.filter((id) => isValidRegionId(id, regions));
  if (kept.length === list.length) return null;
  return kept.length > 0 ? kept : [FALLBACK_ADMIN_REGION_ID];
}
