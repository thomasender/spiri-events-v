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

// Country of each region (static only; deliberately NOT stored in
// `regions/{id}` docs, firestore.rules does not whitelist it). Drives the
// combined country views. All regions are Austrian except the Allgäu.
export const COUNTRIES = ['AT', 'DE', 'CH'];
const REGION_COUNTRIES = { allgaeu: 'DE' };
export const DEFAULT_COUNTRY = 'AT';

// Combined views ("Ganz Österreich", "Ganz Deutschland", "Ganz Schweiz", "Alle
// Tribes"): not regions, only UI views over the active regions of one country
// (`country`) or of all countries (`country: null`). Never stored on an event or
// profile. Their slugs share the top-level path space with profiles, so
// username.js reserves them next to REGION_SLUGS.
export const COMBINED_VIEWS = Object.freeze([
  { slug: 'oesterreich', name: 'Ganz Österreich', label: 'Österreich', country: 'AT' },
  { slug: 'deutschland', name: 'Ganz Deutschland', label: 'Deutschland', country: 'DE' },
  { slug: 'schweiz', name: 'Ganz Schweiz', label: 'Schweiz', country: 'CH' },
  { slug: 'alle-tribes', name: 'Alle Tribes', label: 'Alle Tribes', country: null },
]);
export const COMBINED_VIEW_SLUGS = COMBINED_VIEWS.map((v) => v.slug);

const VORARLBERG_BEZIRKE = ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'];

// Steiermark: the 13 Bezirke (since the 2015 reform).
const STEIERMARK_BEZIRKE = [
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
];

// Allgäu: Landkreise and kreisfreie Städte. PRODUCT DECISION: which areas count
// as "Allgäu" is not a hard fact (Unterallgäu and Ravensburg lie only partly in
// the Allgäu); the list is easy to change here (or per region in
// `regions/allgaeu.bezirke`, which wins once present).
const ALLGAEU_BEZIRKE = [
  'Oberallgäu',
  'Ostallgäu',
  'Unterallgäu',
  'Lindau (Bodensee)',
  'Ravensburg (Württembergisches Allgäu)',
  'Kempten (Allgäu)',
  'Kaufbeuren',
  'Memmingen',
];

// Bezirke known without Firestore. Other regions get theirs from their
// `regions/{id}.bezirke` doc (no invented lists).
const REGION_BEZIRKE = {
  vorarlberg: VORARLBERG_BEZIRKE,
  steiermark: STEIERMARK_BEZIRKE,
  allgaeu: ALLGAEU_BEZIRKE,
};

// What the sub-areas of a region are called: "Bezirk" in Austria, "Landkreis"
// in Germany (the Allgäu list also holds kreisfreie Städte).
export const DEFAULT_SUBDIVISION_LABEL = 'Bezirk';
const REGION_SUBDIVISION_LABELS = { allgaeu: 'Landkreis' };
const SUBDIVISION_PLURALS = { Bezirk: 'Bezirke', Landkreis: 'Landkreise' };

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

// Adjective for the header "Dein <demonym> Kalender": capitalised for -er forms
// derived from place names (Vorarlberger, Tiroler, Wiener, Allgäuer), lower
// case for -isch adjectives (steirischer, burgenländischer). The complete
// token is stored so no grammar is computed at runtime.
const REGION_DEMONYMS = {
  vorarlberg: 'Vorarlberger',
  tirol: 'Tiroler',
  salzburg: 'Salzburger',
  kaernten: 'Kärntner',
  steiermark: 'steirischer',
  oberoesterreich: 'oberösterreichischer',
  niederoesterreich: 'niederösterreichischer',
  wien: 'Wiener',
  burgenland: 'burgenländischer',
  allgaeu: 'Allgäuer',
};

// Accusative phrase for "Für <forPhrase> und Umkreis" (with article where the
// region name takes one).
const REGION_FOR_PHRASES = {
  steiermark: 'die Steiermark',
  burgenland: 'das Burgenland',
  allgaeu: 'das Allgäu',
};

// IANA time zone stored on the region doc (`regions/{id}.timezone`). Today it
// is informational only (all date maths uses Europe/Vienna; Berlin has the
// same offset all year).
const REGION_TIMEZONES = { allgaeu: 'Europe/Berlin' };
export const DEFAULT_REGION_TIMEZONE = 'Europe/Vienna';

// Static register (one entry per region, doc id == slug; also enforced in
// firestore.rules): the fallback whenever Firestore delivers nothing. Only
// Vorarlberg is active by default. Vorarlberg, Steiermark and Allgäu ship their
// Bezirke; the other regions get theirs from their `regions/{id}` doc.
export const STATIC_REGIONS = REGION_SLUGS.map((slug, order) => ({
  id: slug,
  slug,
  name: REGION_NAMES[slug],
  inPhrase: REGION_IN_PHRASES[slug] ?? `in ${REGION_NAMES[slug]}`,
  demonym: REGION_DEMONYMS[slug],
  forPhrase: REGION_FOR_PHRASES[slug] ?? REGION_NAMES[slug],
  order,
  country: REGION_COUNTRIES[slug] ?? DEFAULT_COUNTRY,
  active: slug === DEFAULT_REGION_ID,
  bezirke: [...(REGION_BEZIRKE[slug] ?? [])],
  subdivisionLabel: REGION_SUBDIVISION_LABELS[slug] ?? DEFAULT_SUBDIVISION_LABEL,
  timezone: REGION_TIMEZONES[slug] ?? DEFAULT_REGION_TIMEZONE,
}));

// Backwards compatible: Bezirke of Vorarlberg (cleanup in a later ticket).
export const BEZIRKE = VORARLBERG_BEZIRKE;

export const isRegionSlug = (slug) => typeof slug === 'string' && REGION_SLUGS.includes(slug);

export const isCombinedViewSlug = (slug) =>
  typeof slug === 'string' && COMBINED_VIEW_SLUGS.includes(slug);

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

// "Bezirk" / "Landkreis" for a region; unknown ids use "Bezirk".
export const getSubdivisionLabel = (regionId, regions = STATIC_REGIONS) =>
  getRegionBySlug(regionId, regions)?.subdivisionLabel ?? DEFAULT_SUBDIVISION_LABEL;

// "Bezirke" / "Landkreise".
// Every district of every region (Vorarlberg first), without duplicates: what
// a directory profile may name in `directoryRegions`. Pass the merged register
// to include districts that only exist in Firestore (e.g. Tirol).
export const getAllDistricts = (regions = STATIC_REGIONS) => [
  ...new Set(regions.flatMap((r) => r.bezirke ?? [])),
];

export const getSubdivisionLabelPlural = (regionId, regions = STATIC_REGIONS) => {
  const label = getSubdivisionLabel(regionId, regions);
  return SUBDIVISION_PLURALS[label] ?? `${label}e`;
};

// A region page shows events of that region plus online events (online events
// are visible in every region).
export function eventVisibleInRegion(event, regionId) {
  if (event?.isOnline) return true;
  return resolveRegionId(event) === regionId;
}

// Events a visitor may see in the public lists. `activeRegionIds`: ids of the
// active regions (events of any other region never show, online events
// included: they belong to their region's moderation). `isNational` or no
// `regionId`: the combined view, every event of an active region. Otherwise
// `eventVisibleInRegion` decides (own region + online events). Missing
// regionId counts as Vorarlberg.
export function filterEventsForRegion(
  events,
  { regionId = null, isNational = false, activeRegionIds = [DEFAULT_REGION_ID] } = {}
) {
  if (!Array.isArray(events)) return [];
  const active = new Set(activeRegionIds);
  const all = isNational || !regionId;
  return events.filter(
    (event) => active.has(resolveRegionId(event)) && (all || eventVisibleInRegion(event, regionId))
  );
}

// Directory profiles listed in a region (`directoryRegionIds`, missing =
// Vorarlberg). Entries are `normalizeDirectoryEntry` results (`regionIds`) or
// raw docs. Combined view: listed in at least one active region.
export function filterDirectoryForRegion(
  entries,
  { regionId = null, isNational = false, activeRegionIds = [DEFAULT_REGION_ID] } = {}
) {
  if (!Array.isArray(entries)) return [];
  const active = new Set(activeRegionIds);
  const all = isNational || !regionId;
  return entries.filter((entry) => {
    const ids = Array.isArray(entry?.regionIds)
      ? entry.regionIds
      : resolveDirectoryRegionIds(entry);
    return all ? ids.some((id) => active.has(id)) : ids.includes(regionId) && active.has(regionId);
  });
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
