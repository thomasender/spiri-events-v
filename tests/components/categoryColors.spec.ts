import { describe, it, expect } from 'vitest';
import {
  CATEGORY_COLORS,
  CATEGORY_COLOR_PALETTE,
  FALLBACK_CATEGORY_COLOR,
  getCategoryColor,
  getPaletteColorValues,
} from '../../src/utils/categoryColors';

describe('CATEGORY_COLORS', () => {
  it('keeps existing seed entries for backward compatibility', () => {
    expect(CATEGORY_COLORS.Yoga).toBeTruthy();
    expect(CATEGORY_COLORS.Meditation).toBeTruthy();
    expect(CATEGORY_COLORS.Sonstiges).toBeTruthy();
  });

  it('uses hex color values so the picker can compare colors directly', () => {
    for (const value of Object.values(CATEGORY_COLORS)) {
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('CATEGORY_COLOR_PALETTE', () => {
  it('exposes exactly 8 distinct swatches', () => {
    expect(CATEGORY_COLOR_PALETTE).toHaveLength(8);
    const values = CATEGORY_COLOR_PALETTE.map((entry) => entry.value);
    expect(new Set(values).size).toBe(8);
  });

  it('every swatch has a hex value and a label', () => {
    for (const entry of CATEGORY_COLOR_PALETTE) {
      expect(entry.value).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(entry.label).toBeTruthy();
    }
  });
});

describe('getPaletteColorValues', () => {
  it('returns the hex strings in palette order', () => {
    expect(getPaletteColorValues()).toEqual(CATEGORY_COLOR_PALETTE.map((entry) => entry.value));
  });
});

describe('getCategoryColor', () => {
  it('returns the mapped color for a known category', () => {
    expect(getCategoryColor('Yoga')).toBe(CATEGORY_COLORS.Yoga);
    expect(getCategoryColor('Meditation')).toBe(CATEGORY_COLORS.Meditation);
  });

  it("prefers an event's own categoryColor over the static mapping", () => {
    expect(getCategoryColor('Yoga', '#4a7572')).toBe('#4a7572');
    expect(getCategoryColor('Pilates', '#4a7572')).toBe('#4a7572');
  });

  it("returns the event's own categoryColor even when the static map has no entry", () => {
    expect(getCategoryColor('BrandNew', '#bf5b4e')).toBe('#bf5b4e');
  });

  it('returns the fallback for unknown categories without an event color', () => {
    expect(getCategoryColor('Pilates')).toBe(FALLBACK_CATEGORY_COLOR);
    expect(getCategoryColor('Qi Gong')).toBe(FALLBACK_CATEGORY_COLOR);
  });

  it('returns the fallback for null/undefined/empty input', () => {
    expect(getCategoryColor(null)).toBe(FALLBACK_CATEGORY_COLOR);
    expect(getCategoryColor(undefined)).toBe(FALLBACK_CATEGORY_COLOR);
    expect(getCategoryColor('')).toBe(FALLBACK_CATEGORY_COLOR);
  });

  it('returns the fallback when categoryColor is an empty string', () => {
    expect(getCategoryColor('Yoga', '')).toBe(CATEGORY_COLORS.Yoga);
  });
});
