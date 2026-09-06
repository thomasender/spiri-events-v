// Per-category color used for chips, calendar legend dots, and event tile
// category badges. Hex values keep the picker logic simple (compare colors
// directly) and are still valid CSS color values for `style={{ backgroundColor }}`.
export const CATEGORY_COLORS = {
  Yoga: '#c48e6a',
  Breathwork: '#bf5b4e',
  Meditation: '#5c6b3f',
  Tanz: '#8a6d2f',
  Singen: '#9a5f38',
  Soundhealing: '#6b568b',
  Sonstiges: '#605e5e',
};

// 8-color palette offered to users when they create a brand-new category.
// The first 7 entries match the seed categories above so any color a user
// might have chosen historically still lines up. The 8th entry is the only
// "free" slot for a brand-new category out of the box.
export const CATEGORY_COLOR_PALETTE = [
  { value: '#c48e6a', label: 'Terracotta' },
  { value: '#bf5b4e', label: 'Terracotta-Rot' },
  { value: '#5c6b3f', label: 'Olivgrün' },
  { value: '#8a6d2f', label: 'Senfgelb' },
  { value: '#9a5f38', label: 'Dunkles Terracotta' },
  { value: '#6b568b', label: 'Violett' },
  { value: '#605e5e', label: 'Warmgrau' },
  { value: '#4a7572', label: 'Tiefes Teal' },
];

export const FALLBACK_CATEGORY_COLOR = '#605e5e';

export function getCategoryColor(category, eventCategoryColor) {
  if (eventCategoryColor) return eventCategoryColor;
  if (!category) return FALLBACK_CATEGORY_COLOR;
  return CATEGORY_COLORS[category] || FALLBACK_CATEGORY_COLOR;
}

export function getPaletteColorValues() {
  return CATEGORY_COLOR_PALETTE.map((entry) => entry.value);
}
