// Helpers for the Landkreis map (src/data/landkreisMap.json, keyed by DISTRICT_CATALOG key
// "DE|<name>"). Pure, used by CultureRegionPicker (Verwaltung) and RegionMap (visitors).

/**
 * Groups the Landkreis shapes by the region `groupOf(key)` returns (null = no region).
 * Returns [{ id, keys, d }] with `d` = all paths of the group joined (for the outline),
 * the group without region first, the others in order of appearance.
 */
export function groupDistrictShapes(districts, groupOf) {
  const groups = new Map();
  for (const [key, shape] of Object.entries(districts)) {
    const id = groupOf(key) ?? null;
    if (!groups.has(id)) groups.set(id, { id, keys: [], parts: [] });
    const g = groups.get(id);
    g.keys.push(key);
    g.parts.push(shape.d);
  }
  return [...groups.values()]
    .sort((a, b) => Number(a.id !== null) - Number(b.id !== null))
    .map(({ id, keys, parts }) => ({ id, keys, d: parts.join('') }));
}

/**
 * District key -> slug of the region that lists it, for Germany, from the regions as the
 * register holds them now (current names and assignment). First region wins.
 */
export function germanDistrictHolders(regions) {
  const holders = new Map();
  for (const region of regions) {
    if (region.country !== 'DE') continue;
    for (const name of region.bezirke ?? []) {
      const key = `DE|${name}`;
      if (!holders.has(key)) holders.set(key, region.slug);
    }
  }
  return holders;
}

/**
 * The Landkreis map (viewBox 539.7 x 720.8, shapes from x/y 10) and the Bundesland map of
 * Germany, Austria and Switzerland (src/data/regionMap.js, viewBox 1000 wide) use nearly the
 * same projection. This matrix places the Landkreis shapes exactly over the German part of
 * the Bundesland map (outer edge of Germany to outer edge of Germany), so one map can show
 * the Landkreis-based Kulturregionen next to Austria and Switzerland.
 */
export const LANDKREIS_TO_DACH = { a: 1.5358, d: 1.5184, e: -7.358, f: -7.184 };
export const LANDKREIS_TO_DACH_TRANSFORM = `matrix(${LANDKREIS_TO_DACH.a} 0 0 ${LANDKREIS_TO_DACH.d} ${LANDKREIS_TO_DACH.e} ${LANDKREIS_TO_DACH.f})`;

const COUNTRY_NAMES = { AT: 'Österreich', CH: 'Schweiz', DE: 'Deutschland' };

/**
 * Soft country names for the map: [{ country, name, x, y }], placed at the area-weighted
 * centre of the country's Bundesland / Kanton shapes (`mapRegions` = REGION_MAP.regions with
 * cx, cy, area; `regions` = the register regions, which say the country of each slug).
 */
export function countryLabels(mapRegions, regions) {
  const countryOf = new Map(regions.map((r) => [r.slug, r.country]));
  const sums = new Map();
  for (const shape of mapRegions) {
    const country = countryOf.get(shape.id);
    if (!COUNTRY_NAMES[country]) continue;
    const s = sums.get(country) ?? { x: 0, y: 0, area: 0 };
    s.x += shape.cx * shape.area;
    s.y += shape.cy * shape.area;
    s.area += shape.area;
    sums.set(country, s);
  }
  return [...sums.entries()].map(([country, s]) => ({
    country,
    name: COUNTRY_NAMES[country],
    x: Math.round((s.x / s.area) * 10) / 10,
    y: Math.round((s.y / s.area) * 10) / 10,
  }));
}
