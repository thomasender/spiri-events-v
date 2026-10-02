import { describe, it, expect } from 'vitest';
import { compareEventsByDateTime } from '../../src/utils/eventSort';

describe('compareEventsByDateTime', () => {
  it('orders events by ISO date ascending', () => {
    const events = [
      { id: 'b', date: '2026-10-15', time: '10:00' },
      { id: 'a', date: '2026-10-10', time: '18:00' },
      { id: 'c', date: '2026-10-20', time: '09:00' },
    ];
    const sorted = [...events].sort(compareEventsByDateTime).map((e) => e.id);
    expect(sorted).toEqual(['a', 'b', 'c']);
  });

  it('orders same-date events by time ascending (later time = further down)', () => {
    const events = [
      { id: 'late', date: '2026-10-15', time: '18:00' },
      { id: 'early', date: '2026-10-15', time: '08:00' },
      { id: 'mid', date: '2026-10-15', time: '12:30' },
    ];
    const sorted = [...events].sort(compareEventsByDateTime).map((e) => e.id);
    expect(sorted).toEqual(['early', 'mid', 'late']);
  });

  it('handles HH:MM string comparison correctly (lexicographic = chronological for ISO HH:MM)', () => {
    const events = [
      { id: '09', date: '2026-10-15', time: '09:00' },
      { id: '08', date: '2026-10-15', time: '08:00' },
      { id: '19', date: '2026-10-15', time: '19:00' },
      { id: '10', date: '2026-10-15', time: '10:00' },
    ];
    const sorted = [...events].sort(compareEventsByDateTime).map((e) => e.id);
    expect(sorted).toEqual(['08', '09', '10', '19']);
  });

  it('places events without a time after timed events on the same day', () => {
    const events = [
      { id: 'no-time', date: '2026-10-15', time: '' },
      { id: 'morning', date: '2026-10-15', time: '08:00' },
      { id: 'evening', date: '2026-10-15', time: '19:00' },
    ];
    const sorted = [...events].sort(compareEventsByDateTime).map((e) => e.id);
    expect(sorted).toEqual(['morning', 'evening', 'no-time']);
  });

  it('places events with null or undefined time after timed events on the same day', () => {
    const events = [
      { id: 'no-time-undef', date: '2026-10-15' },
      { id: 'no-time-null', date: '2026-10-15', time: null },
      { id: 'morning', date: '2026-10-15', time: '08:00' },
    ];
    const sorted = [...events].sort(compareEventsByDateTime).map((e) => e.id);
    expect(sorted[0]).toBe('morning');
    expect(new Set(sorted.slice(1))).toEqual(new Set(['no-time-undef', 'no-time-null']));
  });

  it('does not throw when given null or undefined entries', () => {
    expect(() => compareEventsByDateTime(null, null)).not.toThrow();
    expect(() => compareEventsByDateTime(undefined, { date: '2026-10-15', time: '08:00' })).not.toThrow();
    expect(compareEventsByDateTime(null, { date: '2026-10-15', time: '08:00' })).toBeGreaterThan(0);
    expect(compareEventsByDateTime({ date: '2026-10-15', time: '08:00' }, null)).toBeLessThan(0);
  });

  it('returns 0 when both events are identical', () => {
    const a = { id: 'a', date: '2026-10-15', time: '08:00' };
    const b = { id: 'b', date: '2026-10-15', time: '08:00' };
    expect(compareEventsByDateTime(a, b)).toBe(0);
  });
});