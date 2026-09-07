import { useMemo } from 'react';
import { useCategoryRegistry } from './useCategoryRegistry';

// Returns the sorted list of category names from the registry. This is the
// canonical source for filter chips, dropdowns, and similar UI. Event forms
// merge in any session-local "extras" (a name the user is currently typing)
// themselves, since those don't live in the registry until the event is
// approved.
export function useCategories() {
  const { categories } = useCategoryRegistry();
  return useMemo(() => categories.map((cat) => cat.name), [categories]);
}
