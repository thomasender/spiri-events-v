import { describe, it, expect } from 'vitest';
import {
  monthKeyToDate,
  dateToMonthKey,
  getRollingRange,
  hasDistrictFilter,
  ortFilterLabel,
  countActiveFilters,
} from '../../src/utils/calendarFilterState';

describe('calendarFilterState helpers', () => {
  describe('dateToMonthKey', () => {
    it('formats a date in the local timezone as YYYY-MM', () => {
      const d = new Date(2026, 7, 1);
      expect(dateToMonthKey(d)).toBe('2026-08');
    });

    it('zero-pads single-digit months', () => {
      const d = new Date(2026, 0, 15);
      expect(dateToMonthKey(d)).toBe('2026-01');
    });

    it('handles December as 12 not 0', () => {
      const d = new Date(2026, 11, 31);
      expect(dateToMonthKey(d)).toBe('2026-12');
    });
  });

  describe('monthKeyToDate', () => {
    it('parses a valid YYYY-MM string to the first of the month in local time', () => {
      const d = monthKeyToDate('2026-08');
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(7);
      expect(d.getDate()).toBe(1);
    });

    it('returns null for invalid format', () => {
      expect(monthKeyToDate('2026-8')).toBeNull();
      expect(monthKeyToDate('2026/08')).toBeNull();
      expect(monthKeyToDate('2026-13')).toBeNull();
      expect(monthKeyToDate('2026-00')).toBeNull();
      expect(monthKeyToDate('foo')).toBeNull();
    });

    it('returns null for legacy ISO timestamp format (used to detect legacy state)', () => {
      expect(monthKeyToDate('2026-07-31T22:00:00.000Z')).toBeNull();
      expect(monthKeyToDate('2026-08-23T19:15:20.497Z')).toBeNull();
    });

    it('returns null for non-string input', () => {
      expect(monthKeyToDate(null)).toBeNull();
      expect(monthKeyToDate(undefined)).toBeNull();
      expect(monthKeyToDate(123)).toBeNull();
      expect(monthKeyToDate({})).toBeNull();
    });
  });

  describe('round-trip is timezone-independent', () => {
    it('preserves the year/month across save/load regardless of timezone', () => {
      const dates = [new Date(2026, 0, 15), new Date(2026, 6, 31), new Date(2026, 11, 1)];
      for (const original of dates) {
        const key = dateToMonthKey(original);
        const restored = monthKeyToDate(key);
        expect(restored.getFullYear()).toBe(original.getFullYear());
        expect(restored.getMonth()).toBe(original.getMonth());
      }
    });
  });
});

describe('getRollingRange (QRpwwNTI)', () => {
  it('spans today to today + 30 days, inclusive', () => {
    expect(getRollingRange(new Date(2099, 0, 20, 23, 30))).toEqual({
      from: '2099-01-20',
      to: '2099-02-19',
    });
  });

  it('crosses year boundaries', () => {
    expect(getRollingRange(new Date(2099, 11, 15))).toEqual({
      from: '2099-12-15',
      to: '2100-01-14',
    });
  });
});

describe('countActiveFilters', () => {
  const none = {
    selectedCategories: [] as string[],
    selectedOrte: [] as string[],
    dateFilter: null as string | null,
    favoritesFilterActive: false,
  };

  it('is 0 without any filter', () => {
    expect(countActiveFilters(none)).toBe(0);
  });

  it('counts every chosen category and Bezirk on its own', () => {
    expect(
      countActiveFilters({
        ...none,
        selectedCategories: ['Yoga', 'Tanz'],
        selectedOrte: ['Feldkirch'],
      })
    ).toBe(3);
  });

  it('counts Online like a Bezirk', () => {
    expect(countActiveFilters({ ...none, selectedOrte: ['Online', 'Bregenz'] })).toBe(2);
  });

  it('counts the date quick filter once', () => {
    expect(countActiveFilters({ ...none, dateFilter: 'weekend' })).toBe(1);
  });

  it('counts favourites only while the filter is active (signed in)', () => {
    expect(countActiveFilters({ ...none, favoritesFilterActive: true })).toBe(1);
    expect(countActiveFilters({ ...none, favoritesFilterActive: false })).toBe(0);
  });

  it('is above 0 exactly when hasActiveFilter would be true', () => {
    const cases = [
      none,
      { ...none, selectedCategories: ['Yoga'] },
      { ...none, selectedOrte: ['Online'] },
      { ...none, dateFilter: 'today' },
      { ...none, favoritesFilterActive: true },
    ];
    for (const c of cases) {
      const hasActiveFilter =
        c.selectedCategories.length > 0 ||
        c.selectedOrte.length > 0 ||
        !!c.dateFilter ||
        c.favoritesFilterActive;
      expect(countActiveFilters(c) > 0).toBe(hasActiveFilter);
    }
  });
});

describe('hasDistrictFilter', () => {
  it('is true once a Bezirk / Landkreis is picked, not for "Online" alone', () => {
    expect(hasDistrictFilter([], 'Online')).toBe(false);
    expect(hasDistrictFilter(['Online'], 'Online')).toBe(false);
    expect(hasDistrictFilter(['Online', 'Dornbirn'], 'Online')).toBe(true);
  });
});

describe('ortFilterLabel', () => {
  it('uses the region wording and mixes only when regions disagree', () => {
    expect(ortFilterLabel([])).toBe('Bezirk');
    expect(ortFilterLabel(['Bezirk'])).toBe('Bezirk');
    expect(ortFilterLabel(['Landkreis', 'Landkreis'])).toBe('Landkreis');
    expect(ortFilterLabel(['Bezirk', 'Landkreis'])).toBe('Bezirk / Landkreis');
  });
});
