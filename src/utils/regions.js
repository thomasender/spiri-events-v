import { LEGACY_BEZIRKE, REGION_DATA, RETIRED_REGION_IDS } from '../data/regionData.js';
import { normalizeInstagramHandle } from './instagramHandle.js';
import { sanitizeTexts } from './regionExamples.js';

// Regions an event or a directory listing can be assigned to. Kept free of
// Firebase imports so pure helpers (and their unit tests) can use it.

export const ONLINE_LOCATION = 'Online';

// Vorarlberg's legacy pseudo-Bezirk for places outside the region. Since Trello dx8dCQJc no new
// event gets it (the Ort decides the real Bezirk / Landkreis and region), but events stored with
// it keep it: it stays readable, filterable (calendar chip, ICS `bezirk=`, directory profiles)
// and is shown as "Umgebung". It is appended to the region's register list (`LEGACY_BEZIRKE`,
// generated), never offered in the event forms (`selectableBezirke`).
export const LEGACY_OUTSIDE_BEZIRK = 'Grenznahe';
export { LEGACY_BEZIRKE };
const LEGACY_NAMES = new Set(Object.values(LEGACY_BEZIRKE).flat());
export const isLegacyBezirk = (bezirk) => LEGACY_NAMES.has(bezirk);

/** Bezirke an event form may offer: the list without the legacy pseudo-Bezirke. */
export const selectableBezirke = (list) => (list ?? []).filter((b) => !isLegacyBezirk(b));

// The stored value 'Grenznahe' stays as is (existing events, filters and URLs
// depend on it); only what users read is "Umgebung".
const BEZIRK_LABELS = { [LEGACY_OUTSIDE_BEZIRK]: 'Umgebung' };

export function bezirkLabel(bezirk) {
  return BEZIRK_LABELS[bezirk] || bezirk;
}

// URL slugs of the regions (ASCII, umlauts transliterated). The register is defined ONLY by
// the three CSVs in scripts/data/regions/ (Austria: 9 Bundesländer, Switzerland: 19 regions,
// Liechtenstein: 1), generated into src/data/regionData.js by scripts/build-region-data.mjs.
// Order = switcher order (Austria, Switzerland, Liechtenstein; CSV row order inside).
// "Österreich" etc. are not regions but combined views over them (UI only, never stored on
// an event or profile).
// Single source: username.js reserves the slugs so no profile can shadow a
// region address (`/tirol`, `/zuerich`, ...).
// `STATIC_REGION_SLUGS` is the generated list (it matches firestore.rules).
export const STATIC_REGION_SLUGS = Object.freeze(REGION_DATA.map((r) => r.slug));
export const REGION_SLUGS = [...STATIC_REGION_SLUGS];

// Ids of former regions (Germany, the Allgäu pilot, Swiss cantons now merged into
// Innerschweiz / Basel / Appenzell). Not valid region ids any more, but still reserved as
// usernames so nobody can claim an old region address. Generated next to REGION_DATA.
export { RETIRED_REGION_IDS };

// Stored ids that are read as another region. Empty since the CSV register (Trello
// QG0GR5lv): the old Allgäu -> Bayern alias is gone with Germany; `allgaeu` stays reserved
// through RETIRED_REGION_IDS.
export const LEGACY_REGION_ALIASES = Object.freeze({});

export const DEFAULT_REGION_ID = 'vorarlberg';

// Vorarlberg's Instagram channel: the code default while `regions/vorarlberg`
// stores no `instagramHandle` (no data migration needed).
export const DEFAULT_INSTAGRAM_HANDLE = '@tribevorarlberg';

/**
 * Instagram name ("@name") shown for a region: the stored `instagramHandle`,
 * else Vorarlberg's default, else null (wording then stays vague, no name).
 * Display only; the publishing account is wired outside the app.
 */
export function regionInstagramAccount(region) {
  const stored = normalizeInstagramHandle(region?.instagramHandle);
  if (stored) return stored;
  return region?.id === DEFAULT_REGION_ID ? DEFAULT_INSTAGRAM_HANDLE : null;
}

/** Distinct Instagram channels ("@name") of the given regions, in region order. */
export function instagramChannels(regions) {
  const seen = new Set();
  const out = [];
  for (const region of regions ?? []) {
    const handle = regionInstagramAccount(region);
    if (handle && !seen.has(handle.toLowerCase())) {
      seen.add(handle.toLowerCase());
      out.push({ regionId: region.id, regionName: region.name, handle });
    }
  }
  return out;
}

/** Profile URL of an Instagram handle ("@name" -> https://www.instagram.com/name/). */
export function instagramProfileUrl(handle) {
  const h = normalizeInstagramHandle(handle);
  return h ? `https://www.instagram.com/${h.slice(1)}/` : null;
}

// Country of each region (static only; deliberately NOT stored in
// `regions/{id}` docs, firestore.rules does not whitelist it). Drives the
// combined country views. Germany follows later (a `deutschland.csv`).
export const COUNTRIES = ['AT', 'CH', 'LI'];
export const DEFAULT_COUNTRY = 'AT';
export const COUNTRY_LABELS = Object.freeze({
  AT: 'Österreich',
  CH: 'Schweiz',
  LI: 'Liechtenstein',
  DE: 'Deutschland',
});

// Combined views ("Ganz Österreich", "Ganz Schweiz", "Alle Tribes"): not regions, only UI
// views over the active regions of one country (`country`) or of all countries
// (`country: null`). Never stored on an event or profile. Their slugs share the top-level
// path space with profiles, so username.js reserves them next to REGION_SLUGS.
// Liechtenstein has a single region, so it gets no country view.
export const COMBINED_VIEWS = Object.freeze([
  { slug: 'oesterreich', name: 'Ganz Österreich', label: 'Österreich', country: 'AT' },
  { slug: 'schweiz', name: 'Ganz Schweiz', label: 'Schweiz', country: 'CH' },
  { slug: 'alle-tribes', name: 'Alle Tribes', label: 'Alle Tribes', country: null },
]);
// Former combined views: no longer a view, still reserved as usernames.
export const RETIRED_VIEW_SLUGS = Object.freeze(['deutschland']);
export const COMBINED_VIEW_SLUGS = COMBINED_VIEWS.map((v) => v.slug);

// Register Bezirke plus the region's legacy pseudo-Bezirke (read-only, see LEGACY_OUTSIDE_BEZIRK).
const withLegacyBezirke = (slug, bezirke) => [...bezirke, ...(LEGACY_BEZIRKE[slug] ?? [])];

const VORARLBERG_BEZIRKE = withLegacyBezirke(
  DEFAULT_REGION_ID,
  REGION_DATA.find((r) => r.slug === DEFAULT_REGION_ID).bezirke
);

// What the sub-areas of a region are called: "Bezirk" in Austria and Switzerland,
// "Landesteil" in Liechtenstein ("Landkreis" once Germany is back).
export const DEFAULT_SUBDIVISION_LABEL = 'Bezirk';
const SUBDIVISION_PLURALS = {
  Bezirk: 'Bezirke',
  Landesteil: 'Landesteile',
  Landkreis: 'Landkreise',
};

export const DEFAULT_REGION_TIMEZONE = 'Europe/Vienna';

// Static register (one entry per region, doc id == slug; also enforced in
// firestore.rules): the fallback whenever Firestore delivers nothing. Only
// Vorarlberg is active by default. Every region ships its districts here;
// Firestore never overrides them.
export const STATIC_REGIONS = REGION_DATA.map((r, order) => ({
  id: r.slug,
  slug: r.slug,
  name: r.name,
  inPhrase: r.inPhrase,
  demonym: r.demonym,
  forPhrase: r.forPhrase,
  order,
  country: r.country,
  active: r.slug === DEFAULT_REGION_ID,
  bezirke: withLegacyBezirke(r.slug, r.bezirke),
  subdivisionLabel: r.subdivisionLabel,
  timezone: r.timezone,
}));

// A region whose register list holds no Bezirke / Landkreise does not exist for
// visitors: no chooser entry, no search hit, no map shape.
export const isPopulated = (region) => Array.isArray(region?.bezirke) && region.bezirke.length > 0;

// Bezirke of Vorarlberg only. Still used as fallback (event form, directory
// listing fields, re-exported by useEvents); region-aware code uses the region's own list.
export const BEZIRKE = VORARLBERG_BEZIRKE;

export const isRegionSlug = (slug) => typeof slug === 'string' && REGION_SLUGS.includes(slug);

export const isCombinedViewSlug = (slug) =>
  typeof slug === 'string' && COMBINED_VIEW_SLUGS.includes(slug);

export const getRegionBySlug = (slug, regions = STATIC_REGIONS) =>
  regions.find((r) => r.slug === slug) ?? null;

// Read fallback for documents written before regions existed.
export const resolveRegionId = (doc) =>
  doc && typeof doc.regionId === 'string' && doc.regionId
    ? (LEGACY_REGION_ALIASES[doc.regionId] ?? doc.regionId)
    : DEFAULT_REGION_ID;

// regionId for an event write. A valid id from the form wins; otherwise an
// existing event keeps its stored region (edits never reset it); new events
// get the default. Online events use the same rule (moderation region).
export function pickEventRegionId(formRegionId, existingEvent = null) {
  if (isRegionSlug(formRegionId)) return formRegionId;
  const stored = LEGACY_REGION_ALIASES[existingEvent?.regionId] ?? existingEvent?.regionId;
  if (existingEvent && isRegionSlug(stored)) return stored;
  return DEFAULT_REGION_ID;
}

// Max entries of a profile's `directoryRegionIds` (also enforced in
// firestore.rules).
export const MAX_DIRECTORY_REGION_IDS = 10;

// Region ids a directory profile is listed in. Profiles saved before regions
// existed have none and count as Vorarlberg. Unknown ids and duplicates are
// dropped so the result always passes firestore.rules.
export function resolveDirectoryRegionIds(doc) {
  const raw = doc && Array.isArray(doc.directoryRegionIds) ? doc.directoryRegionIds : [];
  const ids = [
    ...new Set(raw.map((id) => LEGACY_REGION_ALIASES[id] ?? id).filter(isRegionSlug)),
  ].slice(0, MAX_DIRECTORY_REGION_IDS);
  return ids.length > 0 ? ids : [DEFAULT_REGION_ID];
}

export const getBezirke = (regionId, regions = STATIC_REGIONS) =>
  getRegionBySlug(regionId, regions)?.bezirke ?? [];

// "Bezirk" / "Landesteil" for a region; unknown ids use "Bezirk".
export const getSubdivisionLabel = (regionId, regions = STATIC_REGIONS) =>
  getRegionBySlug(regionId, regions)?.subdivisionLabel ?? DEFAULT_SUBDIVISION_LABEL;

// Every district of every region (Vorarlberg first, whatever its place in the register),
// without duplicates: what a directory profile may name in `directoryRegions`.
export const getAllDistricts = (regions = STATIC_REGIONS) => [
  ...new Set(
    [
      ...regions.filter((r) => r.id === DEFAULT_REGION_ID),
      ...regions.filter((r) => r.id !== DEFAULT_REGION_ID),
    ].flatMap((r) => r.bezirke ?? [])
  ),
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
// Regions, their order and their districts (`bezirke`) come only from the static register
// (the CSVs); the docs carry just the switchable fields (active, contact, seo, texts, about,
// ...). A stored `order` of an old doc is ignored.
export function mergeRegions(docs, base = STATIC_REGIONS) {
  if (!Array.isArray(docs) || docs.length === 0) return base;
  const byId = new Map(docs.filter((d) => d && isRegionSlug(d.id)).map((d) => [d.id, d]));
  return base
    .map((r) => {
      const d = byId.get(r.id);
      if (!d) return r;
      return {
        ...r,
        ...(typeof d.active === 'boolean' ? { active: d.active } : {}),
        ...(typeof d.contactEmail === 'string' ? { contactEmail: d.contactEmail } : {}),
        ...(d.seo && typeof d.seo === 'object' ? { seo: d.seo } : {}),
        ...(typeof d.timezone === 'string' ? { timezone: d.timezone } : {}),
        // "Über uns" page of the region (set by its moderators).
        ...(Array.isArray(d.aboutHelperIds) ? { aboutHelperIds: d.aboutHelperIds } : {}),
        ...(typeof d.aboutHeaderImage === 'string' && d.aboutHeaderImage
          ? { aboutHeaderImage: d.aboutHeaderImage }
          : {}),
        ...(typeof d.aboutText === 'string' && d.aboutText ? { aboutText: d.aboutText } : {}),
        ...(typeof d.aboutSlogan1 === 'string' && d.aboutSlogan1.trim()
          ? { aboutSlogan1: d.aboutSlogan1 }
          : {}),
        ...(typeof d.aboutSlogan2 === 'string' && d.aboutSlogan2.trim()
          ? { aboutSlogan2: d.aboutSlogan2 }
          : {}),
        ...(d.aboutSloganLocked === true ? { aboutSloganLocked: true } : {}),
        // Free texts of the region (example placeholders of the event form, ...).
        ...(sanitizeTexts(d.texts) ? { texts: sanitizeTexts(d.texts) } : {}),
        // Display-only Instagram name of the region (Super-Admin sets it).
        ...(normalizeInstagramHandle(d.instagramHandle)
          ? { instagramHandle: normalizeInstagramHandle(d.instagramHandle) }
          : {}),
      };
    })
    .sort((a, b) => a.order - b.order);
}
