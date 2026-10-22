import { foldSearchText } from './regionSearch.js';

export const MAX_CULTURE_HITS = 8;

/**
 * Autocomplete for the culture region picker: matches a region by its name or by one of
 * the districts it holds right now ("Leer" -> Ostfriesland). Region name hits rank before
 * district hits, prefix matches before the rest. Pure.
 * `regions`: [{ id, name }], `districtsOf(regionId)`: [{ key, name }].
 */
export function searchCultureRegions(regions, districtsOf, query, limit = MAX_CULTURE_HITS) {
  const q = foldSearchText(query);
  if (!q) return [];
  const hits = [];
  for (const region of regions) {
    const idx = foldSearchText(region.name).indexOf(q);
    if (idx >= 0) {
      hits.push({ region, via: null, rank: idx === 0 ? 0 : 1 });
      continue;
    }
    const district = districtsOf(region.id).find((d) => foldSearchText(d.name).includes(q));
    if (district) {
      hits.push({
        region,
        via: district.name,
        rank: foldSearchText(district.name).startsWith(q) ? 2 : 3,
      });
    }
  }
  return hits.sort((a, b) => a.rank - b.rank).slice(0, limit);
}
