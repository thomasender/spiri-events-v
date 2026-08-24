import { describe, it, expect } from 'vitest';
import {
  parseEventDate,
  formatWeekdayShort,
  formatDayNumber,
  formatMonthShort,
  formatEventDateLabel,
  formatEventDateShort,
  getOrganizerName,
  getPrimaryCategory,
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
