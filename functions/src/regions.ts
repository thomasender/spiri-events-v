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

/**
 * Districts (Bezirke / Landkreise) known without Firestore, in the order of
 * DIRECTORY_REGIONS in src/utils/directory.js (all districts of all regions,
 * Vorarlberg first, then "Online"). A directory profile may only name these
 * (plus districts stored in `regions/{id}.bezirke`). Synced copy, guarded by
 * tests/lib/functionsRegions.spec.ts.
 */
export const DIRECTORY_REGIONS: readonly string[] = [
  'Bregenz',
  'Dornbirn',
  'Feldkirch',
  'Bludenz',
  'Grenznahe',
  'Graz',
  'Graz-Umgebung',
  'Bruck-Mürzzuschlag',
  'Deutschlandsberg',
  'Hartberg-Fürstenfeld',
  'Leibnitz',
  'Leoben',
  'Liezen',
  'Murau',
  'Murtal',
  'Südoststeiermark',
  'Voitsberg',
  'Weiz',
  'Oberallgäu',
  'Ostallgäu',
  'Unterallgäu',
  'Lindau (Bodensee)',
  'Ravensburg (Württembergisches Allgäu)',
  'Kempten (Allgäu)',
  'Kaufbeuren',
  'Memmingen',
  'Online',
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

/** Online events are visible in every region (copy of eventVisibleInRegion). */
export function eventVisibleInRegion(event: unknown, regionId: string): boolean {
  const online =
    event && typeof event === 'object' ? (event as { isOnline?: unknown }).isOnline : null;
  if (online) return true;
  return resolveRegionId(event) === regionId;
}

/**
 * Copy of filterEventsForRegion in src/utils/regions.js: events of active
 * regions only; with `regionId` additionally that region's events plus online
 * events. No `regionId` or `isNational`: every event of an active region.
 */
export function filterEventsForRegion<T>(
  events: T[],
  opts: { regionId?: string | null; isNational?: boolean; activeRegionIds?: readonly string[] } = {}
): T[] {
  const { regionId = null, isNational = false, activeRegionIds = [DEFAULT_REGION_ID] } = opts;
  if (!Array.isArray(events)) return [];
  const active = new Set(activeRegionIds);
  const all = isNational || !regionId;
  return events.filter(
    (event) =>
      active.has(resolveRegionId(event)) && (all || eventVisibleInRegion(event, regionId as string))
  );
}

export interface FeedRegion {
  id: string;
  name: string;
  active: boolean;
  bezirke: string[];
  timezone: string;
}

export const DEFAULT_REGION_TIMEZONE = 'Europe/Vienna';

const STATIC_NAMES: Record<string, string> = {
  vorarlberg: 'Vorarlberg',
  tirol: 'Tirol',
  salzburg: 'Salzburg',
  kaernten: 'Kärnten',
  steiermark: 'Steiermark',
  oberoesterreich: 'Oberösterreich',
  niederoesterreich: 'Niederösterreich',
  wien: 'Wien',
  burgenland: 'Burgenland',
  allgaeu: 'Allgäu',
};

/** Bezirke known without Firestore (copy of REGION_BEZIRKE in src/utils/regions.js). */
export const STATIC_REGION_BEZIRKE: Record<string, readonly string[]> = {
  vorarlberg: DIRECTORY_REGIONS.slice(0, 5),
  steiermark: DIRECTORY_REGIONS.slice(5, 18),
  allgaeu: DIRECTORY_REGIONS.slice(18, 26),
};

const STATIC_TIMEZONES: Record<string, string> = { allgaeu: 'Europe/Berlin' };
const TIMEZONE_PATTERN = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2}$/;

/** Static register (only Vorarlberg active), as in STATIC_REGIONS of src/utils/regions.js. */
export const STATIC_FEED_REGIONS: FeedRegion[] = REGION_IDS.map((id) => ({
  id,
  name: STATIC_NAMES[id],
  active: id === DEFAULT_REGION_ID,
  bezirke: [...(STATIC_REGION_BEZIRKE[id] ?? [])],
  timezone: STATIC_TIMEZONES[id] ?? DEFAULT_REGION_TIMEZONE,
}));

/** Lays `regions/{id}` docs ({ id, ...data }) over the static register (copy of mergeRegions). */
export function mergeFeedRegions(docs: unknown[]): FeedRegion[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const d of docs) {
    const doc = d as Record<string, unknown> | null;
    if (doc && isRegionId(doc.id)) byId.set(doc.id as string, doc);
  }
  return STATIC_FEED_REGIONS.map((r) => {
    const d = byId.get(r.id);
    if (!d) return r;
    const bezirke = Array.isArray(d.bezirke)
      ? d.bezirke.filter((b): b is string => typeof b === 'string' && b !== '')
      : [];
    return {
      ...r,
      ...(typeof d.name === 'string' && d.name ? { name: d.name } : {}),
      ...(typeof d.active === 'boolean' ? { active: d.active } : {}),
      ...(bezirke.length ? { bezirke } : {}),
      ...(typeof d.timezone === 'string' && TIMEZONE_PATTERN.test(d.timezone)
        ? { timezone: d.timezone }
        : {}),
    };
  });
}
