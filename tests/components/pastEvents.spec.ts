import { describe, it, expect } from 'vitest';
import { isOccurrencePast } from '../../src/utils/pastEvents';

const now = new Date(2026, 9, 19, 14, 30);

describe('isOccurrencePast', () => {
  it('hides earlier days', () => {
    expect(isOccurrencePast({ date: '2026-10-18', time: '20:00' }, now)).toBe(true);
  });
  it('hides today once the start time has passed, to the minute', () => {
    expect(isOccurrencePast({ date: '2026-10-19', time: '14:29' }, now)).toBe(true);
    expect(isOccurrencePast({ date: '2026-10-19', time: '14:30' }, now)).toBe(false);
    expect(isOccurrencePast({ date: '2026-10-19', time: '18:00' }, now)).toBe(false);
  });
  it('keeps future days, untimed events today and running multi-day events', () => {
    expect(isOccurrencePast({ date: '2026-10-20', time: '08:00' }, now)).toBe(false);
    expect(isOccurrencePast({ date: '2026-10-19' }, now)).toBe(false);
    expect(
      isOccurrencePast({ date: '2026-10-18', endDate: '2026-10-20', time: '08:00' }, now)
    ).toBe(false);
  });
});
