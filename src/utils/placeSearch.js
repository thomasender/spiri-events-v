import { CATALOG_BY_KEY } from './regionMapping.js';
import { foldSearchText } from './regionSearch.js';
import { COUNTRY_LABELS, getRegionBySlug, isLegacyBezirk } from './regions.js';

// "Wo bist du?": place search, distances and the radius filter. Pure, free of Firebase and
// React imports (the build script and the tests import it too). The data is the bundled
// `src/data/placeIndex.json` (scripts/build-place-index.mjs), so no third-party service is
// ever called. Positions are only as exact as the place list: a Gemeinde / Ort, never a
// street address.

export const MAX_PLACE_RESULTS = 8;
// How far from the region centre the Ort of an event with a legacy pseudo-Bezirk ("Grenznahe")
// may lie (see eventPosition).
export const LEGACY_NAMESAKE_KM = 40;
const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km between two lat/lon points (degrees). */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Turns the raw JSON of placeIndex.json into the lookup structure used below.
 * `raw.places` rows are [name, lat, lon, stateIndex, districtIndex | -1, postcodeCount].
 */
export function preparePlaceIndex(raw) {
  const states = (raw?.states ?? []).map(([slug, lat, lon]) => ({ slug, lat, lon }));
  const districts = (raw?.districts ?? []).map(([key, lat, lon]) => ({ key, lat, lon }));
  const places = (raw?.places ?? []).map(([name, lat, lon, si, di, size]) => {
    const state = states[si];
    const district = di >= 0 ? districts[di] : null;
    return {
      kind: 'place',
      name,
      lat,
      lon,
      stateSlug: state?.slug ?? null,
      districtKey: district?.key ?? null,
      // postcodes of the place: a stand-in for its size
      size: size ?? 1,
      country: getRegionBySlug(state?.slug)?.country ?? null,
      key: foldSearchText(name),
      // "Lindau (Bodensee)" is also found as "Lindau".
      plainKey: foldSearchText(name.replace(/\([^)]*\)/g, ' ')),
    };
  });
  const districtByKey = new Map(districts.map((d) => [d.key, d]));
  const stateBySlug = new Map(states.map((s) => [s.slug, s]));
  const byName = new Map();
  for (const p of places) {
    for (const key of new Set([p.key, p.plainKey])) {
      const list = byName.get(key) ?? [];
      list.push(p);
      byName.set(key, list);
    }
  }
  return { places, districtByKey, stateBySlug, byName };
}

/**
 * Entries for the regions themselves ("Allgäu", "Vorarlberg"): the centre of a region is the
 * mean of the centres of its districts (current assignment), so a cultural region of Germany
 * is searchable even though it has no place of its own. `regions` is the merged register.
 */
export function buildRegionEntries(index, regions) {
  const entries = [];
  for (const region of regions ?? []) {
    let lat = 0;
    let lon = 0;
    let n = 0;
    for (const name of region.bezirke ?? []) {
      const d = index.districtByKey.get(`${region.country}|${name}`);
      if (!d) continue;
      lat += d.lat;
      lon += d.lon;
      n += 1;
    }
    if (n === 0) {
      const state = index.stateBySlug.get(region.slug);
      if (!state) continue;
      lat = state.lat;
      lon = state.lon;
      n = 1;
    }
    entries.push({
      kind: 'region',
      name: region.name,
      lat: Math.round((lat / n) * 1000) / 1000,
      lon: Math.round((lon / n) * 1000) / 1000,
      regionId: region.slug,
      country: region.country,
      key: foldSearchText(region.name),
      order: region.order ?? 0,
    });
  }
  return entries;
}

// 0 exact, 1 starts with, 2 a later word starts with, 3 contains; null = no match.
function rank(key, q) {
  if (key === q) return 0;
  if (key.startsWith(q)) return 1;
  if (key.includes(` ${q}`)) return 2;
  if (key.includes(q)) return 3;
  return null;
}

/**
 * Search as you type over regions and places. Better match first, then regions before
 * places, then bigger places (more postcodes) before small ones, then Austria / Switzerland /
 * Germany, then name. Places with the
 * same name are told apart by their district (see `placeDetail`).
 */
export function searchPlaces(index, regionEntries, query, limit = MAX_PLACE_RESULTS) {
  const q = foldSearchText(query);
  if (q.length < 2 || !index) return [];
  const hits = [];
  for (const entry of regionEntries ?? []) {
    const r = rank(entry.key, q);
    if (r !== null) hits.push({ entry, r, group: 0 });
  }
  for (const entry of index.places) {
    const a = rank(entry.key, q);
    const b = rank(entry.plainKey, q);
    const r = a === null ? b : b === null ? a : Math.min(a, b);
    if (r !== null) hits.push({ entry, r, group: 1 });
  }
  const countryOrder = { AT: 0, CH: 1, LI: 2, DE: 3 };
  hits.sort(
    (a, b) =>
      a.r - b.r ||
      a.group - b.group ||
      (b.entry.size ?? 0) - (a.entry.size ?? 0) ||
      (countryOrder[a.entry.country] ?? 3) - (countryOrder[b.entry.country] ?? 3) ||
      a.entry.name.length - b.entry.name.length ||
      a.entry.name.localeCompare(b.entry.name, 'de')
  );
  return hits.slice(0, limit).map((h) => h.entry);
}

/** "Bezirk Bregenz, Österreich" / "Region" line under a search hit. */
export function placeDetail(entry) {
  const country = COUNTRY_LABELS[entry.country] ?? '';
  if (entry.kind === 'region') return ['Region', country].filter(Boolean).join(', ');
  const district = entry.districtKey ? CATALOG_BY_KEY.get(entry.districtKey)?.name : null;
  const state = getRegionBySlug(entry.stateSlug)?.name;
  return [district && district !== entry.name ? district : null, state, country]
    .filter(Boolean)
    .filter((part, i, all) => all.indexOf(part) === i)
    .join(', ');
}

/**
 * The place a position belongs to (GPS -> a named place), or null. The nearest place of the
 * list can be a suburb ("Pradl"); among the places that are at most `townKm` farther than the
 * nearest one the biggest wins, so the position of a city centre becomes "Innsbruck".
 * `filter` (optional) limits the candidates (e.g. to one country).
 */
export function nearestPlace(index, lat, lon, maxKm = 30, townKm = 4, filter = null) {
  if (!index || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const near = [];
  let bestKm = Infinity;
  for (const p of index.places) {
    if (filter && !filter(p)) continue;
    // Cheap pre-check before the trigonometry: about 0.35 degrees is 39 km.
    if (Math.abs(p.lat - lat) > 0.35) continue;
    const km = haversineKm(lat, lon, p.lat, p.lon);
    if (km <= maxKm) near.push({ p, km });
    if (km < bestKm) bestKm = km;
  }
  if (near.length === 0) return null;
  return near
    .filter((c) => c.km <= bestKm + townKm)
    .reduce((best, c) => (c.p.size > best.p.size ? c : best)).p;
}

/**
 * Position of an event from its Ort and Bezirk (Gemeinde accuracy), `{ lat, lng }` or null.
 *   1. a place of the same name in the event's Bezirk / Landkreis,
 *   2. else a place of that name in the event's region (nearest to the Bezirk when several),
 *   3. else the centre of the Bezirk, 4. else the centre of the Bundesland / Kanton.
 * Online events have no position. The event's own `regionId` can be a cultural region, so
 * its Bundesland / Kanton is read from the districts it holds.
 */
export function eventPosition(event, index, regions = []) {
  if (!event || event.isOnline || !index) return null;
  const city = foldSearchText(event.city);
  const bezirk = typeof event.bezirk === 'string' ? event.bezirk.trim() : '';
  const region = regions.find((r) => r.id === event.regionId || r.slug === event.regionId);
  const country = region?.country ?? 'AT';

  const districtKeys = new Set();
  const bezirks = bezirk && !isLegacyBezirk(bezirk) ? [bezirk] : [];
  for (const name of bezirks) districtKeys.add(`${country}|${name}`);
  const stateSlugs = new Set();
  if (region) {
    stateSlugs.add(region.slug);
    for (const name of region.bezirke ?? []) {
      const key = `${country}|${name}`;
      const st = CATALOG_BY_KEY.get(key)?.stateSlug;
      if (st) stateSlugs.add(st);
    }
  }

  const candidates = city ? (index.byName.get(city) ?? []) : [];
  const inDistrict = candidates.filter((p) => p.districtKey && districtKeys.has(p.districtKey));
  const inRegion = candidates.filter((p) => p.stateSlug && stateSlugs.has(p.stateSlug));
  let pick = inDistrict[0] ?? inRegion[0];

  const centre = (() => {
    for (const key of districtKeys) {
      const d = index.districtByKey.get(key);
      if (d) return { lat: d.lat, lon: d.lon };
    }
    for (const slug of stateSlugs) {
      const st = index.stateBySlug.get(slug);
      if (st) return { lat: st.lat, lon: st.lon };
    }
    return null;
  })();

  // An Ort outside the region's own districts ("Vaduz" for Vorarlberg's "Grenznahe", or no
  // Bezirk at all): the namesake nearest to the region. "Grenznahe" means right across the
  // border, so a namesake farther than LEGACY_NAMESAKE_KM away is not it (an old "Lindau" event
  // of Vorarlberg must not land in Lindau ZH now that German places are not in the list):
  // the region centre instead.
  if (!pick && candidates.length > 0 && bezirks.length === 0 && centre) {
    const km = (p) => haversineKm(p.lat, p.lon, centre.lat, centre.lon);
    const nearest = candidates.reduce((best, p) => (km(p) < km(best) ? p : best));
    if (!isLegacyBezirk(bezirk) || km(nearest) <= LEGACY_NAMESAKE_KM) pick = nearest;
  }
  if (pick) return { lat: pick.lat, lng: pick.lon };
  return centre ? { lat: centre.lat, lng: centre.lon } : null;
}

/** An event's stored position as numbers, else null. */
export function storedEventPosition(event) {
  const lat = Number(event?.lat);
  const lng = Number(event?.lng);
  if (event?.lat == null || event?.lng == null) return null;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * Radius filter of the calendar: online events always stay; an event with a stored position
 * stays when it lies within `km` of the centre; an event WITHOUT a position (written before
 * positions existed, or no place found) stays only when it belongs to `regionId`, i.e. exactly
 * what the region filter showed before.
 */
export function filterEventsByRadius(events, { lat, lon, km, regionId = null }) {
  if (!Array.isArray(events)) return [];
  return events.filter((event) => {
    if (event.isOnline) return true;
    const pos = storedEventPosition(event);
    if (!pos) return regionId ? event.regionId === regionId : true;
    return haversineKm(lat, lon, pos.lat, pos.lng) <= km;
  });
}
