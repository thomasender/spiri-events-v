import { describe, it, expect } from 'vitest';
import {
  parseEventDate,
  formatWeekdayShort,
  formatDayNumber,
  formatMonthShort,
  formatEventDateLabel,
  formatEventDateShort,
  formatEventDateRangeLabel,
  isMultiDayEvent,
  getOrganizerName,
  getPrimaryCategory,
  getEventLocationLabel,
} from '../../src/utils/eventFormat';

describe('formatEventDateShort', () => {
  it('formats ISO date string as DD.MM.YYYY', () => {
    expect(formatEventDateShort('2026-01-15')).toBe('15.01.2026');
  });

  it('zero-pads single-digit days and months', () => {
    expect(formatEventDateShort('2026-03-05')).toBe('05.03.2026');
  });

  it('handles end-of-year dates', () => {
    expect(formatEventDateShort('2026-12-31')).toBe('31.12.2026');
  });

  it('returns empty string for empty input', () => {
    expect(formatEventDateShort('')).toBe('');
  });

  it('returns empty string for null/undefined input', () => {
    expect(formatEventDateShort(null)).toBe('');
    expect(formatEventDateShort(undefined)).toBe('');
  });

  it('does not apply any locale-specific reordering', () => {
    const formatted = formatEventDateShort('2026-07-09');
    expect(formatted.startsWith('09')).toBe(true);
    expect(formatted.includes('.07.')).toBe(true);
    expect(formatted.endsWith('2026')).toBe(true);
  });
});

describe('parseEventDate', () => {
  it('parses ISO date string into a local Date', () => {
    const date = parseEventDate('2026-01-15');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(15);
  });
});

describe('formatEventDateLabel', () => {
  it('formats ISO date as German weekday + day + month', () => {
    const result = formatEventDateLabel('2026-01-15');
    expect(result).toMatch(/15/);
    expect(result).toMatch(/Jan/);
  });
});

describe('formatWeekdayShort', () => {
  it('returns short German weekday without trailing dot', () => {
    const weekday = formatWeekdayShort('2026-01-15');
    expect(weekday).not.toMatch(/\.$/);
    expect(weekday.length).toBeGreaterThan(0);
  });
});

describe('formatDayNumber', () => {
  it('returns the day of month as number', () => {
    expect(formatDayNumber('2026-01-15')).toBe(15);
    expect(formatDayNumber('2026-12-31')).toBe(31);
  });
});

describe('formatMonthShort', () => {
  it('returns short German month without trailing dot', () => {
    const month = formatMonthShort('2026-01-15');
    expect(month).not.toMatch(/\.$/);
    expect(month.length).toBeGreaterThan(0);
  });
});

describe('getOrganizerName', () => {
  it('returns first + last name when both are set', () => {
    expect(getOrganizerName({ organizer: { firstName: 'Anna', lastName: 'Schmidt' } })).toBe(
      'Anna Schmidt'
    );
  });

  it('returns only the available name part', () => {
    expect(getOrganizerName({ organizer: { firstName: 'Anna' } })).toBe('Anna');
    expect(getOrganizerName({ organizer: { lastName: 'Schmidt' } })).toBe('Schmidt');
  });

  it('returns empty string when no organizer is set', () => {
    expect(getOrganizerName({})).toBe('');
  });
});

describe('getPrimaryCategory', () => {
  it('returns the event category when present', () => {
    expect(getPrimaryCategory({ category: 'Workshop' })).toBe('Workshop');
  });

  it('returns null when no category is set', () => {
    expect(getPrimaryCategory({})).toBeNull();
  });
});

describe('getEventLocationLabel', () => {
  it('returns "Online" for online events regardless of bezirk', () => {
    expect(getEventLocationLabel({ isOnline: true })).toBe('Online');
    expect(getEventLocationLabel({ isOnline: true, bezirk: 'Bregenz' })).toBe('Online');
  });

  it('returns the bezirk for in-person events', () => {
    expect(getEventLocationLabel({ bezirk: 'Dornbirn' })).toBe('Dornbirn');
  });

  it('returns the bezirk when isOnline is explicitly false', () => {
    expect(getEventLocationLabel({ isOnline: false, bezirk: 'Feldkirch' })).toBe('Feldkirch');
  });

  it('returns an empty string when no location info is set', () => {
    expect(getEventLocationLabel({})).toBe('');
  });

  it('returns an empty string for null/undefined events', () => {
    expect(getEventLocationLabel(null)).toBe('');
    expect(getEventLocationLabel(undefined)).toBe('');
  });
});

describe('formatEventDateRangeLabel', () => {
  it('returns null when endDate is missing', () => {
    expect(formatEventDateRangeLabel('2026-01-15', null)).toBeNull();
    expect(formatEventDateRangeLabel('2026-01-15', '')).toBeNull();
  });

  it('returns null when start and end date are the same', () => {
    expect(formatEventDateRangeLabel('2026-01-15', '2026-01-15')).toBeNull();
  });

  it('returns a range like "Di, 1. Sept - So, 6. Sept" for multi-day events', () => {
    const label = formatEventDateRangeLabel('2026-09-01', '2026-09-06');
    expect(label).not.toBeNull();
    expect(label).toMatch(/1/);
    expect(label).toMatch(/6/);
    expect(label).toMatch(/Sept/);
    expect(label).toContain(' - ');
  });

  it('formats across month boundaries with both months visible', () => {
    const label = formatEventDateRangeLabel('2026-08-30', '2026-09-05');
    expect(label).toMatch(/30/);
    expect(label).toMatch(/5/);
    expect(label).toMatch(/Aug/);
    expect(label).toMatch(/Sept/);
  });
});

describe('isMultiDayEvent', () => {
  it('returns false when no endDate is set', () => {
    expect(isMultiDayEvent({ date: '2026-01-15' })).toBe(false);
  });

  it('returns false when endDate equals date', () => {
    expect(isMultiDayEvent({ date: '2026-01-15', endDate: '2026-01-15' })).toBe(false);
  });

  it('returns false when endDate is before date', () => {
    expect(isMultiDayEvent({ date: '2026-01-15', endDate: '2026-01-14' })).toBe(false);
  });

  it('returns true when endDate is after date', () => {
    expect(isMultiDayEvent({ date: '2026-01-15', endDate: '2026-01-16' })).toBe(true);
    expect(isMultiDayEvent({ date: '2026-08-30', endDate: '2026-09-05' })).toBe(true);
  });

  it('returns false for null/undefined events', () => {
    expect(isMultiDayEvent(null)).toBe(false);
    expect(isMultiDayEvent(undefined)).toBe(false);
  });
});
