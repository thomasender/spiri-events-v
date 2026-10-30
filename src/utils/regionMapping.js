import { LEGACY_BEZIRKE, STATIC_REGIONS } from './regions.js';

// Landkreis / Bezirk catalogue and the district -> region assignment, both defined
// only in code (the generated register, src/data/regionData.js). Nothing is editable
// at runtime. Pure, free of Firebase/React imports.

// Not real districts: legacy pseudo-Bezirke (Vorarlberg's "Grenznahe") that only old events
// carry. Not in the catalogue, never moved, kept where they are.
export const FIXED_DISTRICTS = Object.freeze(Object.values(LEGACY_BEZIRKE).flat());

/**
 * The immutable backend structure: [{ key, country, stateSlug, stateName, name }]
 * in register order (state by state). `key` = "<country>|<name>"; names are
 * unique within a country (guarded by tests).
 */
export function districtCatalog(base = STATIC_REGIONS) {
  const out = [];
  for (const state of base) {
    if (!state.home) continue;
    for (const name of state.bezirke) {
      if (FIXED_DISTRICTS.includes(name)) continue;
      out.push({
        key: `${state.country}|${name}`,
        country: state.country,
        stateSlug: state.slug,
        stateName: state.name,
        name,
      });
    }
  }
  return out;
}

const CATALOG = districtCatalog();
export const CATALOG_BY_KEY = new Map(CATALOG.map((d) => [d.key, d]));
export const DISTRICT_CATALOG = Object.freeze(CATALOG);

/** district key -> id of the region that holds it (first one wins on duplicates). */
export function currentAssignment(regions) {
  const map = new Map();
  for (const region of regions) {
    for (const name of region.bezirke ?? []) {
      const key = `${region.country}|${name}`;
      if (!map.has(key)) map.set(key, region.id);
    }
  }
  return map;
}
