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

// Combined views (`/oesterreich`, `/schweiz`, `/alle-tribes`) are not regions:
// never stored on an event or profile, reserved as usernames (username.js). A
// country view covers the ACTIVE regions of that country, "Alle Tribes" all
// active regions of all countries incl. Liechtenstein (definitions: COMBINED_VIEWS
// in regions.js). Liechtenstein has no country view of its own.
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

/**
 * Pages that belong to no region (the association's legal pages, the same for
 * every region). They name no region in their address, so they keep the region
 * (or combined view) of the page the visitor came from: neutral header, and the
 * footer's region links ("Über uns") still lead back to that region.
 */
export const NEUTRAL_PAGE_PATHS = ['/impressum', '/datenschutz', '/login'];

export const isNeutralPagePath = (pathname) => NEUTRAL_PAGE_PATHS.includes(pathname);

// Last region or combined-view slug named by an address in this tab (also a
// region that is not open yet). Session only: it carries the context across
// neutral pages and a reload of them, nothing more.
export const LAST_PAGE_SLUG_STORAGE_KEY = 'tribe:lastPageSlug';

export function readLastPageSlug(storage) {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null);
    const value = store?.getItem(LAST_PAGE_SLUG_STORAGE_KEY) ?? null;
    return isRegionSlug(value) || isCombinedViewSlug(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLastPageSlug(slug, storage) {
  if (!isRegionSlug(slug) && !isCombinedViewSlug(slug)) return;
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null);
    store?.setItem(LAST_PAGE_SLUG_STORAGE_KEY, slug);
  } catch {
    // ignore: a convenience only
  }
}

/**
 * Address of "Über uns" for a page. `pageSlug` is the region or combined-view
 * slug the page belongs to (its address, or on a neutral page the one the
 * visitor came from), `regionId` the region context for pages without one.
 * A region that is not open yet still has its own page; combined views use
 * the general `/ueber-uns`; Vorarlberg keeps `/ueber-uns` while it is the only
 * active region.
 */
export function aboutPathFor({ pageSlug, regionId, regions = STATIC_REGIONS } = {}) {
  if (isCombinedViewSlug(pageSlug)) return '/ueber-uns';
  if (isRegionSlug(pageSlug)) {
    return getRegionBySlug(pageSlug, regions)?.active
      ? regionCanonicalPath(pageSlug, '/ueber-uns', regions)
      : regionPath(pageSlug, '/ueber-uns');
  }
  return regionCanonicalPath(regionId, '/ueber-uns', regions);
}

/**
 * Start page for a page: "Zurück zur Startseite" on neutral pages (Impressum,
 * Datenschutz). Leads to the region / combined view the page belongs to, `/`
 * when it names none.
 */
export function homePathFor({ pageSlug, regions = STATIC_REGIONS } = {}) {
  if (isCombinedViewSlug(pageSlug)) return regionPath(pageSlug, '/');
  if (isRegionSlug(pageSlug)) {
    return getRegionBySlug(pageSlug, regions)?.active
      ? regionCanonicalPath(pageSlug, '/', regions)
      : regionPath(pageSlug, '/');
  }
  return '/';
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
 * Target of the header logo. Signed-in people whose profile names a region
 * (`users/{uid}.placeSelection.regionId`) go to that region's page while it is
 * active, otherwise to "Wo suchst du?" (`/regionen`). Everyone else, and
 * everyone while fewer than two regions are active or the region config is still
 * loading (the static register only knows Vorarlberg as active), goes to `/`.
 */
export function logoTargetPath(
  profileRegionId,
  { regions = STATIC_REGIONS, loading = false, lastRegion = null } = {}
) {
  // Signed-out visitors: the region remembered in this browser (also one that is not open
  // yet, which leads to its coming-soon page); never silently the default region.
  if (!profileRegionId && lastRegion && !loading && activeRegions(regions).length >= 2) {
    return getRegionBySlug(lastRegion, regions)?.active
      ? regionCanonicalPath(lastRegion, '/', regions)
      : regionPath(lastRegion, '/');
  }
  if (!profileRegionId || loading || activeRegions(regions).length < 2) return '/';
  return getRegionBySlug(profileRegionId, regions)?.active
    ? regionCanonicalPath(profileRegionId, '/', regions)
    : REGIONS_PAGE_PATH;
}

/**
 * Target of the header's "Kalender" (`path` '/') and "Verzeichnis" ('/verzeichnis') links
 * (Trello gflD7CXa). They keep the visitor's region on every page, also on pages without one
 * in the address (event form, login, profile): the region or combined view of the page
 * (`pageSlug`), else the region of the chosen place, else the last chosen region. `/` and
 * `/verzeichnis` would fall back to Vorarlberg for a region that is not open yet, so such a
 * region leads to its coming-soon page instead. An active region without a page slug keeps
 * the plain path (it shows that region already). Dark launch: the plain path while fewer
 * than two regions are active or the region config is loading.
 */
export function regionNavPath(
  path,
  {
    pageSlug = null,
    placeRegionId = null,
    lastRegion = null,
    regions = STATIC_REGIONS,
    loading = false,
  } = {}
) {
  if (loading || activeRegions(regions).length < 2) return path;
  if (isCombinedViewSlug(pageSlug)) return regionPath(pageSlug, path);
  const slug = [pageSlug, placeRegionId ?? lastRegion].find(
    (s) => isRegionSlug(s) && getRegionBySlug(s, regions)
  );
  if (!slug) return path;
  if (!getRegionBySlug(slug, regions).active) return regionPath(slug, path);
  return slug === pageSlug ? regionCanonicalPath(slug, path, regions) : path;
}

/**
 * "in der Steiermark", "im Tessin", "in Tirol": for running text on region
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
// "Wo suchst du?" (RegionChooser) opened on purpose (switcher, burger menu).
export const REGIONS_PAGE_PATH = '/regionen';
// Entry pages without a region in the address that show the chooser on a first visit:
// never on a region address, event page or profile, so crawlers and previews are unaffected.
export const CHOOSER_PATHS = ['/', '/verzeichnis'];

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

// Written into the prerendered `/` (scripts/prerender.mjs) ONLY with two or more active
// regions, so the app knows before the `regions` collection has loaded that a first-time
// visitor will get the "Wo suchst du?" page (no Vorarlberg calendar flashing first, eFPKzCr7).
// With one active region the tag is absent and nothing changes (dark launch).
export const REGION_MODE_META_NAME = 'tribe-region-mode';
export const REGION_MODE_META_MULTI = 'multi';
// The plain `index.html` (staging and dev, which are built without the prerender) says
// "unknown": the number of active regions is only known once the config has loaded.
export const REGION_MODE_META_UNKNOWN = 'unknown';

/** Content of the region-mode tag ('multi' | 'unknown'), null without it (prerendered, one region). */
export function readRegionModeHint(doc) {
  try {
    const d = doc ?? (typeof document !== 'undefined' ? document : null);
    const meta = d?.querySelector?.(`meta[name="${REGION_MODE_META_NAME}"]`);
    return meta?.getAttribute('content') ?? null;
  } catch {
    return null;
  }
}

export function readMultiRegionHint(doc) {
  return readRegionModeHint(doc) === REGION_MODE_META_MULTI;
}

/**
 * Whether the "Wo suchst du?" page covers the current page. `/regionen` opened on purpose,
 * or `/` and `/verzeichnis` while nothing is remembered. Once the region config has loaded,
 * a remembered last region counts only while it is active. While it is still loading the
 * chooser shows only with the prerender's multi-region hint or when the page cannot know
 * (`regionModeUnknown`, plain index.html; RegionChooser then only covers the page until the
 * config decides), and then any remembered region counts (so returning visitors never see it
 * flash).
 */
export function shouldOpenRegionChooser({
  pathname,
  loading,
  activeCount,
  multiRegionHint = false,
  regionModeUnknown = false,
  chooserSeen = false,
  hasPlaceSelection = false,
  lastRegion = null,
  regions = STATIC_REGIONS,
}) {
  const regionMode = loading ? multiRegionHint || regionModeUnknown : activeCount >= 2;
  if (!regionMode) return false;
  if (pathname === REGIONS_PAGE_PATH) return true;
  if (!CHOOSER_PATHS.includes(pathname)) return false;
  const lastRegionRemembered = loading
    ? Boolean(lastRegion)
    : Boolean(lastRegion && getRegionBySlug(lastRegion, regions)?.active);
  return !(chooserSeen || hasPlaceSelection || lastRegionRemembered);
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
