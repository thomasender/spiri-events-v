import { BEZIRKE, ONLINE_LOCATION } from './regions';

// Pure helpers for the directory ("Verzeichnis"): validating a profile's
// listing choice, normalising directory docs and filtering/sorting/counting
// them. No Firebase or DOM imports so everything here is unit-testable.

export const DIRECTORY_MAX_CATEGORIES = 5;
export const DIRECTORY_REGIONS = [...BEZIRKE, ONLINE_LOCATION];

const DIRECTORY_REGION_SET = new Set(DIRECTORY_REGIONS);

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim() !== '');
}

// Validates the directory part of the profile form. Returns an object of
// German error messages keyed by field; empty when the choice is valid.
// Not listed → nothing is required, so users who stay out of the directory
// never have to name an offering.
export function validateDirectoryListing({ listed, categories, regions, hasBio }) {
  const errors = {};
  if (!listed) return errors;
  const cats = stringList(categories);
  if (cats.length === 0) {
    errors.categories =
      'Bitte wähle mindestens eine Kategorie, damit du im Verzeichnis erscheinst.';
  } else if (cats.length > DIRECTORY_MAX_CATEGORIES) {
    errors.categories = `Bitte wähle höchstens ${DIRECTORY_MAX_CATEGORIES} Kategorien.`;
  }
  if (stringList(regions).some((region) => !DIRECTORY_REGION_SET.has(region))) {
    errors.regions = 'Bitte wähle nur Regionen aus der Liste.';
  }
  if (!hasBio) {
    errors.bio =
      'Bitte ergänze eine Kurzbeschreibung, damit Besucher:innen wissen, was du anbietest.';
  }
  return errors;
}

// Turns a `publicProfile` doc into the shape the directory page renders.
export function normalizeDirectoryEntry(uid, data) {
  const d = data || {};
  return {
    uid,
    slug: typeof d.slug === 'string' ? d.slug : '',
    displayName: typeof d.displayName === 'string' ? d.displayName : '',
    bio: typeof d.bio === 'string' ? d.bio : '',
    photoURL: d.photoURL || null,
    categories: stringList(d.directoryCategories),
    regions: stringList(d.directoryRegions),
    hidden: d.directoryHidden === true,
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
