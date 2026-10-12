import { describe, it, expect } from 'vitest';
import { getEventLastDate, getEventPurgeDate, getExpiryHint } from '../../src/utils/eventExpiry';
import { isEventExpired } from '../../functions/src/eventExpiry';

describe('eventExpiry', () => {
  it('single event: purge 30 days after its date, multi-day after its end', () => {
    expect(getEventPurgeDate({ date: '2026-01-01' })).toBe('2026-01-31');
    expect(getEventPurgeDate({ date: '2026-01-01', endDate: '2026-01-03' })).toBe('2026-02-02');
  });

  it('series: purge 30 days after the last occurrence', () => {
    expect(
      getEventLastDate({
        date: '2026-01-01',
        recurrence: 'weekly',
        recurrenceEndDate: '2026-03-01',
      })
    ).toBe('2026-03-01');
    expect(
      getEventLastDate({
        date: '2026-01-01',
        recurrence: 'custom',
        customDates: ['2026-02-10', '2026-02-20'],
        exceptionDates: ['2026-02-20'],
      })
    ).toBe('2026-02-10');
    expect(getEventLastDate({ date: '2026-01-31', recurrence: 'weekly' })).toBe('2026-05-01');
  });

  it('expired only after the purge date has passed', () => {
    const ev = { date: '2026-01-01' };
    expect(isEventExpired(ev, '2026-01-31')).toBe(false);
    expect(isEventExpired(ev, '2026-02-01')).toBe(true);
    expect(isEventExpired({}, '2030-01-01')).toBe(false);
  });

  it('hint only for events that are over', () => {
    expect(getExpiryHint({ date: '2026-01-01' }, '2026-01-01')).toBeNull();
    expect(getExpiryHint({ date: '2026-01-01' }, '2026-01-02')).toContain('automatisch gelöscht');
  });
});
