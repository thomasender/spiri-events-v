export const CATEGORY_FALLBACKS = {
  Yoga: '/event-fallbacks/yoga.jpg',
  Meditation: '/event-fallbacks/meditation.jpg',
  Tanz: '/event-fallbacks/tanz.jpg',
  Singen: '/event-fallbacks/singen.png',
  Atemarbeit: '/event-fallbacks/atemarbeit.jpg',
  Sonstiges: '/event-fallbacks/sonstiges.svg',
};

export const DEFAULT_EVENT_FALLBACK = '/event-fallbacks/sonstiges.svg';

export function getCategoryFallbackImage(category) {
  if (!category) return DEFAULT_EVENT_FALLBACK;
  return CATEGORY_FALLBACKS[category] || DEFAULT_EVENT_FALLBACK;
}

export function getEventFallbackImage(event) {
  const primary = event?.categories?.[0];
  return getCategoryFallbackImage(primary);
}
