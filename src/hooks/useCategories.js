import { useMemo } from 'react';
import { useAllEvents, KATEGORIEN } from './useEvents';

export function useCategories() {
  const { events } = useAllEvents();

  return useMemo(() => {
    const set = new Set(KATEGORIEN);
    for (const e of events) {
      if (e.category && typeof e.category === 'string') {
        set.add(e.category);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'));
  }, [events]);
}
