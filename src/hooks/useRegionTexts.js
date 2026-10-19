import { useMemo } from 'react';
import { useRegion } from './useRegion';
import { regionTexts } from '../utils/regionTexts';

const NEUTRAL_HEADER_TITLE = 'Dein Kalender';

/** Region-aware texts for the current region (see src/utils/regionTexts.js). */
export function useRegionTexts() {
  const { region, regions, isNational, combinedView, neutralHeader } = useRegion();
  const activeCount = regions.length;
  return useMemo(() => {
    const texts = regionTexts(region, { activeCount, national: isNational, view: combinedView });
    // Chooser, coming-soon and not-yet-open event form get a neutral header (no place name).
    return neutralHeader ? { ...texts, headerTitle: NEUTRAL_HEADER_TITLE } : texts;
  }, [region, activeCount, isNational, combinedView, neutralHeader]);
}
