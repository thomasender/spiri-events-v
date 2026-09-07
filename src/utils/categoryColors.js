// Category color utilities. As of the categories-registry refactor, colors
// are owned by the `categories` collection in Firestore and managed by
// admins. The constants below are kept for two narrow use cases:
//
//   1. `CATEGORY_COLORS` / `SEED_CATEGORIES` — the canonical seed for the
//      initial categories the app boots with. The client-side seed runs
//      once on app start (see `seedCategoriesIfEmpty`).
//   2. `getCategoryColor(category, eventCategoryColor)` — a synchronous
//      fallback that supports legacy events whose `categoryColor` field
//      was set by the now-removed user-facing color popup. Modern events
//      do not carry `categoryColor`; they read their color from the
//      registry via the `useCategoryRegistry` hook.

export const FALLBACK_CATEGORY_COLOR = '#605e5e';

// Canonical 7 seed categories. Identical to the legacy `CATEGORY_COLORS`
// map so the registry, once seeded, produces the same display colors that
// the old hardcoded map produced.
export const CATEGORY_COLORS = {
  Yoga: '#c48e6a',
  Breathwork: '#bf5b4e',
  Meditation: '#5c6b3f',
  Tanz: '#8a6d2f',
  Singen: '#9a5f38',
  Soundhealing: '#6b568b',
  Sonstiges: '#605e5e',
};

// Structured seed (id derived from a lowercase slug of the name) for the
// first-run client-side bootstrap. The id format matches what admins will
// produce in the UI, so the seed writes to the same ids admins would have
// chosen.
export const SEED_CATEGORIES = Object.entries(CATEGORY_COLORS).map(([name, color]) => ({
  id: name.toLowerCase(),
  name,
  color,
}));

// Synchronous lookup used during the brief window before the registry
// snapshot arrives from Firestore. New events never carry a categoryColor;
// the param exists only for backward compat with events created before
// the registry existed.
export function getCategoryColor(category, eventCategoryColor) {
  if (eventCategoryColor) return eventCategoryColor;
  if (!category) return FALLBACK_CATEGORY_COLOR;
  return CATEGORY_COLORS[category] || FALLBACK_CATEGORY_COLOR;
}

// Resolves the display color for an event. Priority:
//   1. Legacy per-event override (events created before the registry).
//   2. Registry color for the category name.
//   3. Synchronous seed-map fallback (used during the brief window before
//      the registry snapshot has arrived).
//   4. Neutral fallback (`FALLBACK_CATEGORY_COLOR`).
export function resolveEventColor(event, colorByName) {
  if (!event) return FALLBACK_CATEGORY_COLOR;
  if (event.categoryColor) return event.categoryColor;
  const fromRegistry = colorByName && colorByName.get(event.category);
  if (fromRegistry) return fromRegistry;
  return getCategoryColor(event.category);
}
