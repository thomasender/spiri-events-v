import { CATALOG_BY_KEY, currentAssignment } from './regionMapping.js';
import { isRegionSlug } from './regions.js';

// The visitor's remembered "Wo bist du?" choice: a place (name + rounded coordinates of the
// place, never the exact GPS position) and a radius. Kept in localStorage and, for signed-in
// users, in `users/{uid}.placeSelection` (see PlaceSelectionSync). Pure, free of Firebase/React.

export const PLACE_SELECTION_KEY = 'tribe:placeSelection';
export const RADIUS_OPTIONS = Object.freeze([5, 10, 15, 20, 25, 50]);
export const DEFAULT_RADIUS_KM = 25;
export const MAX_RADIUS_KM = 50;
// firestore.rules still accepts 1..200 on purpose (old profile values, clients not yet reloaded).

const round3 = (x) => Math.round(x * 1000) / 1000;

/**
 * A stored radius mapped onto an allowed step: the nearest one (the lower on a tie), anything
 * above the maximum becomes the maximum, anything invalid the default. So an old 100 km shows
 * as 50 km.
 */
export function snapRadius(value) {
  const radius = Number(value);
  if (!Number.isFinite(radius) || radius < 1) return DEFAULT_RADIUS_KM;
  if (radius >= MAX_RADIUS_KM) return MAX_RADIUS_KM;
  return RADIUS_OPTIONS.reduce((best, km) =>
    Math.abs(km - radius) < Math.abs(best - radius) ? km : best
  );
}

/**
 * Clean selection `{ label, lat, lon, radiusKm, regionId, source, updatedAt }` or null for
 * anything invalid. `source`: 'search' (typed) | 'device' (shared location, snapped to the
 * nearest place). `regionId` is the region the place belongs to when it was chosen.
 */
export function normalizeSelection(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 80) : '';
  if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const updatedAt = Number(raw.updatedAt);
  return {
    label,
    lat: round3(lat),
    lon: round3(lon),
    radiusKm: snapRadius(raw.radiusKm),
    regionId: isRegionSlug(raw.regionId) ? raw.regionId : null,
    source: raw.source === 'device' ? 'device' : 'search',
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.round(updatedAt) : 0,
  };
}

export function readPlaceSelection(storage) {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    const text = store?.getItem(PLACE_SELECTION_KEY);
    return text ? normalizeSelection(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

export function writePlaceSelection(selection, storage) {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    if (!store) return;
    if (selection) store.setItem(PLACE_SELECTION_KEY, JSON.stringify(selection));
    else store.removeItem(PLACE_SELECTION_KEY);
  } catch {
    // ignore: remembering the place is a convenience only
  }
}

/**
 * The radius the calendar filters by, or null when it must not apply: no selection, a
 * combined view, or another region than the one the place belongs to (somebody who opened
 * `/tirol` by hand sees Tirol, not a circle around Bregenz), or fewer than two active regions
 * (dark launch: nothing visible changes).
 */
export function activeRadiusFilter(selection, { regionId, isNational = false, activeCount = 0 }) {
  if (!selection || isNational || activeCount < 2) return null;
  if (selection.regionId && selection.regionId !== regionId) return null;
  return { lat: selection.lat, lon: selection.lon, km: selection.radiusKm };
}

/**
 * Which selection wins when the browser and the profile both have one: the newer. Used on
 * sign-in by PlaceSelectionSync; returns `{ selection, writeProfile, writeLocal }`.
 */
export function reconcileSelections(local, remote) {
  if (!local && !remote) return { selection: null, writeProfile: false, writeLocal: false };
  if (!remote) return { selection: local, writeProfile: true, writeLocal: false };
  if (!local) return { selection: remote, writeProfile: false, writeLocal: true };
  if (local.updatedAt > remote.updatedAt) {
    return { selection: local, writeProfile: true, writeLocal: false };
  }
  const same =
    local.lat === remote.lat &&
    local.lon === remote.lon &&
    local.radiusKm === remote.radiusKm &&
    local.label === remote.label;
  return { selection: remote, writeProfile: false, writeLocal: !same };
}

/**
 * Region a search hit belongs to: a region hit is the region itself, a place goes through its
 * district and the CURRENT assignment (Verwaltung -> "Zuordnung"), else its Bundesland / Kanton.
 * `regions` is the merged register. Returns a region id or null.
 */
export function regionIdForEntry(entry, regions) {
  if (!entry) return null;
  if (entry.kind === 'region') return entry.regionId;
  const byId = new Map(regions.map((r) => [r.id, r]));
  if (entry.districtKey) {
    const holder = byId.get(currentAssignment(regions).get(entry.districtKey));
    if (holder) return holder.id;
    const state = CATALOG_BY_KEY.get(entry.districtKey)?.stateSlug;
    if (byId.has(state)) return state;
  }
  return byId.has(entry.stateSlug) ? entry.stateSlug : null;
}

/** "Bregenz · 25 km": the short label for buttons. */
export function selectionLabel(selection) {
  return selection ? `${selection.label} · ${selection.radiusKm} km` : '';
}
