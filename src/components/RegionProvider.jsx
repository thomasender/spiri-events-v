import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRegions } from '../hooks/useRegions';
import { RegionContext } from '../hooks/useRegion';
import { getRegionBySlug, isCombinedViewSlug, isRegionSlug } from '../utils/regions';
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
  const { regions: allRegions, loading } = useRegions();
  const [storedSlug, setStoredSlug] = useState(() => readLastRegion());
  const [eventRegionId, setEventRegionId] = useState(null);

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
        : resolveCurrentRegionId({ urlSlug, storedSlug, regions: allRegions });
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
  ]);

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}
