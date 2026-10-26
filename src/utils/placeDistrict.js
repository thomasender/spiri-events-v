import { CATALOG_BY_KEY } from './regionMapping.js';
import { searchPlaces } from './placeSearch.js';
import { foldSearchText } from './regionSearch.js';

// Ort -> Bezirk / Landkreis for the event forms of regions without a Gemeinde list. Pure,
// offline: it only reads the prepared place list (`preparePlaceIndex`). `region` is a merged
// register entry ({ slug, country, bezirke }); the district of a place counts only when it is
// one of the region's own `bezirke` (current assignment), otherwise the answer is null and the
// person chooses.

const SUGGESTION_LIMIT = 8;

/** Name of the district a place lies in, only if the region holds it; else null. */
export function districtForEntry(entry, region) {
  if (!entry?.districtKey || !region) return null;
  const name = CATALOG_BY_KEY.get(entry.districtKey)?.name;
  return name && (region.bezirke ?? []).includes(name) ? name : null;
}

// A place belongs to the region when its district is one of the region's Bezirke, or (no
// district known) when it lies in the region's own Bundesland / Kanton.
function inRegion(entry, region) {
  if (entry.districtKey) {
    const d = CATALOG_BY_KEY.get(entry.districtKey);
    return Boolean(d && d.country === region.country && (region.bezirke ?? []).includes(d.name));
  }
  return entry.stateSlug === region.slug;
}

/**
 * Suggestions while typing the Ort: places of the region only, best match first, bigger places
 * (more postcodes) before small ones.
 */
export function suggestRegionPlaces(index, region, query, limit = SUGGESTION_LIMIT) {
  if (!index || !region) return [];
  return searchPlaces(index, [], query, index.places.length)
    .filter((entry) => entry.kind === 'place' && inRegion(entry, region))
    .slice(0, limit);
}

/**
 * The Bezirk / Landkreis for an Ort typed or picked by name: the district name when all places
 * of that name inside the region lie in ONE district of the region, else null (unknown place,
 * no district, or ambiguous like "Neustadt"). Never chooses between different districts.
 */
export function districtForCity(index, region, city) {
  const key = foldSearchText(city);
  if (!index || !region || !key) return null;
  const candidates = (index.byName.get(key) ?? []).filter((p) => inRegion(p, region));
  if (candidates.length === 0) return null;
  const names = new Set(candidates.map((p) => districtForEntry(p, region)));
  return names.size === 1 ? [...names][0] : null;
}

/**
 * Bezirk for a place the person picked from the suggestions. A name shared with another place
 * of a different district in the region ("Neustadt") stays empty, even though this entry
 * itself has a district.
 */
export function districtForPick(index, region, entry) {
  const own = districtForEntry(entry, region);
  if (!own) return null;
  return districtForCity(index, region, entry.name) === own ? own : null;
}
