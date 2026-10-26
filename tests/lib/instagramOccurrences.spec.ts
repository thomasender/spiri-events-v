import { describe, it, expect } from 'vitest';
import {
  expandOccurrencesInWindow,
  getNthWeekdayOrdinal,
  nthWeekdayOfMonth,
} from '../../functions/src/instagram/instagramOccurrences';

const WINDOW = { start: '2026-10-12', end: '2026-10-18' };
const dates = (event: Record<string, unknown>) =>
  expandOccurrencesInWindow(event, WINDOW).map((e) => e.date);

describe('expandOccurrencesInWindow', () => {
  it('keeps a single event that starts inside the window and drops others', () => {
    expect(dates({ date: '2026-10-14' })).toEqual(['2026-10-14']);
    expect(dates({ date: '2026-10-11' })).toEqual([]);
    expect(dates({ date: '2026-10-19' })).toEqual([]);
    expect(dates({ date: 'kaputt' })).toEqual([]);
  });

  it('finds a weekly series that started weeks ago', () => {
    expect(dates({ date: '2026-09-02', recurrence: 'weekly' })).toEqual(['2026-10-14']);
  });

  it('finds the right biweekly week', () => {
    expect(dates({ date: '2026-09-30', recurrence: 'biweekly' })).toEqual(['2026-10-14']);
    expect(dates({ date: '2026-10-07', recurrence: 'biweekly' })).toEqual([]);
  });

  it('finds a monthly series', () => {
    expect(dates({ date: '2026-08-15', recurrence: 'monthly' })).toEqual(['2026-10-15']);
  });

  it('stops a series at its end date', () => {
    expect(
      dates({ date: '2026-09-02', recurrence: 'weekly', recurrenceEndDate: '2026-10-07' })
    ).toEqual([]);
  });

  it('applies the default horizon of three months for weekly series', () => {
    expect(dates({ date: '2026-06-03', recurrence: 'weekly' })).toEqual([]);
    expect(dates({ date: '2026-07-15', recurrence: 'weekly' })).toEqual(['2026-10-14']);
  });

  it('removes exception dates', () => {
    expect(
      dates({ date: '2026-09-02', recurrence: 'weekly', exceptionDates: ['2026-10-14'] })
    ).toEqual([]);
  });

  it('expands custom dates, including the base date', () => {
    expect(
      dates({ date: '2026-09-01', recurrence: 'custom', customDates: ['2026-10-13', '2026-10-17'] })
    ).toEqual(['2026-10-13', '2026-10-17']);
    expect(dates({ date: '2026-10-15', recurrence: 'custom', customDates: [] })).toEqual([
      '2026-10-15',
    ]);
  });

  it('moves endDate along for multi-day occurrences and keeps the original untouched', () => {
    const [occurrence] = expandOccurrencesInWindow(
      { date: '2026-09-04', endDate: '2026-09-06', recurrence: 'weekly', id: 'x' },
      WINDOW
    );
    expect(occurrence).toMatchObject({ id: 'x', date: '2026-10-16', endDate: '2026-10-18' });
  });
});

describe('monthlyWeekday and month-end clamping (6adca49e)', () => {
  const range = (event: Record<string, unknown>, start: string, end: string) =>
    expandOccurrencesInWindow(event, { start, end }).map((e) => e.date);

  it('nthWeekdayOfMonth / getNthWeekdayOrdinal mirror the frontend', () => {
    expect(nthWeekdayOfMonth(2026, 0, 4, 1)).toBe(1);
    expect(nthWeekdayOfMonth(2026, 0, 4, 5)).toBe(29);
    expect(nthWeekdayOfMonth(2026, 1, 4, 5)).toBeNull();
    expect(nthWeekdayOfMonth(2026, 1, 4, -1)).toBe(26);
    expect(nthWeekdayOfMonth(2028, 1, 2, -1)).toBe(29);
    expect(getNthWeekdayOrdinal('2026-01-07')).toBe(1);
    expect(getNthWeekdayOrdinal('2026-01-28')).toBe(4);
    expect(getNthWeekdayOrdinal('2026-01-29')).toBe(-1);
  });

  it('first, second and fourth weekday of the month', () => {
    expect(
      range({ date: '2026-01-05', recurrence: 'monthlyWeekday' }, '2026-01-01', '2026-06-30')
    ).toEqual(['2026-01-05', '2026-02-02', '2026-03-02', '2026-04-06', '2026-05-04', '2026-06-01']);
    expect(
      range({ date: '2026-01-14', recurrence: 'monthlyWeekday' }, '2026-02-01', '2026-04-30')
    ).toEqual(['2026-02-11', '2026-03-11', '2026-04-08']);
    expect(
      range({ date: '2026-01-22', recurrence: 'monthlyWeekday' }, '2026-03-01', '2026-04-30')
    ).toEqual(['2026-03-26', '2026-04-23']);
  });

  it('last weekday never skips months, across year and leap February', () => {
    expect(
      range({ date: '2026-01-29', recurrence: 'monthlyWeekday' }, '2026-02-01', '2026-05-31')
    ).toEqual(['2026-02-26', '2026-03-26', '2026-04-30', '2026-05-28']);
    expect(
      range({ date: '2026-10-30', recurrence: 'monthlyWeekday' }, '2026-12-01', '2027-02-28')
    ).toEqual(['2026-12-25', '2027-01-29', '2027-02-26']);
    expect(
      range({ date: '2028-01-29', recurrence: 'monthlyWeekday' }, '2028-02-01', '2028-03-31')
    ).toEqual(['2028-02-26', '2028-03-25']);
  });

  it('removes exception dates, stops at the end date and moves endDate along', () => {
    expect(
      range(
        {
          date: '2026-01-05',
          recurrence: 'monthlyWeekday',
          exceptionDates: ['2026-02-02'],
          recurrenceEndDate: '2026-03-02',
        },
        '2026-01-01',
        '2026-12-31'
      )
    ).toEqual(['2026-01-05', '2026-03-02']);
    const [, second] = expandOccurrencesInWindow(
      { date: '2026-01-05', endDate: '2026-01-07', recurrence: 'monthlyWeekday' },
      { start: '2026-01-01', end: '2026-02-28' }
    );
    expect(second).toMatchObject({ date: '2026-02-02', endDate: '2026-02-04' });
  });

  it('uses the one-year default horizon', () => {
    const dates = range(
      { date: '2026-01-05', recurrence: 'monthlyWeekday' },
      '2026-01-01',
      '2030-01-01'
    );
    expect(dates).toHaveLength(13);
    expect(dates[12]).toBe('2027-01-04');
  });

  it('monthly on the 31st clamps to the last day of shorter months', () => {
    expect(
      range(
        { date: '2026-01-31', recurrence: 'monthly', recurrenceEndDate: '2026-06-30' },
        '2026-01-01',
        '2026-12-31'
      )
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
    expect(
      range(
        { date: '2028-01-30', recurrence: 'monthly', recurrenceEndDate: '2028-03-31' },
        '2028-01-01',
        '2028-12-31'
      )
    ).toEqual(['2028-01-30', '2028-02-29', '2028-03-30']);
  });
});
