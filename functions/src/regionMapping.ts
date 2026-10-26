/**
 * Landkreis / Bezirk -> region mapping for Cloud Functions. functions/ cannot
 * import from src/, so this is a synced copy of src/utils/regionMapping.js
 * (districtCatalog, planMappingChange) plus the register merge of
 * src/utils/regions.js (mergeRegions, only the fields the mapping needs).
 * KEEP BOTH IN SYNC: tests/lib/functionsRegionMapping.spec.ts runs the same
 * cases against both copies.
 */
import { REGION_DATA } from './regionData';

/** Not a real district: Vorarlberg keeps it for existing events. Never moved. */
export const FIXED_DISTRICTS: readonly string[] = ['Grenznahe'];

export interface CatalogDistrict {
  key: string;
  country: string;
  stateSlug: string;
  stateName: string;
  name: string;
}

/** The immutable backend structure: districts of the 51 Bundeslaender / Kantone. */
export const DISTRICT_CATALOG: readonly CatalogDistrict[] = REGION_DATA.filter(
  (r) => r.home
).flatMap((state) =>
  state.bezirke
    .filter((name) => !FIXED_DISTRICTS.includes(name))
    .map((name) => ({
      key: `${state.country}|${name}`,
      country: state.country,
      stateSlug: state.slug,
      stateName: state.name,
      name,
    }))
);
const CATALOG_INDEX = new Map(DISTRICT_CATALOG.map((d, i) => [d.key, i]));
export const CATALOG_BY_KEY = new Map(DISTRICT_CATALOG.map((d) => [d.key, d]));

export interface MappingRegion {
  id: string;
  name: string;
  country: string;
  active: boolean;
  order: number;
  bezirke: string[];
}

type Doc = Record<string, unknown>;

/**
 * Static register overlaid with `regions/{id}` docs, like mergeRegions on the
 * client: an empty `bezirke` list only counts when the mapping tool wrote it
 * (`mappingUpdatedAt`).
 */
export function buildMappingRegisters(docs: Array<{ id: string; data: Doc }>): MappingRegion[] {
  const byId = new Map(docs.map((d) => [d.id, d.data]));
  return REGION_DATA.map((r, order) => {
    const d = byId.get(r.slug);
    const bezirke =
      d && Array.isArray(d.bezirke) && (d.bezirke.length > 0 || d.mappingUpdatedAt)
        ? (d.bezirke as string[])
        : [...r.bezirke];
    return {
      id: r.slug,
      name: typeof d?.name === 'string' && d.name ? d.name : r.name,
      country: r.country,
      active: typeof d?.active === 'boolean' ? d.active : r.slug === 'vorarlberg',
      order: typeof d?.order === 'number' ? d.order : order,
      bezirke,
    };
  });
}

export interface MappingMove {
  districtKey: string;
  toRegionId: string;
}

export type MappingError =
  | { code: 'unknown-district' | 'fixed-district'; districtKey: unknown }
  | { code: 'unknown-region'; regionId: unknown }
  | { code: 'wrong-country'; districtKey: string; regionId: string }
  | { code: 'would-empty-active-region'; regionId: string };

export interface MappingChange {
  regionId: string;
  name: string;
  before: string[];
  after: string[];
  added: string[];
  removed: string[];
}

export function currentAssignment(regions: readonly MappingRegion[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const region of regions) {
    for (const name of region.bezirke) {
      const key = `${region.country}|${name}`;
      if (!map.has(key)) map.set(key, region.id);
    }
  }
  return map;
}

function sortDistricts(country: string, names: Iterable<string>): string[] {
  const rank = (n: string) => CATALOG_INDEX.get(`${country}|${n}`) ?? Number.MAX_SAFE_INTEGER;
  return [...names].sort((a, b) => rank(a) - rank(b));
}

export function planMappingChange(
  regions: readonly MappingRegion[],
  moves: readonly MappingMove[]
): { changes: MappingChange[]; errors: MappingError[] } {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const assignment = currentAssignment(regions);
  const errors: MappingError[] = [];
  const target = new Map<string, string>();
  for (const move of moves) {
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

  const next = new Map(regions.map((r) => [r.id, new Set(r.bezirke)]));
  for (const [key, toId] of target) {
    const district = CATALOG_BY_KEY.get(key) as CatalogDistrict;
    const fromId = assignment.get(key);
    if (fromId === toId) continue;
    if (fromId) next.get(fromId)?.delete(district.name);
    next.get(toId)?.add(district.name);
  }

  const changes: MappingChange[] = [];
  for (const region of regions) {
    const before = region.bezirke;
    const after = sortDistricts(
      region.country,
      [...(next.get(region.id) as Set<string>)].filter((n) => !FIXED_DISTRICTS.includes(n))
    );
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
