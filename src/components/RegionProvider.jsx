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

/**
 * Region context for the whole app. The URL (`/tirol`, `/tirol/verzeichnis`)
 * is the source of truth; `/` and other pages without a region use the last
 * region chosen through the URL (localStorage) or Vorarlberg. Event pages lay
 * the event's region over that while they are open. The region config comes
 * from `useRegions()` (static register first, Firestore when loaded).
 */
export default function RegionProvider({ children }) {
  const { pathname } = useLocation();
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
    // Neutral header ("Dein Kalender"): region chooser (/regionen and first visit),
    // coming-soon pages and the event form for a region that is not open yet.
    const stored = readLastRegion();
    const firstVisitChooser =
      !loading &&
      activeRegions(allRegions).length >= 2 &&
      ['/', '/verzeichnis'].includes(pathname) &&
      !(readRegionChooserSeen() || Boolean(stored && getRegionBySlug(stored, allRegions)?.active));
    const neutralHeader =
      comingSoon || eventRegionComingSoon || pathname === '/regionen' || firstVisitChooser;
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
      // Active regions the current combined view covers ([] outside one).
      combinedRegions: combinedView ? combinedViewRegions(combinedView, allRegions) : [],
      // Combined views offered in chooser and switcher.
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
