export const CATEGORY_FALLBACKS = {
  Yoga: '/event-fallbacks/yoga.jpg',
  Breathwork: '/event-fallbacks/breathwork.jpg',
  Meditation: '/event-fallbacks/meditation.jpg',
  Tanz: '/event-fallbacks/tanz.jpg',
  Singen: '/event-fallbacks/singen.jpg',
  Soundhealing: '/event-fallbacks/soundhealing.jpeg',
  Sonstiges: '/event-fallbacks/sonstiges.jpg',
};

export const DEFAULT_EVENT_FALLBACK = '/event-fallbacks/sonstiges.jpg';

export function getCategoryFallbackImage(category) {
  if (!category) return DEFAULT_EVENT_FALLBACK;
  return CATEGORY_FALLBACKS[category] || DEFAULT_EVENT_FALLBACK;
}

export function getEventFallbackImage(event) {
  return getCategoryFallbackImage(event?.category);
}
