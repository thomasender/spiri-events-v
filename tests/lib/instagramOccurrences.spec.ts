import { describe, it, expect } from 'vitest';
import { expandOccurrencesInWindow } from '../../functions/src/instagram/instagramOccurrences';

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
