import { useMemo } from 'react';
import { useAllEvents } from './useEvents';
import { CATEGORY_COLORS } from '../utils/categoryColors';

// Returns a Set of hex color strings already in use so the category color
// picker can grey out swatches that would clash with an existing mapping or
// with another user-created category's stored color.
export function useUsedCategoryColors() {
  const { events } = useAllEvents();

  return useMemo(() => {
    const used = new Set(Object.values(CATEGORY_COLORS));
    for (const event of events) {
      if (event.categoryColor && typeof event.categoryColor === 'string') {
        used.add(event.categoryColor);
      }
    }
    return used;
  }, [events]);
}
