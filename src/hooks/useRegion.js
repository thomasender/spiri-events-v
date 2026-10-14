import { createContext, useContext, useEffect, useMemo } from 'react';
import {
  DEFAULT_REGION_ID,
  STATIC_REGIONS,
  filterDirectoryForRegion,
  filterEventsForRegion,
  getAllDistricts,
  getBezirke,
  getRegionBySlug,
  resolveRegionId,
} from '../utils/regions';
import {
  ALL_REGIONS_SLUG,
  activeRegions,
  regionCanonicalPath,
  regionPath,
} from '../utils/regionRouting';

const noop = () => {};

// Used when no RegionProvider is mounted (component tests, isolated renders):
// the static register with Vorarlberg, i.e. exactly today's behaviour.
export const DEFAULT_REGION_CONTEXT = Object.freeze({
  region: getRegionBySlug(DEFAULT_REGION_ID),
  regionId: DEFAULT_REGION_ID,
  regions: activeRegions(STATIC_REGIONS),
  allRegions: STATIC_REGIONS,
  isNational: false,
  loading: false,
  setRegion: noop,
  setEventRegion: noop,
});

export const RegionContext = createContext(DEFAULT_REGION_CONTEXT);

/**
 * Current region: `region`, `regionId`, `isNational` (combined view),
 * `regions` (active only), `allRegions`, `setRegion(slug)` (navigates).
 */
export function useRegion() {
  return useContext(RegionContext);
}

/**
 * Event pages: uses the event's region as context (back link, header) while the
 * page is open. The URL stays `/event/<slug>`.
 */
export function useEventRegionContext(event) {
  const { setEventRegion } = useRegion();
  const regionId = event ? resolveRegionId(event) : null;
  useEffect(() => {
    if (!regionId) return undefined;
    setEventRegion(regionId);
    return () => setEventRegion(null);
  }, [regionId, setEventRegion]);
}

/**
 * Canonical path of a region page (`/`, `/verzeichnis`) for the current
 * region. Unchanged addresses while Vorarlberg is the only active region.
 */
export function useRegionCanonicalPath(path = '/') {
  const { regionId, allRegions, isNational } = useRegion();
  if (isNational) return regionPath(ALL_REGIONS_SLUG, path);
  return regionCanonicalPath(regionId, path, allRegions);
}

/**
 * Public event lists: events of the current region plus online events; in the
 * combined view all events of active regions. Events of inactive regions never
 * pass. `{ allActive: true }` skips the region restriction (favourites) but
 * keeps the inactive-region rule.
 */
export function useRegionEvents(events, { allActive = false } = {}) {
  const { regionId, regions, isNational } = useRegion();
  const activeKey = regions.map((r) => r.id).join(',');
  return useMemo(
    () =>
      filterEventsForRegion(events, {
        regionId,
        isNational: isNational || allActive,
        activeRegionIds: activeKey ? activeKey.split(',') : [],
      }),
    [events, regionId, isNational, allActive, activeKey]
  );
}

/** Directory profiles listed in the current region (combined view: any active region). */
export function useRegionDirectoryEntries(entries) {
  const { regionId, regions, isNational } = useRegion();
  const activeKey = regions.map((r) => r.id).join(',');
  return useMemo(
    () =>
      filterDirectoryForRegion(entries, {
        regionId,
        isNational,
        activeRegionIds: activeKey ? activeKey.split(',') : [],
      }),
    [entries, regionId, isNational, activeKey]
  );
}

/** Bezirke / Landkreise of the current region (combined view: those of all active regions). */
export function useRegionBezirke() {
  const { regionId, regions, allRegions, isNational } = useRegion();
  return useMemo(
    () => (isNational ? getAllDistricts(regions) : getBezirke(regionId, allRegions)),
    [isNational, regionId, regions, allRegions]
  );
}
