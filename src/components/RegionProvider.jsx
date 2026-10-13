import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRegions } from '../hooks/useRegions';
import { RegionContext } from '../hooks/useRegion';
import { getRegionBySlug, isRegionSlug } from '../utils/regions';
import {
  ALL_REGIONS_SLUG,
  activeRegions,
  isAllRegionsViewAvailable,
  readLastRegion,
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
      if (slug === ALL_REGIONS_SLUG) {
        navigate(regionPath(ALL_REGIONS_SLUG, path));
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
    const isNational = urlSlug === ALL_REGIONS_SLUG && isAllRegionsViewAvailable(allRegions);
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
      loading,
      setRegion,
      setEventRegion,
    };
  }, [urlSlug, eventRegionId, storedSlug, allRegions, loading, setRegion, setEventRegion]);

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}
