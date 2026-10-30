import { CATALOG_BY_KEY, currentAssignment } from './regionMapping.js';
import { searchPlaces } from './placeSearch.js';
import { regionIdForEntry } from './placeSelection.js';
import { foldSearchText } from './regionSearch.js';
import { findGemeinde } from './gemeinden.js';
import { DEFAULT_REGION_ID } from './regions.js';

// Ort -> Bezirk / Landkreis AND region for the event forms (Trello dx8dCQJc). Pure, offline: it
// only reads the prepared place list (`preparePlaceIndex`) and the merged register (`regions`). The place decides, not the region the
// person is in: "Lindau (Bodensee)" picked on the Vorarlberg page is Landkreis Lindau (Bodensee)
// in the region that holds it. An unknown or ambiguous place gives null: the event then stays
// in the current region with an empty Bezirk (Liechtenstein, outside DACH, free text).

const SUGGESTION_LIMIT = 8;

// A place belongs to the region when its district is one of the region's Bezirke, or (no
// district known) when it lies in the region's own Bundesland / Kanton.
function inRegion(entry, region) {
  if (!region) return false;
  if (entry.districtKey) {
    const d = CATALOG_BY_KEY.get(entry.districtKey);
    return Boolean(d && d.country === region.country && (region.bezirke ?? []).includes(d.name));
  }
  return entry.stateSlug === region.slug;
}

/**
 * `{ regionId, bezirk }` of a place of the list (a picked suggestion): its register district
 * and the region holding that district now. Null for a place without a known district.
 */
export function assignmentForEntry(entry, regions = []) {
  if (!entry || entry.kind !== 'place' || !entry.districtKey) return null;
  const bezirk = CATALOG_BY_KEY.get(entry.districtKey)?.name;
  const regionId = regionIdForEntry(entry, regions);
  return bezirk && regionId ? { regionId, bezirk } : null;
}

/** `{ regionId, bezirk }` of a Vorarlberg Gemeinde (gemeinden.js): its Bezirk, Vorarlberg. */
export function assignmentForGemeinde(gemeinde, regions = []) {
  if (!gemeinde) return null;
  const holder = currentAssignment(regions).get(`AT|${gemeinde.bezirk}`);
  return { regionId: holder ?? DEFAULT_REGION_ID, bezirk: gemeinde.bezirk };
}

/**
 * `{ regionId, bezirk }` for an Ort typed by name, across all regions: a Vorarlberg Gemeinde
 * first, else the places of that name in the list when they all lie in ONE district. Null when
 * the name is unknown, has no district or is ambiguous ("Neustadt"): never chooses.
 */
export function placeAssignment(index, regions, city) {
  const gemeinde = findGemeinde(city);
  if (gemeinde) return assignmentForGemeinde(gemeinde, regions);
  const key = foldSearchText(city);
  if (!index || !key) return null;
  const candidates = (index.byName.get(key) ?? []).filter((p) => p.kind === 'place');
  if (candidates.length === 0) return null;
  const found = candidates.map((p) => assignmentForEntry(p, regions));
  if (found.some((a) => !a)) return null;
  const distinct = new Set(found.map((a) => `${a.regionId}|${a.bezirk}`));
  return distinct.size === 1 ? found[0] : null;
}

/**
 * Suggestions while typing the Ort: places of ALL regions, the current region's own places
 * first, then the rest (best match, bigger places first, see `searchPlaces`). `skip(entry)`
 * leaves entries out (the Vorarlberg picker lists its Gemeinden itself).
 */
export function suggestEventPlaces(index, region, query, { limit = SUGGESTION_LIMIT, skip } = {}) {
  if (!index) return [];
  const hits = searchPlaces(index, [], query, index.places.length).filter(
    (entry) => entry.kind === 'place' && !(skip && skip(entry))
  );
  const own = hits.filter((entry) => inRegion(entry, region));
  const rest = hits.filter((entry) => !inRegion(entry, region));
  return [...own, ...rest].slice(0, limit);
}

/**
 * Hint next to the Ort field when the place puts the event into another region than the one
 * the person is in: an inactive region gets the "not yet open" sentence, an active one a
 * neutral line. Null when it is the same region or unknown.
 */
export function placeRegionHint(placeRegionId, homeRegionId, regions = []) {
  if (!placeRegionId || placeRegionId === homeRegionId) return null;
  const region = regions.find((r) => r.id === placeRegionId);
  if (!region) return null;
  if (!region.active) {
    return `Dieser Ort gehört zur Region ${region.name}, die noch nicht freigeschaltet ist. Dein Event erscheint dort ab der Freischaltung.`;
  }
  return `Dieses Event erscheint in der Region ${region.name}.`;
}

/** German message when the Ort is not one of the known places (QG0GR5lv). */
export const PLACE_PICK_ERROR = 'Bitte wähle einen Ort aus der Liste.';
const PLACE_REQUIRED_ERROR = 'Bitte Ort angeben oder als Online-Event markieren';

/**
 * Error message for the Ort of an in-person event, or null when it is valid. The Ort must be
 * CHOSEN from the known places (suggestions of the place list, Vorarlberg's Gemeinden); free
 * text is not valid. Valid are:
 *  - `picked`: the person chose a suggestion (or the form took over the top suggestion),
 *  - a Vorarlberg Gemeinde by its exact name (also a known place),
 *  - `original`: the stored Ort of the event being edited, unchanged (old events with free
 *    text stay editable; the rule applies only once the Ort is changed).
 */
export function validatePlaceChoice({ city, picked = false, original = '' } = {}) {
  const text = (city || '').trim();
  if (!text) return PLACE_REQUIRED_ERROR;
  if (picked) return null;
  if (findGemeinde(text)) return null;
  if ((original || '').trim() && text === (original || '').trim()) return null;
  return PLACE_PICK_ERROR;
}

/**
 * The place a typed text stands for when the person leaves the field without picking: the TOP
 * suggestion, as `{ city, bezirk, regionId, entry }` (bezirk / regionId like `assignmentForEntry`,
 * a Vorarlberg Gemeinde like `assignmentForGemeinde`). Null when nothing matches.
 */
export function topPlaceChoice(index, region, regions, text) {
  const typed = (text || '').trim();
  if (!typed) return null;
  const gemeinde = findGemeinde(typed);
  if (gemeinde) {
    const found = assignmentForGemeinde(gemeinde, regions);
    return { city: gemeinde.name, bezirk: found.bezirk, regionId: found.regionId, entry: null };
  }
  const entry = suggestEventPlaces(index, region, typed, { limit: 1 })[0];
  if (!entry) return null;
  const found = assignmentForEntry(entry, regions);
  return {
    city: entry.name,
    bezirk: found?.bezirk ?? '',
    regionId: found?.regionId ?? null,
    entry,
  };
}
