import { useMemo } from 'react';
import { useRegion } from './useRegion';
import { regionTexts } from '../utils/regionTexts';
import { GLOBAL_VIEW_SLUG, namedRegionOf } from '../utils/regionRouting';

const NEUTRAL_HEADER_TITLE = 'Dein Kalender';

/**
 * Region-aware texts for the region the page names (see src/utils/regionTexts.js and
 * namedRegionId): no region named -> the wording of "Alle Tribes" (no place, bUcG9rBf).
 */
export function useRegionTexts() {
  const context = useRegion();
  const { regions, isNational, combinedView, neutralHeader } = context;
  const region = namedRegionOf(context);
  const activeCount = regions.length;
  return useMemo(() => {
    const texts = regionTexts(region, {
      activeCount,
      national: isNational || !region,
      view: combinedView ?? (region ? null : GLOBAL_VIEW_SLUG),
    });
    // Chooser, coming-soon and not-yet-open event form get a neutral header (no place name).
    return neutralHeader ? { ...texts, headerTitle: NEUTRAL_HEADER_TITLE } : texts;
  }, [region, activeCount, isNational, combinedView, neutralHeader]);
}
