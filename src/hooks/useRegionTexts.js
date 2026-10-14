import { useMemo } from 'react';
import { useRegion } from './useRegion';
import { regionTexts } from '../utils/regionTexts';

/** Region-aware texts for the current region (see src/utils/regionTexts.js). */
export function useRegionTexts() {
  const { region, regions, isNational, combinedView } = useRegion();
  const activeCount = regions.length;
  return useMemo(
    () => regionTexts(region, { activeCount, national: isNational, view: combinedView }),
    [region, activeCount, isNational, combinedView]
  );
}
