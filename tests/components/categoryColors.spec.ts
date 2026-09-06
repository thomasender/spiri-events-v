import { describe, it, expect } from 'vitest';
import {
  CATEGORY_COLORS,
  FALLBACK_CATEGORY_COLOR,
  getCategoryColor,
} from '../../src/utils/categoryColors';

describe('CATEGORY_COLORS', () => {
  it('keeps existing seed entries for backward compatibility', () => {
    expect(CATEGORY_COLORS.Yoga).toBeTruthy();
    expect(CATEGORY_COLORS.Meditation).toBeTruthy();
    expect(CATEGORY_COLORS.Sonstiges).toBeTruthy();
  });
});

describe('getCategoryColor', () => {
  it('returns the mapped color for a known category', () => {
    expect(getCategoryColor('Yoga')).toBe(CATEGORY_COLORS.Yoga);
    expect(getCategoryColor('Meditation')).toBe(CATEGORY_COLORS.Meditation);
  });

  it('returns the fallback for unknown categories', () => {
    expect(getCategoryColor('Pilates')).toBe(FALLBACK_CATEGORY_COLOR);
    expect(getCategoryColor('Qi Gong')).toBe(FALLBACK_CATEGORY_COLOR);
  });

  it('returns the fallback for null/undefined/empty input', () => {
    expect(getCategoryColor(null)).toBe(FALLBACK_CATEGORY_COLOR);
    expect(getCategoryColor(undefined)).toBe(FALLBACK_CATEGORY_COLOR);
    expect(getCategoryColor('')).toBe(FALLBACK_CATEGORY_COLOR);
  });
});
