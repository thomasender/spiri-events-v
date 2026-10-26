import { STATIC_REGIONS } from './regions.js';

// Landkreis / Bezirk -> region mapping (Verwaltung -> "Zuordnung").
//
// The BACKEND STRUCTURE is fixed and never editable: the districts of the 51
// Bundeslaender / Kantone (`home: true` entries of the generated register).
// What the product owner edits is only the ASSIGNMENT of those districts to
// regions. The assignment lives in `regions/{id}.bezirke`; every district belongs
// to exactly one region of its country. Moving a district never touches events;
// the callable refuses a move while the district still has events (see
// functions/src/adminRegionMapping.ts, which holds a synced copy of planMappingChange).
// Pure, free of Firebase/React imports.

// Not a real district: Vorarlberg keeps it for existing events. Never moved.
export const FIXED_DISTRICTS = Object.freeze(['Grenznahe']);

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
const CATALOG_INDEX = new Map(CATALOG.map((d, i) => [d.key, i]));
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

/**
 * Health of the assignment: districts of the catalogue held by no region
 * (`unassigned`), by several (`duplicates`) and names no catalogue knows
 * (`unknown`, ignoring the fixed pseudo districts). `ok` = all empty.
 */
export function checkMapping(regions) {
  const holders = new Map();
  const unknown = [];
  for (const region of regions) {
    for (const name of region.bezirke ?? []) {
      if (FIXED_DISTRICTS.includes(name)) continue;
      const key = `${region.country}|${name}`;
      if (!CATALOG_BY_KEY.has(key)) {
        unknown.push({ regionId: region.id, name });
        continue;
      }
      (holders.get(key) ?? holders.set(key, []).get(key)).push(region.id);
    }
  }
  const unassigned = DISTRICT_CATALOG.filter((d) => !holders.has(d.key));
  const duplicates = [...holders.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, regionIds]) => ({ ...CATALOG_BY_KEY.get(key), regionIds }));
  return {
    unassigned,
    duplicates,
    unknown,
    ok: !unassigned.length && !duplicates.length && !unknown.length,
  };
}

// Deterministic order of a region's districts: catalogue order (state by state),
// legacy pseudo districts last.
function sortDistricts(country, names) {
  const rank = (n) => CATALOG_INDEX.get(`${country}|${n}`) ?? Number.MAX_SAFE_INTEGER;
  return [...names].sort((a, b) => rank(a) - rank(b));
}

/**
 * Applies moves to the register and reports what changes. `moves`:
 * [{ districtKey, toRegionId }]. Pure; returns
 * { changes: [{ regionId, name, before, after, added, removed }], errors: [{ code, ... }] }.
 * Error codes: unknown-district, fixed-district, unknown-region, wrong-country,
 * would-empty-active-region. Nothing is returned as `changes` when there is any error.
 */
export function planMappingChange(regions, moves) {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const assignment = currentAssignment(regions);
  const errors = [];
  const target = new Map(); // district key -> region id (last move wins)
  for (const move of moves ?? []) {
    const district = CATALOG_BY_KEY.get(move?.districtKey);
    if (!district) {
      errors.push({
        code: FIXED_DISTRICTS.includes(String(move?.districtKey).split('|')[1])
          ? 'fixed-district'
          : 'unknown-district',
        districtKey: move?.districtKey,
      });
      continue;
    }
    const to = byId.get(move.toRegionId);
    if (!to) {
      errors.push({ code: 'unknown-region', regionId: move.toRegionId });
      continue;
    }
    if (to.country !== district.country) {
      errors.push({ code: 'wrong-country', districtKey: district.key, regionId: to.id });
      continue;
    }
    target.set(district.key, to.id);
  }

  const next = new Map(regions.map((r) => [r.id, new Set(r.bezirke ?? [])]));
  for (const [key, toId] of target) {
    const district = CATALOG_BY_KEY.get(key);
    const fromId = assignment.get(key);
    if (fromId === toId) continue;
    if (fromId) next.get(fromId)?.delete(district.name);
    next.get(toId).add(district.name);
  }

  const changes = [];
  for (const region of regions) {
    const before = region.bezirke ?? [];
    const after = sortDistricts(
      region.country,
      [...next.get(region.id)].filter((n) => !FIXED_DISTRICTS.includes(n))
    );
    // Pseudo districts (Grenznahe) stay where they are, at the end.
    const fixed = before.filter((n) => FIXED_DISTRICTS.includes(n));
    const afterAll = [...after, ...fixed];
    const added = afterAll.filter((n) => !before.includes(n));
    const removed = before.filter((n) => !afterAll.includes(n));
    if (!added.length && !removed.length) continue;
    if (region.active && afterAll.length === 0) {
      errors.push({ code: 'would-empty-active-region', regionId: region.id });
    }
    changes.push({
      regionId: region.id,
      name: region.name,
      before,
      after: afterAll,
      added,
      removed,
    });
  }
  return errors.length ? { changes: [], errors } : { changes, errors };
}

/** Plain German text for a planMappingChange error (shown to the product owner). */
export function mappingErrorMessage(error, regions = STATIC_REGIONS) {
  const name = (id) => regions.find((r) => r.id === id)?.name ?? id;
  switch (error?.code) {
    case 'would-empty-active-region':
      return `${name(error.regionId)} ist aktiv und braucht mindestens einen Landkreis / Bezirk.`;
    case 'wrong-country':
      return 'Landkreise und Bezirke können nur Regionen im selben Land zugeordnet werden.';
    case 'fixed-district':
      return 'Dieser Eintrag ist fest und kann nicht verschoben werden.';
    case 'events-in-district':
      return `In ${error.district} gibt es schon Events. Solche Landkreise lassen sich noch nicht verschieben.`;
    default:
      return 'Diese Zuordnung ist nicht möglich.';
  }
}
