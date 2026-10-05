import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getCalendarCategories,
  getCategoriesWithUpcomingEvents,
} from '../../src/utils/calendarCategories';

const REGISTRY = ['Yoga', 'Coaching', 'Therapie', 'Sonstiges'];

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const event = (category: string, date: string, extra = {}) => ({
  id: `${category}-${date}`,
  category,
  date,
  time: '18:00',
  ...extra,
});

afterEach(() => vi.useRealTimers());

describe('getCategoriesWithUpcomingEvents', () => {
  it('includes categories with a future event and ignores ones without events', () => {
    const names = getCategoriesWithUpcomingEvents([event('Yoga', iso(3))]);
    expect([...names]).toEqual(['Yoga']);
  });

  it('ignores categories whose only events are in the past', () => {
    expect(getCategoriesWithUpcomingEvents([event('Coaching', iso(-5))]).size).toBe(0);
  });

  it('keeps a multi-day event until its last day', () => {
    const running = event('Coaching', iso(-2), { endDate: iso(1) });
    expect(getCategoriesWithUpcomingEvents([running]).has('Coaching')).toBe(true);
  });

  it('tolerates empty input and events without a category', () => {
    expect(getCategoriesWithUpcomingEvents(undefined).size).toBe(0);
    expect(getCategoriesWithUpcomingEvents([event('', iso(1))]).size).toBe(0);
  });
});

describe('getCalendarCategories', () => {
  it('lists only registry categories that have events, in registry order', () => {
    const events = [event('Coaching', iso(2)), event('Yoga', iso(1))];
    expect(getCalendarCategories(REGISTRY, events)).toEqual(['Yoga', 'Coaching']);
  });

  it('does not list categories that are not in the registry', () => {
    expect(getCalendarCategories(REGISTRY, [event('Unbekannt', iso(1))])).toEqual([]);
  });

  it('keeps a selected category visible even without events so it can be deselected', () => {
    expect(getCalendarCategories(REGISTRY, [], ['Therapie'])).toEqual(['Therapie']);
  });

  it('shows a category as soon as its first event exists', () => {
    expect(getCalendarCategories(REGISTRY, [])).toEqual([]);
    expect(getCalendarCategories(REGISTRY, [event('Therapie', iso(7))])).toEqual(['Therapie']);
  });
});
