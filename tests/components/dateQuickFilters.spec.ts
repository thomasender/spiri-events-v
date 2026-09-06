import { describe, it, expect } from 'vitest';
import {
  DATE_FILTER_OPTIONS,
  isoDate,
  startOfDay,
  isWeekendIso,
  getWeekendRange,
  getCurrentWeekRange,
  monthKeyForReference,
  applyDateFilter,
  getDateFilterMonthKey,
  isValidDateFilterId,
  DATE_FILTER_IDS,
} from '../../src/utils/dateQuickFilters';

describe('dateQuickFilters', () => {
  describe('DATE_FILTER_OPTIONS', () => {
    it('exposes Heute, Wochenende and Aktuelle Woche in that order', () => {
      expect(DATE_FILTER_OPTIONS).toEqual([
        { id: 'heute', label: 'Heute' },
        { id: 'wochenende', label: 'Wochenende' },
        { id: 'aktuelleWoche', label: 'Aktuelle Woche' },
      ]);
    });
  });

  describe('isoDate', () => {
    it('formats a date in local time as YYYY-MM-DD', () => {
      expect(isoDate(new Date(2026, 8, 6))).toBe('2026-09-06');
    });

    it('zero-pads single-digit months and days', () => {
      expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    it('ignores the time portion of the source date', () => {
      const d = new Date(2026, 8, 6, 23, 59, 59);
      expect(isoDate(d)).toBe('2026-09-06');
    });
  });

  describe('startOfDay', () => {
    it('zeros out hours, minutes, seconds and milliseconds', () => {
      const d = startOfDay(new Date(2026, 8, 6, 15, 30, 45));
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
      expect(d.getMilliseconds()).toBe(0);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(8);
      expect(d.getDate()).toBe(6);
    });
  });

  describe('isWeekendIso', () => {
    it('returns true for Friday, Saturday and Sunday', () => {
      expect(isWeekendIso('2026-09-04')).toBe(true); // Friday
      expect(isWeekendIso('2026-09-05')).toBe(true); // Saturday
      expect(isWeekendIso('2026-09-06')).toBe(true); // Sunday
    });

    it('returns false for weekdays', () => {
      expect(isWeekendIso('2026-09-07')).toBe(false); // Monday
      expect(isWeekendIso('2026-09-08')).toBe(false); // Tuesday
      expect(isWeekendIso('2026-09-09')).toBe(false); // Wednesday
      expect(isWeekendIso('2026-09-10')).toBe(false); // Thursday
    });
  });

  describe('getWeekendRange', () => {
    it('returns the upcoming Fri-Sun when today is Monday', () => {
      const range = getWeekendRange(new Date(2026, 8, 7)); // Mon Sep 7
      expect(isoDate(range.start)).toBe('2026-09-11'); // Friday
      expect(isoDate(range.end)).toBe('2026-09-13'); // Sunday
    });

    it('returns the upcoming Fri-Sun when today is Thursday', () => {
      const range = getWeekendRange(new Date(2026, 8, 10)); // Thu Sep 10
      expect(isoDate(range.start)).toBe('2026-09-11'); // Friday
      expect(isoDate(range.end)).toBe('2026-09-13'); // Sunday
    });

    it('starts on Friday when today is Friday', () => {
      const range = getWeekendRange(new Date(2026, 8, 11)); // Fri Sep 11
      expect(isoDate(range.start)).toBe('2026-09-11');
      expect(isoDate(range.end)).toBe('2026-09-13');
    });

    it('starts on the previous Friday when today is Saturday', () => {
      const range = getWeekendRange(new Date(2026, 8, 12)); // Sat Sep 12
      expect(isoDate(range.start)).toBe('2026-09-11'); // previous Friday
      expect(isoDate(range.end)).toBe('2026-09-13'); // Sunday
    });

    it('starts on the previous Friday when today is Sunday', () => {
      const range = getWeekendRange(new Date(2026, 8, 13)); // Sun Sep 13
      expect(isoDate(range.start)).toBe('2026-09-11'); // Friday of this weekend
      expect(isoDate(range.end)).toBe('2026-09-13'); // today
    });
  });

  describe('getCurrentWeekRange', () => {
    it('returns Mon-Sun for the current calendar week', () => {
      // Sep 9, 2026 is Wednesday → Mon Sep 7, Sun Sep 13
      const range = getCurrentWeekRange(new Date(2026, 8, 9));
      expect(isoDate(range.start)).toBe('2026-09-07');
      expect(isoDate(range.end)).toBe('2026-09-13');
    });

    it('treats Sunday as the last day of the week, not Monday', () => {
      // Sep 13, 2026 is Sunday → Mon Sep 7, Sun Sep 13
      const range = getCurrentWeekRange(new Date(2026, 8, 13));
      expect(isoDate(range.start)).toBe('2026-09-07');
      expect(isoDate(range.end)).toBe('2026-09-13');
    });

    it('returns the previous Monday when today is Monday', () => {
      const range = getCurrentWeekRange(new Date(2026, 8, 14)); // Mon Sep 14
      expect(isoDate(range.start)).toBe('2026-09-14');
      expect(isoDate(range.end)).toBe('2026-09-20');
    });
  });

  describe('monthKeyForReference', () => {
    it('returns the YYYY-MM key for a date', () => {
      expect(monthKeyForReference(new Date(2026, 8, 6))).toBe('2026-09');
    });
  });

  describe('applyDateFilter', () => {
    const sampleOccurrences = [
      { id: '1', date: '2026-09-04' }, // Friday
      { id: '2', date: '2026-09-05' }, // Saturday
      { id: '3', date: '2026-09-06' }, // Sunday
      { id: '4', date: '2026-09-07' }, // Monday
      { id: '5', date: '2026-09-08' }, // Tuesday
      { id: '6', date: '2026-09-12' }, // Saturday (next weekend)
    ];
    const today = new Date(2026, 8, 7); // Monday Sep 7

    it('returns the input untouched when no filter is active', () => {
      expect(applyDateFilter(sampleOccurrences, null, today)).toBe(sampleOccurrences);
    });

    it('keeps only occurrences matching today when filter is "heute"', () => {
      const today2 = new Date(2026, 8, 6); // Sunday Sep 6
      const result = applyDateFilter(sampleOccurrences, DATE_FILTER_IDS.HEUTE, today2);
      expect(result.map((o) => o.id)).toEqual(['3']);
    });

    it('keeps only weekend occurrences within the upcoming Fri-Sun when filter is "wochenende"', () => {
      const result = applyDateFilter(sampleOccurrences, DATE_FILTER_IDS.WOCHENENDE, today);
      // Upcoming weekend from Mon Sep 7 is Fri Sep 11 - Sun Sep 13.
      // The only sample date inside that window is Sat Sep 12 (id 6).
      expect(result.map((o) => o.id)).toEqual(['6']);

      const friday = new Date(2026, 8, 11);
      const fridayResult = applyDateFilter(sampleOccurrences, DATE_FILTER_IDS.WOCHENENDE, friday);
      // From Fri Sep 11 the weekend window is Fri Sep 11 - Sun Sep 13;
      // only Sat Sep 12 (id 6) is in the sample data.
      expect(fridayResult.map((o) => o.id)).toEqual(['6']);
    });

    it('keeps only occurrences within the current Mon-Sun when filter is "aktuelleWoche"', () => {
      const result = applyDateFilter(sampleOccurrences, DATE_FILTER_IDS.AKTUELLE_WOCHE, today);
      // Week of Mon Sep 7 - Sun Sep 13 → ids 4,5,6 (Sep 7, Sep 8, Sep 12).
      expect(result.map((o) => o.id)).toEqual(['4', '5', '6']);
    });

    it('returns the input untouched for an unknown filter id', () => {
      expect(applyDateFilter(sampleOccurrences, 'invalid', today)).toBe(sampleOccurrences);
    });
  });

  describe('getDateFilterMonthKey', () => {
    it('returns today\'s month key for "heute"', () => {
      expect(getDateFilterMonthKey(DATE_FILTER_IDS.HEUTE, new Date(2026, 8, 6))).toBe('2026-09');
    });

    it('returns the month of the upcoming Friday for "wochenende"', () => {
      // From Mon Sep 7 the weekend is Sep 11-13 → month stays September
      expect(getDateFilterMonthKey(DATE_FILTER_IDS.WOCHENENDE, new Date(2026, 8, 7))).toBe(
        '2026-09'
      );
      // From Thu Sep 24 the next Friday is Sep 25 (still Sep)
      expect(getDateFilterMonthKey(DATE_FILTER_IDS.WOCHENENDE, new Date(2026, 8, 24))).toBe(
        '2026-09'
      );
      // From Fri Sep 25 the next Friday is Sep 25 (still Sep)
      expect(getDateFilterMonthKey(DATE_FILTER_IDS.WOCHENENDE, new Date(2026, 8, 25))).toBe(
        '2026-09'
      );
    });

    it('returns today\'s month key for "aktuelleWoche"', () => {
      expect(getDateFilterMonthKey(DATE_FILTER_IDS.AKTUELLE_WOCHE, new Date(2026, 8, 6))).toBe(
        '2026-09'
      );
    });

    it('returns null when no filter is active', () => {
      expect(getDateFilterMonthKey(null, new Date(2026, 8, 6))).toBeNull();
    });
  });

  describe('isValidDateFilterId', () => {
    it('accepts the three known ids', () => {
      expect(isValidDateFilterId('heute')).toBe(true);
      expect(isValidDateFilterId('wochenende')).toBe(true);
      expect(isValidDateFilterId('aktuelleWoche')).toBe(true);
    });

    it('rejects everything else', () => {
      expect(isValidDateFilterId(null)).toBe(false);
      expect(isValidDateFilterId(undefined)).toBe(false);
      expect(isValidDateFilterId('')).toBe(false);
      expect(isValidDateFilterId('next-week')).toBe(false);
      expect(isValidDateFilterId(123)).toBe(false);
    });
  });
});
