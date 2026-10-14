/**
 * Region helpers for Cloud Functions. functions/ cannot import from src/, so
 * resolveRegionId is a small copy of src/utils/regions.js. KEEP BOTH IN SYNC:
 * tests/components/regions.spec.ts and tests/lib/functionsRegions.spec.ts run
 * the same cases against the two copies.
 */

export const DEFAULT_REGION_ID = 'vorarlberg';

/**
 * The nine Bundeslaender plus the Allgäu (pilot region in Bavaria), same
 * order as REGION_SLUGS in src/utils/regions.js and regionIds() in
 * firestore.rules (guarded by tests/lib/functionsRegions.spec.ts).
 */
export const REGION_IDS: readonly string[] = [
  'vorarlberg',
  'tirol',
  'salzburg',
  'kaernten',
  'steiermark',
  'oberoesterreich',
  'niederoesterreich',
  'wien',
  'burgenland',
  'allgaeu',
];

export function isRegionId(value: unknown): value is string {
  return typeof value === 'string' && REGION_IDS.includes(value);
}

/**
 * Regions whose events the Instagram automation (feed post on approval, weekly
 * carousel, preview, manual post) may publish. The Instagram account belongs to
 * Vorarlberg. To support another region later, add its id here AND make sure it
 * has its own account/token (today there is exactly one account); until then
 * events of other regions must never reach it.
 */
export const INSTAGRAM_REGION_IDS: readonly string[] = ['vorarlberg'];

/** Read fallback for documents written before regions existed. */
export function resolveRegionId(doc: unknown): string {
  const regionId = doc && typeof doc === 'object' ? (doc as { regionId?: unknown }).regionId : null;
  return typeof regionId === 'string' && regionId ? regionId : DEFAULT_REGION_ID;
}

/** Online events count by their moderation region (`regionId`), like all others. */
export function isInstagramRegion(event: unknown): boolean {
  return INSTAGRAM_REGION_IDS.includes(resolveRegionId(event));
}
