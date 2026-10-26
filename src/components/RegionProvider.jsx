import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRegions } from '../hooks/useRegions';
import { RegionContext } from '../hooks/useRegion';
import { getRegionBySlug, isCombinedViewSlug, isPopulated, isRegionSlug } from '../utils/regions';
import {
  activeRadiusFilter,
  normalizeSelection,
  readPlaceSelection,
  writePlaceSelection,
} from '../utils/placeSelection';
import {
  CHOOSER_PATHS,
  REGIONS_PAGE_PATH,
  activeRegions,
  availableCombinedViews,
  combinedViewRegions,
  getCombinedView,
  isCombinedViewAvailable,
  readLastRegion,
  readRegionChooserSeen,
  regionPath,
  regionSlugFromPath,
  resolveCurrentRegionId,
  writeLastRegion,
} from '../utils/regionRouting';

// Pages that belong to no region (legal pages of the association): neutral header.
const NEUTRAL_HEADER_PATHS = ['/impressum', '/datenschutz'];

/**
 * Region context for the whole app. The URL (`/tirol`, `/tirol/verzeichnis`)
 * is the source of truth; `/` and other pages without a region use the last
 * region chosen through the URL (localStorage) or Vorarlberg. Event pages lay
 * the event's region over that while they are open. The region config comes
 * from `useRegions()` (static register first, Firestore when loaded).
 */
export default function RegionProvider({ children }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { regions: registry, loading } = useRegions();
  // A region without Landkreise / Bezirke does not exist for visitors (see isPopulated).
  const allRegions = useMemo(() => registry.filter(isPopulated), [registry]);
  const [storedSlug, setStoredSlug] = useState(() => readLastRegion());
  const [eventRegionId, setEventRegionId] = useState(null);
  // "Wo bist du?": the remembered place + radius (browser; PlaceSelectionSync mirrors it to
  // the profile of signed-in users).
  const [placeSelection, setPlaceSelectionState] = useState(() => readPlaceSelection());

  const urlSlug = regionSlugFromPath(pathname);
  const urlRegionIsActive = Boolean(
    urlSlug && isRegionSlug(urlSlug) && getRegionBySlug(urlSlug, allRegions)?.active
  );

  // Remember a region only when the visitor really opened its address.
  useEffect(() => {
    if (!urlRegionIsActive) return;
    writeLastRegion(urlSlug);
    setStoredSlug(urlSlug);
  }, [urlSlug, urlRegionIsActive]);

  const setRegion = useCallback(
    (slug, path = '/') => {
      if (isCombinedViewSlug(slug)) {
        navigate(regionPath(slug, path));
        return;
      }
      if (!isRegionSlug(slug)) return;
      writeLastRegion(slug);
      setStoredSlug(slug);
      navigate(regionPath(slug, path));
    },
    [navigate]
  );

  // `selection` null forgets the place. A selection that comes from the profile keeps its own
  // timestamp (`keepTime`), a new choice is stamped now so the newer one wins on sign-in.
  const setPlaceSelection = useCallback((selection, { keepTime = false } = {}) => {
    const clean = normalizeSelection(
      selection ? { ...selection, updatedAt: keepTime ? selection.updatedAt : Date.now() } : null
    );
    writePlaceSelection(clean);
    setPlaceSelectionState(clean);
  }, []);

  const setEventRegion = useCallback((regionId) => {
    setEventRegionId(isRegionSlug(regionId) ? regionId : null);
  }, []);

  const value = useMemo(() => {
    // Combined view named by the URL, only while it is available (otherwise the
    // route redirects or shows the coming-soon page).
    const urlView = urlSlug ? getCombinedView(urlSlug) : null;
    const combinedView = urlView && isCombinedViewAvailable(urlView, allRegions) ? urlView : null;
    const isNational = Boolean(combinedView);
    const comingSoon = Boolean(
      urlSlug &&
      ((urlView && !combinedView) ||
        (isRegionSlug(urlSlug) && !getRegionBySlug(urlSlug, allRegions)?.active))
    );
    const eventRegionComingSoon = Boolean(
      !urlSlug && eventRegionId && !getRegionBySlug(eventRegionId, allRegions)?.active
    );
    // Dark launch: with fewer than two active regions nothing below changes the header.
    const regionMode = !loading && activeRegions(allRegions).length >= 2;
    // "Event erstellen" for a region that is not open yet (`/admin/new?region=<slug>`, from
    // its coming-soon page): the form reads the region from the address itself.
    const formRegion = pathname === '/admin/new' ? new URLSearchParams(search).get('region') : null;
    const eventFormComingSoon = Boolean(
      regionMode && isRegionSlug(formRegion) && !getRegionBySlug(formRegion, allRegions)?.active
    );
    // "Wo suchst du?" page (RegionChooser): `/regionen` opened on purpose, or `/` and
    // `/verzeichnis` while nothing is remembered (place, chooser seen, active last region).
    const stored = readLastRegion();
    const chooserRemembered =
      readRegionChooserSeen() ||
      Boolean(placeSelection) ||
      Boolean(stored && getRegionBySlug(stored, allRegions)?.active);
    const regionChooserOpen =
      regionMode &&
      (pathname === REGIONS_PAGE_PATH || (!chooserRemembered && CHOOSER_PATHS.includes(pathname)));
    // Neutral header ("Dein Kalender"): region chooser, coming-soon pages, the event
    // form for a region that is not open yet and Impressum / Datenschutz.
    const neutralHeader =
      comingSoon ||
      eventRegionComingSoon ||
      eventFormComingSoon ||
      pathname === REGIONS_PAGE_PATH ||
      regionChooserOpen ||
      (regionMode && NEUTRAL_HEADER_PATHS.includes(pathname));
    const regionId =
      !urlSlug && eventRegionId
        ? eventRegionId
        : resolveCurrentRegionId({
            urlSlug,
            storedSlug: placeSelection?.regionId ?? storedSlug,
            regions: allRegions,
          });
    const activeList = activeRegions(allRegions);
    return {
      region: getRegionBySlug(regionId, allRegions),
      regionId,
      regions: activeRegions(allRegions),
      allRegions,
      isNational,
      combinedView,
      // True on the coming-soon page of a region/view that is not open yet.
      comingSoon,
      neutralHeader,
      // True while the "Wo suchst du?" page (RegionChooser) covers the page.
      regionChooserOpen,
      // Active regions the current combined view covers ([] outside one).
      combinedRegions: combinedView ? combinedViewRegions(combinedView, allRegions) : [],
      // Combined views that are available (enough active regions).
      combinedViews: availableCombinedViews(allRegions),
      loading,
      setRegion,
      setEventRegion,
      placeSelection,
      setPlaceSelection,
      // { lat, lon, km } while the calendar shows everything within the radius, else null.
      radiusFilter: activeRadiusFilter(placeSelection, {
        regionId,
        isNational,
        activeCount: activeList.length,
      }),
    };
  }, [
    urlSlug,
    pathname,
    search,
    eventRegionId,
    storedSlug,
    allRegions,
    loading,
    setRegion,
    setEventRegion,
    placeSelection,
    setPlaceSelection,
  ]);

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}
