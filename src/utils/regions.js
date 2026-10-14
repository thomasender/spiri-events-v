// Regions an event or a directory listing can be assigned to. Kept free of
// Firebase imports so pure helpers (and their unit tests) can use it.

export const ONLINE_LOCATION = 'Online';

// The stored value 'Grenznahe' stays as is (existing events, filters and URLs
// depend on it); only what users read is "Umgebung".
const BEZIRK_LABELS = { Grenznahe: 'Umgebung' };

export function bezirkLabel(bezirk) {
  return BEZIRK_LABELS[bezirk] || bezirk;
}

// URL slugs of the regions (ASCII, umlauts transliterated): the nine Austrian
// Bundeslaender plus the Allgäu (Bavaria, Germany; pilot region next to the
// Steiermark). Order = switcher order, Allgäu last. These are the only regions:
// "Österreich" is not a region but a combined view over them (UI only, never
// stored on an event or profile).
// Single source: username.js reserves them so no profile can shadow a future
// region address (`/tirol`, `/wien`, `/allgaeu`, ...).
export const REGION_SLUGS = [
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

export const DEFAULT_REGION_ID = 'vorarlberg';

const VORARLBERG_BEZIRKE = ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'];

const REGION_NAMES = {
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

// "in <Region>" for running text ("Events in der Steiermark", "im Allgäu").
// Regions not listed here use "in <Name>".
const REGION_IN_PHRASES = {
  steiermark: 'in der Steiermark',
  burgenland: 'im Burgenland',
  allgaeu: 'im Allgäu',
};

// IANA time zone stored on the region doc (`regions/{id}.timezone`). Today it
// is informational only (all date maths uses Europe/Vienna; Berlin has the
// same offset all year).
const REGION_TIMEZONES = { allgaeu: 'Europe/Berlin' };
export const DEFAULT_REGION_TIMEZONE = 'Europe/Vienna';

// Static register (one entry per region, doc id == slug; also enforced in
// firestore.rules): the fallback whenever Firestore delivers nothing. Only
// Vorarlberg is active by default. Every region has its own Bezirke; the other
// regions get theirs from their `regions/{id}` doc.
export const STATIC_REGIONS = REGION_SLUGS.map((slug, order) => ({
  id: slug,
  slug,
  name: REGION_NAMES[slug],
  inPhrase: REGION_IN_PHRASES[slug] ?? `in ${REGION_NAMES[slug]}`,
  order,
  active: slug === DEFAULT_REGION_ID,
  bezirke: slug === 'vorarlberg' ? [...VORARLBERG_BEZIRKE] : [],
  timezone: REGION_TIMEZONES[slug] ?? DEFAULT_REGION_TIMEZONE,
}));

// Backwards compatible: Bezirke of Vorarlberg (cleanup in a later ticket).
export const BEZIRKE = VORARLBERG_BEZIRKE;

export const isRegionSlug = (slug) => typeof slug === 'string' && REGION_SLUGS.includes(slug);

export const getRegionBySlug = (slug, regions = STATIC_REGIONS) =>
  regions.find((r) => r.slug === slug) ?? null;

// Read fallback for documents written before regions existed.
export const resolveRegionId = (doc) =>
  doc && typeof doc.regionId === 'string' && doc.regionId ? doc.regionId : DEFAULT_REGION_ID;

// regionId for an event write. A valid id from the form wins; otherwise an
// existing event keeps its stored region (edits never reset it); new events
// get the default. Online events use the same rule (moderation region).
export function pickEventRegionId(formRegionId, existingEvent = null) {
  if (isRegionSlug(formRegionId)) return formRegionId;
  if (existingEvent && isRegionSlug(existingEvent.regionId)) return existingEvent.regionId;
  return DEFAULT_REGION_ID;
}

// Max entries of a profile's `directoryRegionIds` (also enforced in
// firestore.rules).
export const MAX_DIRECTORY_REGION_IDS = REGION_SLUGS.length;

// Region ids a directory profile is listed in. Profiles saved before regions
// existed have none and count as Vorarlberg. Unknown ids and duplicates are
// dropped so the result always passes firestore.rules.
export function resolveDirectoryRegionIds(doc) {
  const raw = doc && Array.isArray(doc.directoryRegionIds) ? doc.directoryRegionIds : [];
  const ids = [...new Set(raw.filter(isRegionSlug))].slice(0, MAX_DIRECTORY_REGION_IDS);
  return ids.length > 0 ? ids : [DEFAULT_REGION_ID];
}

export const getBezirke = (regionId, regions = STATIC_REGIONS) =>
  getRegionBySlug(regionId, regions)?.bezirke ?? [];

// A region page shows events of that region plus online events (online events
// are visible in every region).
export function eventVisibleInRegion(event, regionId) {
  if (event?.isOnline) return true;
  return resolveRegionId(event) === regionId;
}

// Lays Firestore region docs ({ id, ...data }) over the static register.
// Unknown ids are ignored; an empty/invalid input yields the static register.
export function mergeRegions(docs, base = STATIC_REGIONS) {
  if (!Array.isArray(docs) || docs.length === 0) return base;
  const byId = new Map(docs.filter((d) => d && isRegionSlug(d.id)).map((d) => [d.id, d]));
  return base
    .map((r) => {
      const d = byId.get(r.id);
      if (!d) return r;
      return {
        ...r,
        ...(typeof d.name === 'string' && d.name ? { name: d.name } : {}),
        ...(typeof d.order === 'number' ? { order: d.order } : {}),
        ...(typeof d.active === 'boolean' ? { active: d.active } : {}),
        ...(Array.isArray(d.bezirke) && d.bezirke.length ? { bezirke: d.bezirke } : {}),
        ...(typeof d.contactEmail === 'string' ? { contactEmail: d.contactEmail } : {}),
        ...(d.seo && typeof d.seo === 'object' ? { seo: d.seo } : {}),
        ...(typeof d.timezone === 'string' ? { timezone: d.timezone } : {}),
      };
    })
    .sort((a, b) => a.order - b.order);
}
