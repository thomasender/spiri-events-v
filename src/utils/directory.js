import { ONLINE_LOCATION, getAllDistricts, resolveDirectoryRegionIds } from './regions';
import { normalizeFocalPoint } from '../lib/eventImage';
import { normalizePhotoZoom } from '../components/AvatarImage';

// Pure helpers for the directory ("Verzeichnis"): validating a profile's
// listing choice, normalising directory docs and filtering/sorting/counting
// them. No Firebase or DOM imports so everything here is unit-testable.

export const DIRECTORY_MAX_CATEGORIES = 5;
// Max. regions a person can be active in (limits online-event spam). Profiles that
// already hold more keep them until the person changes the selection.
export const DIRECTORY_MAX_REGION_IDS = 3;
// All districts of all regions known without Firestore (Vorarlberg first, so
// its order is unchanged) plus "Online". Mirrored by DIRECTORY_REGIONS in
// functions/src/regions.ts (sync test: tests/lib/functionsRegions.spec.ts).
export const DIRECTORY_REGIONS = [...getAllDistricts(), ONLINE_LOCATION];

const DIRECTORY_REGION_SET = new Set(DIRECTORY_REGIONS);

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim() !== '');
}

// Validates the directory part of the profile form. Returns an object of
// German error messages keyed by field; empty when the choice is valid.
// Not listed → nothing is required, so users who stay out of the directory
// never have to name an offering.
// `extraRegions`: district names that exist only in Firestore (regions/{id}.bezirke).
export function validateDirectoryListing({
  listed,
  categories,
  regions,
  hasBio,
  extraRegions = [],
}) {
  const errors = {};
  if (!listed) return errors;
  const cats = stringList(categories);
  if (cats.length === 0) {
    errors.categories =
      'Bitte wähle mindestens eine Kategorie, damit du im Verzeichnis erscheinst.';
  } else if (cats.length > DIRECTORY_MAX_CATEGORIES) {
    errors.categories = `Bitte wähle höchstens ${DIRECTORY_MAX_CATEGORIES} Kategorien.`;
  }
  const allowed =
    extraRegions.length > 0
      ? new Set([...DIRECTORY_REGIONS, ...extraRegions])
      : DIRECTORY_REGION_SET;
  if (stringList(regions).some((region) => !allowed.has(region))) {
    errors.regions = 'Bitte wähle nur Regionen aus der Liste.';
  }
  if (!hasBio) {
    errors.bio =
      'Bitte ergänze eine Kurzbeschreibung, damit Besucher:innen wissen, was du anbietest.';
  }
  return errors;
}

// The stored plain `bio` glues the editor's paragraphs together
// ("SandraYogalehrerin"), so read the text from `bioHtml` and keep each
// paragraph / <br> as a line break.
function bioHtmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

// Turns a `publicProfile` doc into the shape the directory page renders.
export function normalizeDirectoryEntry(uid, data) {
  const d = data || {};
  const htmlBio = typeof d.bioHtml === 'string' ? bioHtmlToText(d.bioHtml) : '';
  return {
    uid,
    slug: typeof d.slug === 'string' ? d.slug : '',
    displayName: typeof d.displayName === 'string' ? d.displayName : '',
    bio: htmlBio || (typeof d.bio === 'string' ? d.bio : ''),
    photoURL: d.photoURL || null,
    photoFocalPoint: normalizeFocalPoint(d.photoFocalPoint),
    photoZoom: normalizePhotoZoom(d.photoZoom),
    categories: stringList(d.directoryCategories),
    regions: stringList(d.directoryRegions),
    // Read-side preparation only: the directory does not filter by it yet.
    regionIds: resolveDirectoryRegionIds(d),
    hidden: d.directoryHidden === true,
    // Opt-in: only people who share their online status get a dot.
    showOnlineStatus: d.showOnlineStatus === true,
    // Only present while the person made their Feuerplatz visible; just the place name.
    fireplaceLabel: typeof d.fireplaceLabel === 'string' ? d.fireplaceLabel : '',
    // Vereinsmitglied (set by admins only). Missing field = no member.
    clubMember: d.clubMember === true,
  };
}

// An entry is only worth showing if it can be linked to and has a name.
export function isRenderableEntry(entry) {
  return Boolean(entry && entry.slug && entry.displayName.trim() && entry.categories.length > 0);
}

function matchesQuery(entry, query) {
  const needle = query.trim().toLocaleLowerCase('de');
  if (!needle) return true;
  const haystack = [entry.displayName, entry.bio, ...entry.categories, ...entry.regions]
    .join(' ')
    .toLocaleLowerCase('de');
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

function matchesAny(selected, values) {
  return selected.length === 0 || selected.some((item) => values.includes(item));
}

// Facets combine with AND (search AND category AND region); several chosen
// values inside one facet combine with OR, so adding a category never
// shrinks the result list.
export function filterDirectoryEntries(
  entries,
  { query = '', categories = [], regions = [], includeHidden = false } = {}
) {
  return entries.filter(
    (entry) =>
      (includeHidden || !entry.hidden) &&
      matchesQuery(entry, query) &&
      matchesAny(categories, entry.categories) &&
      matchesAny(regions, entry.regions)
  );
}

// Counts per facet value, computed with every *other* filter applied so the
// numbers always tell the user what they would get on clicking that value.
// Returns a Map<value, count>; values with zero hits are absent.
export function countFacet(entries, facet, filters = {}) {
  const other = { ...filters, [facet]: [] };
  const counts = new Map();
  for (const entry of filterDirectoryEntries(entries, other)) {
    for (const value of entry[facet]) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return counts;
}

export function sortDirectoryEntries(entries) {
  return [...entries].sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'));
}

// Vereinsmitglieder tend to be near the top: in the first 30 % of the places
// each place goes to a member with probability 60 % (otherwise to a
// non-member); after that there is no preference.
export const DIRECTORY_MEMBER_HEAD_SHARE = 0.3;
export const DIRECTORY_MEMBER_HEAD_CHANCE = 0.6;

function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Mixed order of `entries` (pure; `random` injectable). Members and
// non-members are shuffled separately; the head places draw from the member
// pool with DIRECTORY_MEMBER_HEAD_CHANCE, the rest is shuffled together. An
// empty pool hands its turn to the other one.
export function mixDirectoryEntries(entries, random = Math.random) {
  const members = shuffled(
    entries.filter((e) => e.clubMember),
    random
  );
  const others = shuffled(
    entries.filter((e) => !e.clubMember),
    random
  );
  const headSize = Math.ceil(entries.length * DIRECTORY_MEMBER_HEAD_SHARE);
  const head = [];
  for (let i = 0; i < headSize; i += 1) {
    const wantMember = random() < DIRECTORY_MEMBER_HEAD_CHANCE;
    const pool = (wantMember && members.length > 0) || others.length === 0 ? members : others;
    head.push(pool.shift());
  }
  // Shuffle the head again so the members are spread over all its places.
  return [...shuffled(head, random), ...shuffled([...members, ...others], random)];
}

// Random order, so the same people are not always on top. `ranks` is a Map
// (uid -> rank) owned by the caller: it keeps the order stable while filters
// change within one page load, and a new load starts with a new map. Ranks
// (not places) are stored: the mix is drawn once over `pool` (pass the
// unfiltered list, so filtering only hides entries and never re-draws);
// entries that show up later (live update) are mixed among themselves and
// appended after the existing ranks.
export function shuffleDirectoryEntries(entries, ranks, random = Math.random, pool = entries) {
  const unranked = new Map();
  for (const entry of [...pool, ...entries]) {
    if (!ranks.has(entry.uid)) unranked.set(entry.uid, entry);
  }
  if (unranked.size > 0) {
    let next = ranks.size === 0 ? 0 : Math.max(...ranks.values()) + 1;
    for (const entry of mixDirectoryEntries([...unranked.values()], random)) {
      ranks.set(entry.uid, next);
      next += 1;
    }
  }
  return [...entries].sort((a, b) => ranks.get(a.uid) - ranks.get(b.uid));
}

// URL <-> filter state, so a filtered directory can be shared and survives
// the back button. Unknown categories are dropped later by the page (it
// knows the registry); here we only parse.
export function parseDirectoryParams(searchParams) {
  const list = (key) =>
    searchParams
      .getAll(key)
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);
  return {
    query: searchParams.get('q') || '',
    categories: list('kategorie'),
    regions: list('region'),
  };
}

export function buildDirectoryParams({ query = '', categories = [], regions = [] }) {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (categories.length > 0) params.set('kategorie', categories.join(','));
  if (regions.length > 0) params.set('region', regions.join(','));
  return params;
}

export function toggleValue(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

// Card preview: line breaks become ". " (no extra period after . ! ? : ;).
export function formatBioPreview(bio) {
  if (typeof bio !== 'string') return '';
  return bio
    .split(/\r?\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((out, line) => (out ? `${out}${/[.!?:;]$/.test(out) ? '' : '.'} ${line}` : line), '')
    .replace(/[ \t]{2,}/g, ' ');
}
