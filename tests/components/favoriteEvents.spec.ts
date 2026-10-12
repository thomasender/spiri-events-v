import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildFavoriteEvents } from '../../src/utils/favoriteEvents';

afterEach(() => vi.useRealTimers());

const ev = (id: string, date: string, extra = {}) => ({ id, title: id, date, ...extra });

describe('buildFavoriteEvents', () => {
  it('keeps only favorited events, soonest first', () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00'), toFake: ['Date'] });
    const events = [ev('b', '2026-11-20'), ev('a', '2026-10-30'), ev('c', '2026-10-15')];
    const result = buildFavoriteEvents(events, new Set(['a', 'b']));
    expect(result.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('skips favorites without a matching or upcoming event', () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00'), toFake: ['Date'] });
    const events = [ev('past', '2026-09-01')];
    const result = buildFavoriteEvents(events, new Set(['past', 'deleted-id']));
    expect(result).toEqual([]);
  });

  it('shows a recurring series at its next upcoming date', () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00'), toFake: ['Date'] });
    const series = ev('s', '2026-09-01', { recurrence: 'weekly', recurrenceEndDate: '2026-12-31' });
    const [result] = buildFavoriteEvents([series], new Set(['s']));
    expect(result.id).toBe('s');
    expect(result.date >= '2026-10-12').toBe(true);
  });
});
