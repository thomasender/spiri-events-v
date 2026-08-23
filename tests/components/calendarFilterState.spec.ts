import { describe, it, expect } from 'vitest';
import { monthKeyToDate, dateToMonthKey } from '../../src/utils/calendarFilterState';

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
