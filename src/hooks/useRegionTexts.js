import { useMemo } from 'react';
import { useRegion } from './useRegion';
import { regionTexts } from '../utils/regionTexts';

const NEUTRAL_HEADER_TITLE = 'Dein Kalender für bewusste Veranstaltungen';

/** Region-aware texts for the current region (see src/utils/regionTexts.js). */
export function useRegionTexts() {
  const { region, regions, isNational, combinedView, comingSoon } = useRegion();
  const activeCount = regions.length;
  return useMemo(() => {
    const texts = regionTexts(region, { activeCount, national: isNational, view: combinedView });
    // A region that is not open yet gets a neutral header (no place name).
    return comingSoon ? { ...texts, headerTitle: NEUTRAL_HEADER_TITLE } : texts;
  }, [region, activeCount, isNational, combinedView, comingSoon]);
}
