import { describe, it, expect, vi } from 'vitest';
import {
  CALENDAR_TOKEN_PATTERN,
  isValidCalendarToken,
  MAX_FEED_EVENTS,
  MAX_SINGLE_EVENT_OCCURRENCES,
  parseCalendarRequest,
  selectFeedEvents,
  selectSingleEvent,
  type PublicEvent,
} from '../../functions/src/calendar/calendarRoutes';
import {
  calendarFeedTokenHandler,
  generateCalendarFeedToken,
} from '../../functions/src/calendarFeedToken';

const TODAY = '2026-10-12';
const CATEGORIES = new Set(['Yoga', 'Tanz']);

const TOKEN = 'A'.repeat(20) + 'b_-'.repeat(7) + 'z2';
// Every calendar URL carries the user's token; `parse` adds it unless the test passes its own.
const parse = (path: string, query: Record<string, unknown> = {}) =>
  parseCalendarRequest(path, { token: TOKEN, ...query }, CATEGORIES);

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
    expect(parse('/calendar/feed.ics')).toEqual({
      kind: 'feed',
      token: TOKEN,
      region: 'vorarlberg',
      bezirk: [],
      kategorie: [],
    });
    expect(parse('/calendar/feed.ics', { bezirk: 'Online', kategorie: 'Tanz' })).toEqual({
      kind: 'feed',
      token: TOKEN,
      region: 'vorarlberg',
      bezirk: ['Online'],
      kategorie: ['Tanz'],
    });
  });

  it('accepts several bezirke and categories at once', () => {
    expect(
      parse('/calendar/feed.ics', { bezirk: ['Dornbirn', 'Bregenz'], kategorie: ['Yoga', 'Tanz'] })
    ).toEqual({
      kind: 'feed',
      token: TOKEN,
      region: 'vorarlberg',
      bezirk: ['Dornbirn', 'Bregenz'],
      kategorie: ['Yoga', 'Tanz'],
    });
    expect(parse('/calendar/feed.ics', { bezirk: ['Dornbirn', 'Wien'] })).toMatchObject({
      status: 400,
    });
  });

  it('rejects unknown parameters, bezirke and categories (no cache busting)', () => {
    expect(parse('/calendar/feed.ics', { x: '1' })).toMatchObject({ kind: 'error', status: 400 });
    expect(parse('/calendar/feed.ics', { bezirk: 'Wien' })).toMatchObject({ status: 400 });
    expect(parse('/calendar/feed.ics', { kategorie: 'Zufall123' })).toMatchObject({ status: 400 });
    expect(parse('/calendar/feed.ics', { bezirk: [{}] })).toMatchObject({ status: 400 });
  });

  it('takes an optional region and checks Orte against that region', () => {
    expect(parse('/calendar/feed.ics', { region: 'vorarlberg' })).toMatchObject({
      region: 'vorarlberg',
    });
    expect(
      parse('/calendar/feed.ics', { region: 'steiermark', bezirk: ['Graz', 'Online'] })
    ).toEqual({
      kind: 'feed',
      token: TOKEN,
      region: 'steiermark',
      bezirk: ['Graz', 'Online'],
      kategorie: [],
    });
    // Vorarlberg Bezirke are not valid in another region and vice versa.
    expect(parse('/calendar/feed.ics', { region: 'steiermark', bezirk: 'Dornbirn' })).toMatchObject(
      { status: 400 }
    );
    expect(parse('/calendar/feed.ics', { bezirk: 'Graz' })).toMatchObject({ status: 400 });
    // Tirol has no static Bezirke: they come from the register the handler passes in.
    expect(
      parseCalendarRequest(
        '/calendar/feed.ics',
        { token: TOKEN, region: 'tirol', bezirk: 'Imst' },
        CATEGORIES,
        { tirol: ['Imst'] }
      )
    ).toMatchObject({ kind: 'feed', region: 'tirol', bezirk: ['Imst'] });
    // Unknown slugs and non-strings are a 400; a known (even inactive) region is valid.
    expect(parse('/calendar/feed.ics', { region: 'atlantis' })).toMatchObject({ status: 400 });
    expect(parse('/calendar/feed.ics', { region: ['tirol', 'wien'] })).toMatchObject({
      status: 400,
    });
    expect(parse('/calendar/feed.ics', { region: 'wien' })).toMatchObject({ kind: 'feed' });
  });

  it('accepts a single event by slug and rejects odd input', () => {
    expect(parse('/calendar/event/kakao-20261014.ics')).toEqual({
      kind: 'event',
      token: TOKEN,
      slug: 'kakao-20261014',
    });
    expect(parse('/calendar/event/..%2Fsecret.ics')).toMatchObject({ status: 404 });
    expect(parse('/calendar/event/a b.ics')).toMatchObject({ status: 404 });
    expect(parse('/calendar/event/x.ics', { foo: 'bar' })).toMatchObject({ status: 400 });
    expect(parse('/calendar/other.ics')).toMatchObject({ status: 404 });
  });
});

describe('calendar token', () => {
  it('accepts exactly 43 base64url characters', () => {
    expect(TOKEN).toHaveLength(43);
    expect(isValidCalendarToken(TOKEN)).toBe(true);
    expect(CALENDAR_TOKEN_PATTERN.test(TOKEN)).toBe(true);
    for (const bad of [
      undefined,
      '',
      TOKEN.slice(1),
      `${TOKEN}x`,
      `${TOKEN.slice(1)}=`,
      `${TOKEN.slice(1)}/`,
      `${TOKEN.slice(1)} `,
      [TOKEN],
      42,
    ]) {
      expect(isValidCalendarToken(bad)).toBe(false);
    }
  });

  it('answers 401 on both routes without a well-formed token, before any other check', () => {
    for (const path of ['/calendar/feed.ics', '/calendar/event/kakao-20261014.ics']) {
      for (const token of [undefined, '', 'short', [TOKEN, TOKEN], `${TOKEN}!`]) {
        expect(parseCalendarRequest(path, { token }, CATEGORIES)).toEqual({
          kind: 'error',
          status: 401,
          message: 'Unauthorized',
        });
      }
      expect(parseCalendarRequest(path, { x: '1' }, CATEGORIES)).toMatchObject({ status: 401 });
    }
  });

  it('still rejects unknown parameters next to a valid token', () => {
    expect(parse('/calendar/event/x.ics', { foo: 'bar' })).toMatchObject({ status: 400 });
    expect(parse('/calendar/feed.ics', { tokenx: '1' })).toMatchObject({ status: 400 });
  });
});

describe('selectFeedEvents', () => {
  const none = { bezirk: [], kategorie: [] };

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
      selectFeedEvents(events, TODAY, { bezirk: ['Bregenz'], kategorie: [] }).map((e) => e.id)
    ).toEqual(['b']);
    expect(
      selectFeedEvents(events, TODAY, { bezirk: ['Online'], kategorie: [] }).map((e) => e.id)
    ).toEqual(['o']);
    expect(
      selectFeedEvents(events, TODAY, { bezirk: [], kategorie: ['Tanz'] }).map((e) => e.id)
    ).toEqual(['b']);
    expect(
      selectFeedEvents(events, TODAY, {
        bezirk: ['Dornbirn', 'Online'],
        kategorie: ['Yoga', 'Tanz'],
      })
        .map((e) => e.id)
        .sort()
    ).toEqual(['d', 'o']);
    expect(
      selectFeedEvents(events, TODAY, { bezirk: [], kategorie: ['Yoga', 'Tanz'] }).map((e) => e.id)
        .length
    ).toBe(3);
  });

  it('caps the feed', () => {
    const many = Array.from({ length: MAX_FEED_EVENTS + 50 }, (_, i) => ev({ id: `e${i}` }));
    expect(selectFeedEvents(many, TODAY, none)).toHaveLength(MAX_FEED_EVENTS);
  });
});

describe('selectFeedEvents by region', () => {
  const none = { bezirk: [], kategorie: [] };
  const events = [
    ev({ id: 'vbg' }),
    ev({ id: 'vbg-old', regionId: 'vorarlberg' } as never),
    ev({ id: 'stmk', regionId: 'steiermark', bezirk: 'Graz' } as never),
    ev({ id: 'tirol', regionId: 'tirol', bezirk: 'Imst' } as never),
    ev({ id: 'online-stmk', regionId: 'steiermark', isOnline: true } as never),
    ev({ id: 'online-tirol', regionId: 'tirol', isOnline: true } as never),
  ];
  const ids = (regionId: string, active: string[]) =>
    selectFeedEvents(events, TODAY, { ...none, regionId, activeRegionIds: active }).map(
      (e) => e.id
    );

  it('keeps events without regionId in Vorarlberg and online events in every active region', () => {
    expect(ids('vorarlberg', ['vorarlberg'])).toEqual(['vbg', 'vbg-old']);
    expect(ids('steiermark', ['vorarlberg', 'steiermark'])).toEqual(['stmk', 'online-stmk']);
  });

  it('shows only events of active regions', () => {
    expect(ids('steiermark', ['vorarlberg', 'steiermark', 'tirol'])).toEqual([
      'stmk',
      'online-stmk',
      'online-tirol',
    ]);
  });

  it('returns an empty feed for an inactive region', () => {
    expect(ids('tirol', ['vorarlberg'])).toEqual([]);
    expect(ids('wien', ['vorarlberg', 'steiermark'])).toEqual([]);
  });

  it('does not restrict by region when none is given', () => {
    expect(selectFeedEvents(events, TODAY, none)).toHaveLength(events.length);
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

describe('calendarFeedTokenHandler', () => {
  function memoryStore(initial: Record<string, string> = {}) {
    const docs = new Map(Object.entries(initial));
    return {
      docs,
      read: vi.fn(async (uid: string) => docs.get(uid) ?? null),
      createIfAbsent: vi.fn(async (uid: string, token: string) => {
        if (docs.has(uid)) return false;
        docs.set(uid, token);
        return true;
      }),
      replace: vi.fn(async (uid: string, token: string) => void docs.set(uid, token)),
      remove: vi.fn(async (uid: string) => void docs.delete(uid)),
    };
  }
  const noLimit = vi.fn();
  const call = (
    store: ReturnType<typeof memoryStore>,
    data: unknown = {},
    auth: { uid: string } | null = { uid: 'u1' },
    generate = () => 'fresh-token'
  ) => calendarFeedTokenHandler({ auth, data }, { store, generate, enforceRateLimit: noLimit });

  it('rejects signed-out callers', async () => {
    const store = memoryStore();
    await expect(call(store, {}, null)).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(store.docs.size).toBe(0);
  });

  it('creates a token once and returns the same one afterwards', async () => {
    const store = memoryStore();
    expect(await call(store)).toEqual({ token: 'fresh-token' });
    expect(await call(store, {}, { uid: 'u1' }, () => 'other')).toEqual({ token: 'fresh-token' });
    expect(store.docs.get('u1')).toBe('fresh-token');
  });

  it('returns the winner when a parallel call created the token first', async () => {
    const store = memoryStore();
    store.read.mockResolvedValueOnce(null);
    store.docs.set('u1', 'winner');
    expect(await call(store)).toEqual({ token: 'winner' });
  });

  it('regenerate replaces the token, revoke deletes it', async () => {
    const store = memoryStore({ u1: 'old' });
    expect(await call(store, { regenerate: true })).toEqual({ token: 'fresh-token' });
    expect(store.docs.get('u1')).toBe('fresh-token');
    expect(await call(store, { revoke: true })).toEqual({ token: null });
    expect(store.docs.has('u1')).toBe(false);
  });

  it('only touches the caller’s own token', async () => {
    const store = memoryStore({ other: 'theirs' });
    await call(store, { regenerate: true });
    await call(store, { revoke: true });
    expect(store.docs.get('other')).toBe('theirs');
  });

  it('generates 43-character base64url tokens', () => {
    const a = generateCalendarFeedToken();
    expect(isValidCalendarToken(a)).toBe(true);
    expect(generateCalendarFeedToken()).not.toBe(a);
  });
});
