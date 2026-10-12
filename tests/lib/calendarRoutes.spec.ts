import { describe, it, expect } from 'vitest';
import {
  MAX_FEED_EVENTS,
  MAX_SINGLE_EVENT_OCCURRENCES,
  parseCalendarRequest,
  selectFeedEvents,
  selectSingleEvent,
  type PublicEvent,
} from '../../functions/src/calendar/calendarRoutes';

const TODAY = '2026-10-12';
const CATEGORIES = new Set(['Yoga', 'Tanz']);

const parse = (path: string, query: Record<string, unknown> = {}) =>
  parseCalendarRequest(path, query, CATEGORIES);

function ev(over: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id: 'e1',
    status: 'approved',
    date: '2026-10-14',
    time: '18:00',
    bezirk: 'Dornbirn',
    category: 'Yoga',
    ...over,
  };
}

describe('parseCalendarRequest', () => {
  it('accepts the feed with and without known filters', () => {
    expect(parse('/calendar/feed.ics')).toEqual({ kind: 'feed', bezirk: null, kategorie: null });
    expect(parse('/calendar/feed.ics', { bezirk: 'Online', kategorie: 'Tanz' })).toEqual({
      kind: 'feed',
      bezirk: 'Online',
      kategorie: 'Tanz',
    });
  });

  it('rejects unknown parameters, bezirke and categories (no cache busting)', () => {
    expect(parse('/calendar/feed.ics', { x: '1' })).toMatchObject({ kind: 'error', status: 400 });
    expect(parse('/calendar/feed.ics', { bezirk: 'Wien' })).toMatchObject({ status: 400 });
    expect(parse('/calendar/feed.ics', { kategorie: 'Zufall123' })).toMatchObject({ status: 400 });
    expect(parse('/calendar/feed.ics', { bezirk: ['Dornbirn', 'Bregenz'] })).toMatchObject({
      status: 400,
    });
  });

  it('accepts a single event by slug and rejects odd input', () => {
    expect(parse('/calendar/event/kakao-20261014.ics')).toEqual({
      kind: 'event',
      slug: 'kakao-20261014',
    });
    expect(parse('/calendar/event/..%2Fsecret.ics')).toMatchObject({ status: 404 });
    expect(parse('/calendar/event/a b.ics')).toMatchObject({ status: 404 });
    expect(parse('/calendar/event/x.ics', { foo: 'bar' })).toMatchObject({ status: 400 });
    expect(parse('/calendar/other.ics')).toMatchObject({ status: 404 });
  });
});

describe('selectFeedEvents', () => {
  const none = { bezirk: null, kategorie: null };

  it('includes only approved, upcoming events inside the horizon, sorted', () => {
    const out = selectFeedEvents(
      [
        ev({ id: 'late', date: '2026-10-20' }),
        ev({ id: 'draft', status: 'draft' }),
        ev({ id: 'trashed', status: 'trashed' }),
        ev({ id: 'past', date: '2026-10-01' }),
        ev({ id: 'far', date: '2027-06-01' }),
        ev({ id: 'soon', date: '2026-10-13' }),
      ],
      TODAY,
      none
    );
    expect(out.map((e) => e.id)).toEqual(['soon', 'late']);
  });

  it('includes a running multi-day event and expands recurring series', () => {
    const out = selectFeedEvents(
      [
        ev({ id: 'retreat', date: '2026-10-10', endDate: '2026-10-14' }),
        ev({ id: 'weekly', date: '2026-09-02', recurrence: 'weekly' }),
      ],
      TODAY,
      none
    );
    expect(out.map((e) => `${e.id}:${e.date}`)).toEqual([
      'retreat:2026-10-10',
      'weekly:2026-10-14',
      'weekly:2026-10-21',
      'weekly:2026-10-28',
      'weekly:2026-11-04',
      'weekly:2026-11-11',
      'weekly:2026-11-18',
      'weekly:2026-11-25',
      'weekly:2026-12-02',
    ]);
  });

  it('filters by bezirk, Online and category', () => {
    const events = [
      ev({ id: 'd', bezirk: 'Dornbirn' }),
      ev({ id: 'b', bezirk: 'Bregenz', category: 'Tanz' }),
      ev({ id: 'o', isOnline: true, bezirk: '' }),
    ];
    expect(
      selectFeedEvents(events, TODAY, { bezirk: 'Bregenz', kategorie: null }).map((e) => e.id)
    ).toEqual(['b']);
    expect(
      selectFeedEvents(events, TODAY, { bezirk: 'Online', kategorie: null }).map((e) => e.id)
    ).toEqual(['o']);
    expect(
      selectFeedEvents(events, TODAY, { bezirk: null, kategorie: 'Tanz' }).map((e) => e.id)
    ).toEqual(['b']);
  });

  it('caps the feed', () => {
    const many = Array.from({ length: MAX_FEED_EVENTS + 50 }, (_, i) => ev({ id: `e${i}` }));
    expect(selectFeedEvents(many, TODAY, none)).toHaveLength(MAX_FEED_EVENTS);
  });
});

describe('selectSingleEvent', () => {
  it('returns nothing for events that are not public', () => {
    expect(selectSingleEvent(ev({ status: 'draft' }), TODAY)).toEqual([]);
    expect(selectSingleEvent(ev({ date: '2026-09-01' }), TODAY)).toEqual([]);
  });

  it('returns all upcoming occurrences of a series', () => {
    const out = selectSingleEvent(
      ev({ date: '2026-10-14', recurrence: 'weekly', recurrenceEndDate: '2027-01-01' }),
      TODAY
    );
    expect(out[0].date).toBe('2026-10-14');
    expect(out).toHaveLength(12);
  });

  it('caps the occurrences of one event', () => {
    const customDates = Array.from({ length: 100 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 9, 13 + i));
      return d.toISOString().slice(0, 10);
    });
    const out = selectSingleEvent(ev({ recurrence: 'custom', customDates }), TODAY);
    expect(out).toHaveLength(MAX_SINGLE_EVENT_OCCURRENCES);
  });
});
