import { useCallback, useMemo } from 'react';
import { useRegions } from './useRegions';
import { getRegionBySlug, resolveRegionId } from '../utils/regions';

/**
 * Region labels for staff lists. Dark launch: `multiRegion` is true only while
 * more than one region is active; with one active region `labelFor` returns
 * null everywhere, so the lists render exactly as before.
 *   labelFor(doc)  region name of the doc (no regionId = Vorarlberg) or null
 *   nameOf(id)     region name for an id
 */
export function useRegionLabels() {
  const { regions } = useRegions();
  const multiRegion = useMemo(() => regions.filter((r) => r.active).length > 1, [regions]);
  const nameOf = useCallback((id) => getRegionBySlug(id, regions)?.name || id, [regions]);
  const labelFor = useCallback(
    (doc) => (multiRegion ? nameOf(resolveRegionId(doc)) : null),
    [multiRegion, nameOf]
  );
  return { multiRegion, labelFor, nameOf, regions };
}
