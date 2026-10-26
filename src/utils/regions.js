import { REGION_DATA } from '../data/regionData.js';
import { normalizeInstagramHandle } from './instagramHandle.js';
import { sanitizeTexts } from './regionExamples.js';

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
// Bundeslaender, the sixteen German Bundeslaender and the 26 Swiss cantons.
// Order = switcher order (Austria, Germany, Switzerland). The data (names,
// wording, Bezirke / Landkreise) is generated into src/data/regionData.js by
// scripts/build-region-data.mjs. "Österreich" etc. are not regions but combined
// views over them (UI only, never stored on an event or profile).
// Single source: username.js reserves the slugs so no profile can shadow a
// region address (`/tirol`, `/bayern`, `/zuerich`, ...).
export const REGION_SLUGS = REGION_DATA.map((r) => r.slug);

// The Allgäu was a region once (pilot); Bavaria replaced it. Stored ids of the
// old region are read as Bavaria.
export const LEGACY_REGION_ALIASES = Object.freeze({ allgaeu: 'bayern' });

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
// combined country views.
export const COUNTRIES = ['AT', 'DE', 'CH'];
export const DEFAULT_COUNTRY = 'AT';
// The six Grossregionen of Germany (map page, ticket 518); `region.macro` names one.
export const DE_MACRO_REGIONS = Object.freeze([
  'Norden',
  'Westen',
  'Mitte',
  'Osten',
  'Südwesten',
  'Südosten',
]);
export const COUNTRY_LABELS = Object.freeze({ AT: 'Österreich', DE: 'Deutschland', CH: 'Schweiz' });

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

const VORARLBERG_BEZIRKE = REGION_DATA.find((r) => r.slug === DEFAULT_REGION_ID).bezirke;

// What the sub-areas of a region are called: "Bezirk" in Austria and
// Switzerland, "Landkreis" in Germany (kreisfreie Staedte are listed there too).
export const DEFAULT_SUBDIVISION_LABEL = 'Bezirk';
const SUBDIVISION_PLURALS = { Bezirk: 'Bezirke', Landkreis: 'Landkreise' };

export const DEFAULT_REGION_TIMEZONE = 'Europe/Vienna';

// Static register (one entry per region, doc id == slug; also enforced in
// firestore.rules): the fallback whenever Firestore delivers nothing. Only
// Vorarlberg is active by default. Every region ships its Bezirke / Landkreise;
// `regions/{id}.bezirke` overrides them.
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
  bezirke: [...r.bezirke],
  subdivisionLabel: r.subdivisionLabel,
  timezone: r.timezone,
  // true: Bundesland / Kanton = the backend structure; false: a cultural region of
  // Germany that starts without Landkreise (see regionMapping.js).
  home: r.home !== false,
  ...(r.macro ? { macro: r.macro } : {}),
}));

// A region without Bezirke / Landkreise (a cultural region nobody has assigned
// districts to yet, or a Bundesland whose districts all moved elsewhere) does not
// exist for visitors: no chooser entry, no search hit, no map shape. Only the
// Verwaltung ("Zuordnung") still lists it.
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
        // An empty list only counts when the mapping tool wrote it (`mappingUpdatedAt`);
        // older docs seeded before the register had Bezirke carry `bezirke: []`.
        ...(Array.isArray(d.bezirke) && (d.bezirke.length || d.mappingUpdatedAt)
          ? { bezirke: d.bezirke }
          : {}),
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
