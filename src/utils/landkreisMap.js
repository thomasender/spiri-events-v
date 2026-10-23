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
