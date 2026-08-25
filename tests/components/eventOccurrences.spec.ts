import { describe, it, expect } from 'vitest';
import { getEventOccurrences } from '../../src/utils/eventOccurrences';

const dateStr = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

describe('getEventOccurrences (list mode)', () => {
  it('returns a single occurrence for non-recurring events', () => {
    const event = { id: '1', date: dateStr(5), recurrence: 'none' };
    const result = getEventOccurrences(event);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe(dateStr(5));
  });

  it('treats missing recurrence field as non-recurring', () => {
    const event = { id: '1', date: dateStr(5) };
    const result = getEventOccurrences(event);
    expect(result).toHaveLength(1);
  });

  it('returns a single occurrence for multi-day events that fit in one month', () => {
    const event = { id: '1', date: dateStr(10), endDate: dateStr(12), recurrence: 'none' };
    const result = getEventOccurrences(event);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe(dateStr(10));
    expect(result[0].isMultiDayStart).toBe(true);
    expect(result[0].isMultiDayEnd).toBe(true);
  });

  it('returns one entry per month for multi-month multi-day events', () => {
    // Pick a span that crosses a month boundary. dateStr() uses Date.now() so
    // we need to construct dates relative to the next month boundary.
    const start = new Date();
    start.setDate(28);
    start.setMonth(start.getMonth() + 1, 1); // first of next month
    start.setDate(start.getDate() - 3); // 3 days before, so within previous month
    const end = new Date(start);
    end.setDate(end.getDate() + 8); // crosses into next next month
    const fmt = (d) => d.toISOString().split('T')[0];
    const event = {
      id: '1',
      date: fmt(start),
      endDate: fmt(end),
      recurrence: 'none',
    };
    const result = getEventOccurrences(event);
    expect(result.length).toBeGreaterThanOrEqual(2);
    // first entry should be the event's start date
    expect(result[0].date).toBe(fmt(start));
    expect(result[0].isMultiDayStart).toBe(true);
    // last entry should be in the last month
    const lastEntry = result[result.length - 1];
    expect(lastEntry.date.startsWith(fmt(end).slice(0, 7))).toBe(true);
    expect(lastEntry.isMultiDayEnd).toBe(true);
  });

  it('returns one entry per month when the event spans exactly two months', () => {
    // Build a span that crosses exactly one month boundary (e.g. Aug 30 - Sept 5).
    const base = new Date();
    base.setMonth(base.getMonth() + 1, 1); // first of next month
    base.setDate(base.getDate() - 1); // last day of current month
    const start = new Date(base);
    start.setDate(start.getDate() - 1); // one day earlier, same month
    const end = new Date(base);
    end.setDate(end.getDate() + 5); // 5 days into next month
    const fmt = (d) => d.toISOString().split('T')[0];
    const event = { id: '1', date: fmt(start), endDate: fmt(end), recurrence: 'none' };
    const result = getEventOccurrences(event);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe(fmt(start));
    expect(result[0].isMultiDayStart).toBe(true);
    expect(result[1].date.startsWith(fmt(end).slice(0, 7))).toBe(true);
    expect(result[1].isMultiDayEnd).toBe(true);
  });

  it('expands weekly recurring events across multiple weeks', () => {
    const event = {
      id: '1',
      date: dateStr(7),
      recurrence: 'weekly',
      recurrenceEndDate: dateStr(35),
    };
    const result = getEventOccurrences(event);
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result[0].date).toBe(dateStr(7));
    expect(result[1].date).toBe(dateStr(14));
  });

  it('collapses recurring multi-day occurrences to one entry per month per occurrence', () => {
    // Build a multi-day weekly event that crosses a month boundary.
    const start = new Date();
    start.setMonth(start.getMonth() + 1, 1);
    start.setDate(start.getDate() - 3);
    const recurrenceEnd = new Date(start);
    recurrenceEnd.setDate(recurrenceEnd.getDate() + 21);
    const fmt = (d) => d.toISOString().split('T')[0];
    const event = {
      id: '1',
      date: fmt(start),
      endDate: fmt(new Date(start.getTime() + 6 * 86400000)),
      recurrence: 'weekly',
      recurrenceEndDate: fmt(recurrenceEnd),
    };
    const result = getEventOccurrences(event);
    // Each occurrence should collapse to a small number of month entries, not
    // one entry per day of the multi-day span.
    result.forEach((occ) => {
      expect(typeof occ.date).toBe('string');
    });
    // Sanity check: total entries is less than days*weeks
    expect(result.length).toBeLessThan(7 * 4);
  });

  it('only returns future occurrences for recurring events', () => {
    const event = {
      id: '1',
      date: dateStr(-30),
      recurrence: 'weekly',
      recurrenceEndDate: dateStr(60),
    };
    const result = getEventOccurrences(event);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString().split('T')[0];
    result.forEach((occ) => {
      expect(occ.date >= todayIso).toBe(true);
    });
  });

  it('produces occurrences across different months for a weekly event', () => {
    const event = {
      id: '1',
      date: dateStr(7),
      recurrence: 'weekly',
      recurrenceEndDate: dateStr(60),
    };
    const result = getEventOccurrences(event);
    const months = new Set(result.map((occ) => occ.date.slice(0, 7)));
    expect(months.size).toBeGreaterThan(1);
  });

  it('expands monthly recurring events', () => {
    const event = {
      id: '1',
      date: dateStr(5),
      recurrence: 'monthly',
      recurrenceEndDate: dateStr(120),
    };
    const result = getEventOccurrences(event);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('defaults end date for recurring events without recurrenceEndDate', () => {
    const event = {
      id: '1',
      date: dateStr(5),
      recurrence: 'weekly',
    };
    const result = getEventOccurrences(event);
    expect(result.length).toBeGreaterThan(0);
    const lastOccurrence = result[result.length - 1];
    const lastDate = new Date(lastOccurrence.date + 'T12:00:00');
    const startDate = new Date(dateStr(5) + 'T12:00:00');
    const monthsDiff =
      (lastDate.getFullYear() - startDate.getFullYear()) * 12 +
      (lastDate.getMonth() - startDate.getMonth());
    expect(monthsDiff).toBeGreaterThanOrEqual(1);
    expect(monthsDiff).toBeLessThanOrEqual(3);
  });

  it('returns empty array for null events', () => {
    expect(getEventOccurrences(null)).toEqual([]);
  });

  it('filters out exception dates from recurring events', () => {
    const event = {
      id: '1',
      date: dateStr(7),
      recurrence: 'weekly',
      recurrenceEndDate: dateStr(35),
      exceptionDates: [dateStr(14), dateStr(28)],
    };
    const result = getEventOccurrences(event);
    const dates = result.map((e) => e.date);
    expect(dates).not.toContain(dateStr(14));
    expect(dates).not.toContain(dateStr(28));
    expect(dates).toContain(dateStr(7));
    expect(dates).toContain(dateStr(21));
    expect(dates).toContain(dateStr(35));
  });
});

describe('getEventOccurrences (calendar mode)', () => {
  it('returns one occurrence per day for multi-day non-recurring events', () => {
    const event = { id: '1', date: dateStr(10), endDate: dateStr(12), recurrence: 'none' };
    const result = getEventOccurrences(event, { mode: 'calendar' });
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.date)).toEqual([dateStr(10), dateStr(11), dateStr(12)]);
    expect(result[0].isMultiDayStart).toBe(true);
    expect(result[2].isMultiDayEnd).toBe(true);
  });

  it('returns one occurrence per day for single-day events', () => {
    const event = { id: '1', date: dateStr(5), recurrence: 'none' };
    const result = getEventOccurrences(event, { mode: 'calendar' });
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe(dateStr(5));
  });

  it('returns one entry per day for recurring multi-day events', () => {
    const event = {
      id: '1',
      date: dateStr(7),
      endDate: dateStr(9),
      recurrence: 'weekly',
      recurrenceEndDate: dateStr(28),
    };
    const result = getEventOccurrences(event, { mode: 'calendar' });
    // Each of ~4 weekly occurrences × 3 days = ~12 day entries
    expect(result.length).toBeGreaterThanOrEqual(8);
    result.forEach((occ) => {
      expect(typeof occ.date).toBe('string');
    });
  });
});
