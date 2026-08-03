import { describe, it, expect } from 'vitest';
import { getEventOccurrences } from '../../src/utils/eventOccurrences';

const dateStr = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

describe('getEventOccurrences', () => {
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

  it('returns one occurrence per day for multi-day non-recurring events', () => {
    const event = { id: '1', date: dateStr(10), endDate: dateStr(12), recurrence: 'none' };
    const result = getEventOccurrences(event);
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.date)).toEqual([dateStr(10), dateStr(11), dateStr(12)]);
    expect(result[0].isMultiDayStart).toBe(true);
    expect(result[2].isMultiDayEnd).toBe(true);
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
});
