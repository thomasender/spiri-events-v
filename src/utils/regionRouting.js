// Pure routing helpers for region addresses (`/vorarlberg`, `/tirol/verzeichnis`,
// `/oesterreich`). The URL is the source of truth for the region; the last
// chosen region in localStorage only fills in where the URL names none (`/`).
// No Firebase imports, so Vitest covers it without an emulator.
import {
  COMBINED_VIEWS,
  DEFAULT_REGION_ID,
  STATIC_REGIONS,
  getRegionBySlug,
  isCombinedViewSlug,
  isRegionSlug,
} from './regions.js';

// Combined views (`/oesterreich`, `/deutschland`, `/schweiz`, `/alle-tribes`)
// are not regions: never stored on an event or profile, reserved as usernames
// (username.js). A country view covers the ACTIVE regions of that country,
// "Alle Tribes" all active regions of all countries (definitions: COMBINED_VIEWS
// in regions.js).
// "Ganz Österreich" is only the Austrian regions (the Allgäu is German and
// appears under "Ganz Deutschland").
export { COMBINED_VIEWS };
export const ALL_REGIONS_SLUG = 'oesterreich';
export const ALL_REGIONS_NAME = 'Ganz Österreich';
export const GLOBAL_VIEW_SLUG = 'alle-tribes';

export const LAST_REGION_STORAGE_KEY = 'tribe:lastRegion';

export const activeRegions = (regions = STATIC_REGIONS) => regions.filter((r) => r.active);

export const getCombinedView = (slug) => COMBINED_VIEWS.find((v) => v.slug === slug) ?? null;

/** Active regions a combined view covers (country view: that country; global: all). */
export function combinedViewRegions(view, regions = STATIC_REGIONS) {
  const v = typeof view === 'string' ? getCombinedView(view) : view;
  if (!v) return [];
  return activeRegions(regions).filter((r) => !v.country || r.country === v.country);
}

/**
 * Availability of a combined view: at least two active regions in its scope
 * (a country view: that country's regions; "Alle Tribes": all regions of all
 * countries, even when they all lie in one country). With one region in scope
 * the view would only repeat that region.
 */
export function isCombinedViewAvailable(view, regions = STATIC_REGIONS) {
  const v = typeof view === 'string' ? getCombinedView(view) : view;
  if (!v) return false;
  return combinedViewRegions(v, regions).length >= 2;
}

/** Combined views offered in chooser and switcher (available ones, in fixed order). */
export const availableCombinedViews = (regions = STATIC_REGIONS) =>
  COMBINED_VIEWS.filter((v) => isCombinedViewAvailable(v, regions));

// Kept for the Austrian view: it only makes sense with at least two active
// Austrian regions.
export const isAllRegionsViewAvailable = (regions = STATIC_REGIONS) =>
  isCombinedViewAvailable(ALL_REGIONS_SLUG, regions);

/**
 * What an unavailable combined view shows: with exactly one active region in
 * scope its page (`{ region }`), otherwise null (coming soon).
 */
export function combinedViewFallback(view, regions = STATIC_REGIONS) {
  const v = typeof view === 'string' ? getCombinedView(view) : view;
  const included = combinedViewRegions(v, regions);
  if (included.length === 1) return { region: included[0] };
  return null;
}

/**
 * Decides synchronously (no waiting for Firestore) what a top-level path
 * segment `/:slug` shows:
 *  - `region`        an active region -> its calendar
 *  - `coming-soon`   a region that is not active (yet) -> friendly hint page;
 *                    also an unavailable combined view without any active
 *                    region in scope (`view` set, `region` null)
 *  - `all-regions`   an available combined view (`view`)
 *  - `redirect`      an unavailable combined view with a fallback: `redirect`
 *                    is `{ region }` (the single active region)
 *  - `profile`       anything else -> public profile (usernames never collide
 *                    with region slugs, username.js reserves them)
 * `region` is null for combined views and for profiles.
 */
export function resolveTopLevelSlug(slug, regions = STATIC_REGIONS) {
  if (isCombinedViewSlug(slug)) {
    const view = getCombinedView(slug);
    if (isCombinedViewAvailable(view, regions)) return { kind: 'all-regions', region: null, view };
    const fallback = combinedViewFallback(view, regions);
    if (fallback) return { kind: 'redirect', region: null, view, redirect: fallback };
    return { kind: 'coming-soon', region: null, view };
  }
  if (isRegionSlug(slug)) {
    const region = getRegionBySlug(slug, regions);
    if (region?.active) return { kind: 'region', region };
    return { kind: 'coming-soon', region };
  }
  return { kind: 'profile', region: null };
}

/** Region slug (or combined-view slug) named by the first path segment, else null. */
export function regionSlugFromPath(pathname) {
  if (typeof pathname !== 'string') return null;
  const first = pathname.split('/').filter(Boolean)[0];
  if (!first) return null;
  const slug = first.toLowerCase();
  return isRegionSlug(slug) || isCombinedViewSlug(slug) ? slug : null;
}

/** Path a redirect fallback points to (`path` is kept, e.g. `/verzeichnis`). */
export function redirectTargetPath(fallback, path = '/', regions = STATIC_REGIONS) {
  if (fallback?.region) return regionCanonicalPath(fallback.region.id, path, regions);
  return '/';
}

/**
 * Region for the current page. The URL wins; an inactive or unknown region in
 * the URL does not become the context. Without one, the stored last region
 * (when still active), else the default.
 */
export function resolveCurrentRegionId({ urlSlug, storedSlug, regions = STATIC_REGIONS } = {}) {
  const isActive = (slug) => Boolean(getRegionBySlug(slug, regions)?.active);
  if (urlSlug && isRegionSlug(urlSlug) && isActive(urlSlug)) return urlSlug;
  if (storedSlug && isRegionSlug(storedSlug) && isActive(storedSlug)) return storedSlug;
  return DEFAULT_REGION_ID;
}

/**
 * Address of a page inside a region: `regionPath('tirol')` -> `/tirol`,
 * `regionPath('tirol', '/verzeichnis')` -> `/tirol/verzeichnis`. Accepts a
 * region object or a slug.
 */
export function regionPath(region, path = '/') {
  const slug = typeof region === 'string' ? region : region?.slug;
  const safeSlug = isRegionSlug(slug) || isCombinedViewSlug(slug) ? slug : DEFAULT_REGION_ID;
  const suffix = !path || path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `/${safeSlug}${suffix}`;
}

/**
 * Canonical path for a region page. While the default region is the only
 * active one, its pages keep their old addresses (`/`, `/verzeichnis`) so
 * nothing changes for visitors or search engines; afterwards every region
 * page points to its region address.
 */
export function regionCanonicalPath(regionId, path = '/', regions = STATIC_REGIONS) {
  const active = activeRegions(regions);
  const onlyDefault = active.length <= 1 && regionId === DEFAULT_REGION_ID;
  if (onlyDefault) return path || '/';
  return regionPath(regionId, path);
}

/**
 * "in der Steiermark", "im Allgäu", "in Tirol": for running text on region
 * pages. Uses the register's `inPhrase` (src/utils/regions.js); a region
 * object without one falls back to "in <Name>".
 */
export function regionLocative(region) {
  if (typeof region?.inPhrase === 'string' && region.inPhrase) return region.inPhrase;
  const known = getRegionBySlug(region?.slug)?.inPhrase;
  return known || `in ${region?.name ?? ''}`;
}

/**
 * Area a region switch keeps: `/verzeichnis` for the directory (with or
 * without region prefix), `/` for everything else (calendar, events, profiles).
 */
export function regionSwitchSubpath(pathname) {
  const segments = typeof pathname === 'string' ? pathname.split('/').filter(Boolean) : [];
  const first = segments[0]?.toLowerCase();
  const hasRegion = first && (isRegionSlug(first) || isCombinedViewSlug(first));
  const rest = hasRegion ? segments.slice(1) : segments;
  return rest.length === 1 && rest[0] === 'verzeichnis' ? '/verzeichnis' : '/';
}

export const REGION_CHOOSER_SEEN_KEY = 'tribe:regionChooserSeen';

export function readRegionChooserSeen(storage) {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    return store?.getItem(REGION_CHOOSER_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeRegionChooserSeen(storage) {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    store?.setItem(REGION_CHOOSER_SEEN_KEY, '1');
  } catch {
    // ignore: the chooser may then show again next visit
  }
}

// localStorage can be missing or throw (private mode, blocked storage): both
// helpers swallow errors, the region then simply comes from the URL/default.
export function readLastRegion(storage) {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    const value = store?.getItem(LAST_REGION_STORAGE_KEY) ?? null;
    return isRegionSlug(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLastRegion(slug, storage) {
  if (!isRegionSlug(slug)) return;
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    store?.setItem(LAST_REGION_STORAGE_KEY, slug);
  } catch {
    // ignore: remembering the region is a convenience only
  }
}
