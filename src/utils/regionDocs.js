// Pure planning for the `regions/{id}` docs against the register in code (the three CSVs in
// scripts/data/regions/, generated into src/data/regionData.js). Used by
// scripts/seed-regions.mjs and scripts/cleanup-region-docs.mjs; no Firebase imports, so
// Vitest covers it (tests/components/regionDocs.spec.ts).
import {
  DEFAULT_REGION_ID,
  LEGACY_REGION_ALIASES,
  STATIC_REGIONS,
  isRegionSlug,
} from './regions.js';

// Keys a `regions/{id}` doc may carry from before the CSV register that nothing reads any
// more: names, ids, districts and wording come from the register, custom regions no longer
// exist. firestore.rules still tolerates the first four in an old doc (never writes them).
export const STALE_REGION_FIELDS = Object.freeze([
  'name',
  'slug',
  'bezirke',
  'mappingUpdatedAt',
  'custom',
  'country',
  'inPhrase',
  'forPhrase',
  'demonym',
  'subdivisionLabel',
]);

/** The fields a NEW region doc gets (only switches and texts; inactive except Vorarlberg). */
export function newRegionDoc(region) {
  return {
    active: region.id === DEFAULT_REGION_ID,
    contactEmail: '',
    seo: { title: '', description: '' },
    // Europe/Vienna, Europe/Zurich or Europe/Vaduz (informational).
    timezone: region.timezone,
  };
}

/**
 * seed-regions: what to do with the existing docs ([{ id, data }]) so every register region
 * has a doc and every other doc is switched off. Admin-maintained fields (active, contact,
 * seo, texts, about, instagram, timezone) of an existing doc are never changed; only missing
 * ones are filled in. Docs of former regions are never deleted, only set `active: false`.
 * Returns { create: [{ id, data }], complete: [{ id, data }], deactivate: [id], retired: [id] }.
 */
export function planRegionSeed(existing, register = STATIC_REGIONS) {
  const byId = new Map((existing ?? []).map((d) => [d.id, d.data ?? {}]));
  const create = [];
  const complete = [];
  for (const region of register) {
    const desired = newRegionDoc(region);
    const data = byId.get(region.id);
    if (!data) {
      create.push({ id: region.id, data: desired });
      continue;
    }
    const missing = Object.fromEntries(Object.entries(desired).filter(([k]) => !(k in data)));
    if (Object.keys(missing).length) complete.push({ id: region.id, data: missing });
  }
  const live = new Set(register.map((r) => r.id));
  const retired = [...byId.keys()].filter((id) => !live.has(id)).sort();
  const deactivate = retired.filter((id) => byId.get(id).active !== false);
  return { create, complete, deactivate, retired };
}

/** Stale keys present in one region doc. */
export const staleRegionFields = (data) => STALE_REGION_FIELDS.filter((k) => k in (data ?? {}));

const isValidStoredRegionId = (id) => isRegionSlug(LEGACY_REGION_ALIASES[id] ?? id);

/**
 * Region ids of a doc that point to no region of the register (a former region such as
 * `bayern` or `luzern`). `field` is a string field (`regionId`) or a list field
 * (`directoryRegionIds`, `regionIds`). A missing field is fine (= Vorarlberg).
 */
export function unknownRegionIds(data, field) {
  const value = data?.[field];
  if (value === undefined || value === null || value === '') return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((id) => typeof id !== 'string' || !isValidStoredRegionId(id));
}
