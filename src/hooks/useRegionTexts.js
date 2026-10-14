import { useMemo } from 'react';
import { useRegion } from './useRegion';
import { regionTexts } from '../utils/regionTexts';

/** Region-aware texts for the current region (see src/utils/regionTexts.js). */
export function useRegionTexts() {
  const { region, regions, isNational } = useRegion();
  const activeCount = regions.length;
  return useMemo(
    () => regionTexts(region, { activeCount, national: isNational }),
    [region, activeCount, isNational]
  );
}
