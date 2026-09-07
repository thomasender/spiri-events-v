import { describe, it, expect } from 'vitest';
import {
  CATEGORY_COLORS,
  SEED_CATEGORIES,
  FALLBACK_CATEGORY_COLOR,
  getCategoryColor,
  resolveEventColor,
} from '../../src/utils/categoryColors';

describe('CATEGORY_COLORS', () => {
  it('keeps existing seed entries for backward compatibility', () => {
    expect(CATEGORY_COLORS.Yoga).toBeTruthy();
    expect(CATEGORY_COLORS.Meditation).toBeTruthy();
    expect(CATEGORY_COLORS.Sonstiges).toBeTruthy();
  });

  it('uses hex color values so the picker logic can compare colors directly', () => {
    for (const value of Object.values(CATEGORY_COLORS)) {
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('SEED_CATEGORIES', () => {
  it('exposes one entry per seed category with matching color', () => {
    expect(SEED_CATEGORIES).toHaveLength(Object.keys(CATEGORY_COLORS).length);
    for (const entry of SEED_CATEGORIES) {
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(CATEGORY_COLORS[entry.name]).toBe(entry.color);
    }
  });

  it('uses a lowercase slug for the id so admins and the seed write to the same doc', () => {
    for (const entry of SEED_CATEGORIES) {
      expect(entry.id).toBe(entry.name.toLowerCase());
    }
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

describe('resolveEventColor', () => {
  const registry = new Map([
    ['Pilates', '#4a7572'],
    ['Yoga', '#c48e6a'],
  ]);

  it('returns the event-level categoryColor override first', () => {
    expect(resolveEventColor({ category: 'Yoga', categoryColor: '#ffffff' }, registry)).toBe(
      '#ffffff'
    );
  });

  it('falls back to the registry color for the category name', () => {
    expect(resolveEventColor({ category: 'Pilates' }, registry)).toBe('#4a7572');
  });

  it('falls back to the synchronous seed map when the registry is empty', () => {
    expect(resolveEventColor({ category: 'Yoga' }, new Map())).toBe(CATEGORY_COLORS.Yoga);
  });

  it('returns the neutral fallback for unknown categories', () => {
    expect(resolveEventColor({ category: 'BrandNew' }, registry)).toBe(FALLBACK_CATEGORY_COLOR);
    expect(resolveEventColor(null, registry)).toBe(FALLBACK_CATEGORY_COLOR);
  });
});
