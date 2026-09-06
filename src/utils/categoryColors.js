export const CATEGORY_COLORS = {
  Yoga: 'var(--accent-primary)',
  Breathwork: 'var(--error)',
  Meditation: 'var(--free-text)',
  Tanz: 'var(--pending-text)',
  Singen: 'var(--chip-text)',
  Soundhealing: 'var(--sound-healing)',
  Sonstiges: 'var(--text-secondary)',
};

export const FALLBACK_CATEGORY_COLOR = 'var(--text-secondary)';

export function getCategoryColor(category) {
  if (!category) return FALLBACK_CATEGORY_COLOR;
  return CATEGORY_COLORS[category] || FALLBACK_CATEGORY_COLOR;
}
