// Pure routing helpers for region addresses (`/vorarlberg`, `/tirol/verzeichnis`,
// `/oesterreich`). The URL is the source of truth for the region; the last
// chosen region in localStorage only fills in where the URL names none (`/`).
// No Firebase imports, so Vitest covers it without an emulator.
import { DEFAULT_REGION_ID, STATIC_REGIONS, getRegionBySlug, isRegionSlug } from './regions.js';

// Slug of the combined "all regions" view. Not a region: never stored on an
// event or profile, reserved as a username (username.js).
export const ALL_REGIONS_SLUG = 'oesterreich';
export const ALL_REGIONS_NAME = 'Ganz Österreich';

export const LAST_REGION_STORAGE_KEY = 'tribe:lastRegion';

export const activeRegions = (regions = STATIC_REGIONS) => regions.filter((r) => r.active);

// The combined view only makes sense with at least two active regions. Until
// then `/oesterreich` shows the coming-soon page.
export const isAllRegionsViewAvailable = (regions = STATIC_REGIONS) =>
  activeRegions(regions).length > 1;

/**
 * Decides synchronously (no waiting for Firestore) what a top-level path
 * segment `/:slug` shows:
 *  - `region`        an active region -> its calendar
 *  - `coming-soon`   a region that is not active (yet) -> friendly hint page
 *  - `all-regions`   `/oesterreich` while at least two regions are active
 *  - `profile`       anything else -> public profile (usernames never collide
 *                    with region slugs, username.js reserves them)
 * `region` is null for the combined view and for profiles.
 */
export function resolveTopLevelSlug(slug, regions = STATIC_REGIONS) {
  if (slug === ALL_REGIONS_SLUG) {
    return isAllRegionsViewAvailable(regions)
      ? { kind: 'all-regions', region: null }
      : { kind: 'coming-soon', region: null };
  }
  if (isRegionSlug(slug)) {
    const region = getRegionBySlug(slug, regions);
    if (region?.active) return { kind: 'region', region };
    return { kind: 'coming-soon', region };
  }
  return { kind: 'profile', region: null };
}

/** Region slug (or the all-regions slug) named by the first path segment, else null. */
export function regionSlugFromPath(pathname) {
  if (typeof pathname !== 'string') return null;
  const first = pathname.split('/').filter(Boolean)[0];
  if (!first) return null;
  const slug = first.toLowerCase();
  return isRegionSlug(slug) || slug === ALL_REGIONS_SLUG ? slug : null;
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
  const safeSlug = isRegionSlug(slug) || slug === ALL_REGIONS_SLUG ? slug : DEFAULT_REGION_ID;
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

/** "in der Steiermark", "in Tirol": for running text on region pages. */
export function regionLocative(region) {
  const name = region?.name ?? '';
  return region?.slug === 'steiermark' ? `in der ${name}` : `in ${name}`;
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
