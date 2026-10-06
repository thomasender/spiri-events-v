import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getNextWeekWindow,
  isCarouselEligible,
  groupCarousels,
  buildCarouselCaption,
  formatWeekRange,
  carouselPostId,
  runWeeklyCarousels,
  type CarouselDeps,
  type CarouselEvent,
  type CarouselPostRecord,
} from '../../functions/src/instagram/instagramCarousel';
import { CAPTION_MAX_LENGTH } from '../../functions/src/instagram/instagramContent';

const TOKEN = 'SECRET_TOKEN_123';
// Sunday 2026-10-04 10:00 Vienna (CEST, UTC+2)
const SUNDAY = new Date('2026-10-04T08:00:00Z');
const WINDOW = { start: '2026-10-05', end: '2026-10-11' };

function ev(over: Partial<CarouselEvent> = {}): CarouselEvent {
  return {
    id: 'e1',
    status: 'approved',
    instagramConsent: true,
    title: 'Kakao Zeremonie',
    date: '2026-10-07',
    time: '18:00',
    place: 'Studio Eins',
    bezirk: 'Dornbirn',
    ...over,
  };
}

describe('getNextWeekWindow', () => {
  it('returns the Monday-Sunday after a Sunday', () => {
    expect(getNextWeekWindow(SUNDAY)).toEqual(WINDOW);
  });

  it('uses the Vienna date, not UTC (Sunday 00:30 Vienna is still Saturday UTC)', () => {
    expect(getNextWeekWindow(new Date('2026-10-03T22:30:00Z'))).toEqual(WINDOW);
  });

  it('works when the week contains the end of DST (Oct 25 2026)', () => {
    expect(getNextWeekWindow(new Date('2026-10-18T08:00:00Z'))).toEqual({
      start: '2026-10-19',
      end: '2026-10-25',
    });
    // The Sunday of the clock change itself, 10:00 Vienna (CET)
    expect(getNextWeekWindow(new Date('2026-10-25T09:00:00Z'))).toEqual({
      start: '2026-10-26',
      end: '2026-11-01',
    });
  });

  it('works across the start of DST (Mar 29 2026)', () => {
    expect(getNextWeekWindow(new Date('2026-03-22T09:00:00Z'))).toEqual({
      start: '2026-03-23',
      end: '2026-03-29',
    });
    expect(getNextWeekWindow(new Date('2026-03-29T08:00:00Z'))).toEqual({
      start: '2026-03-30',
      end: '2026-04-05',
    });
  });

  it('crosses the year end', () => {
    const w = getNextWeekWindow(new Date('2026-12-27T09:00:00Z'));
    expect(w).toEqual({ start: '2026-12-28', end: '2027-01-03' });
    expect(formatWeekRange(w)).toBe('28. Dez 2026 – 3. Jan 2027');
  });

  it('formats ranges within one month and across months', () => {
    expect(formatWeekRange(WINDOW)).toBe('5. – 11. Okt 2026');
    expect(formatWeekRange({ start: '2026-10-26', end: '2026-11-01' })).toBe(
      '26. Okt – 1. Nov 2026'
    );
  });
});

describe('isCarouselEligible', () => {
  it('accepts an approved, consented event in the window with a Bezirk', () => {
    expect(isCarouselEligible(ev(), WINDOW)).toBe(true);
    expect(isCarouselEligible(ev({ date: '2026-10-05' }), WINDOW)).toBe(true);
    expect(isCarouselEligible(ev({ date: '2026-10-11' }), WINDOW)).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isCarouselEligible(ev({ status: 'pending' }), WINDOW)).toBe(false);
    expect(isCarouselEligible(ev({ instagramConsent: undefined }), WINDOW)).toBe(false);
    expect(isCarouselEligible(ev({ instagramConsent: false }), WINDOW)).toBe(false);
    expect(isCarouselEligible(ev({ instagramConsent: 'true' }), WINDOW)).toBe(false);
    expect(isCarouselEligible(ev({ date: '2026-10-04' }), WINDOW)).toBe(false);
    expect(isCarouselEligible(ev({ date: '2026-10-12' }), WINDOW)).toBe(false);
    expect(isCarouselEligible(ev({ bezirk: '' }), WINDOW)).toBe(false);
    expect(isCarouselEligible(ev({ bezirk: undefined }), WINDOW)).toBe(false);
    expect(isCarouselEligible(ev({ bezirk: 'Grenznahe' }), WINDOW)).toBe(false);
    expect(isCarouselEligible(ev({ isOnline: true, bezirk: 'Dornbirn' }), WINDOW)).toBe(false);
  });
});

describe('groupCarousels', () => {
  it('groups per Bezirk, sorts by date/time and skips empty Bezirke', () => {
    const groups = groupCarousels(
      [
        ev({ id: 'b', date: '2026-10-08', time: '09:00' }),
        ev({ id: 'a', date: '2026-10-07', time: '18:00' }),
        ev({ id: 'c', date: '2026-10-07', time: '9:30' }),
        ev({ id: 'f', bezirk: 'Feldkirch' }),
        ev({ id: 'x', bezirk: 'Bregenz', instagramConsent: false }),
      ],
      WINDOW
    );
    expect(groups.map((g) => g.bezirk)).toEqual(['Dornbirn', 'Feldkirch']);
    expect(groups[0].events.map((e) => e.id)).toEqual(['c', 'a', 'b']);
    expect(groups[0].parts).toBe(1);
  });

  it('chunks into carousels of 9 events', () => {
    const many = Array.from({ length: 19 }, (_, i) =>
      ev({ id: `e${i}`, time: `${String(8 + (i % 12)).padStart(2, '0')}:00` })
    );
    const groups = groupCarousels(many, WINDOW);
    expect(groups.map((g) => g.events.length)).toEqual([9, 9, 1]);
    expect(groups.map((g) => g.part)).toEqual([1, 2, 3]);
    expect(groups.every((g) => g.parts === 3)).toBe(true);
  });
});

describe('carouselPostId', () => {
  it('has no suffix for part 1 and _p<n> afterwards', () => {
    expect(carouselPostId('Dornbirn', '2026-10-05', 1)).toBe('carousel_dornbirn_2026-10-05');
    expect(carouselPostId('Dornbirn', '2026-10-05', 2)).toBe('carousel_dornbirn_2026-10-05_p2');
  });
});

describe('buildCarouselCaption', () => {
  const group = (events: CarouselEvent[]) => ({
    bezirk: 'Dornbirn' as const,
    part: 1,
    parts: 1,
    events,
  });

  it('lists events with date, time, title and place plus link and hashtags', () => {
    const caption = buildCarouselCaption(group([ev()]), WINDOW);
    expect(caption).toContain('Events nächste Woche in Dornbirn');
    expect(caption).toContain('• Mi, 7 Okt · 18:00 Uhr – Kakao Zeremonie (Studio Eins)');
    expect(caption).toContain('https://www.thetribe.at');
    expect(caption).toContain('#vorarlberg');
    expect(caption).toContain('#dornbirn');
  });

  it('never exceeds 2200 chars and ends the list with the "more" line', () => {
    const events = Array.from({ length: 9 }, (_, i) =>
      ev({
        id: `e${i}`,
        title: `Ein sehr langer Veranstaltungstitel Nummer ${i} `.repeat(3),
        place: 'P'.repeat(300),
      })
    );
    const caption = buildCarouselCaption(group(events), WINDOW);
    expect(caption.length).toBeLessThanOrEqual(CAPTION_MAX_LENGTH);
    expect(caption).toContain('…und mehr auf thetribe.at');
    expect(caption).toContain('#vorarlberg');
  });
});

describe('runWeeklyCarousels', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(SUNDAY);
  });
  afterEach(() => vi.useRealTimers());

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
  }

  function makeHarness(
    opts: {
      enabled?: boolean;
      events?: CarouselEvent[];
      existing?: string[];
      fetchImpl?: (url: string, init?: RequestInit) => Response | Promise<Response>;
    } = {}
  ) {
    const posts = new Map<string, Record<string, unknown>>();
    for (const id of opts.existing ?? []) posts.set(id, {});
    const calls: string[] = [];
    let childCounter = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (opts.fetchImpl) return opts.fetchImpl(url, init);
      const body = new URLSearchParams(String(init?.body ?? ''));
      if (url.endsWith('/media') && init?.method === 'POST') {
        if (body.get('media_type') === 'CAROUSEL') {
          calls.push(`parent:${body.get('children')}`);
          return json({ id: 'parent1' });
        }
        childCounter += 1;
        calls.push(`child:${body.get('image_url')}:${body.get('is_carousel_item')}`);
        return json({ id: `child${childCounter}` });
      }
      if (url.includes('?fields=status_code')) {
        calls.push(`poll:${url.split('?')[0].split('/').pop()}`);
        return json({ status_code: 'FINISHED' });
      }
      if (url.endsWith('/media_publish')) {
        calls.push(`publish:${body.get('creation_id')}`);
        return json({ id: 'media1' });
      }
      if (url.includes('/media1?')) return json({ permalink: 'https://instagram.com/p/abc/' });
      return json({ error: { message: 'unexpected' } }, 500);
    });
    const notify = vi.fn(async () => undefined);
    const listEvents = vi.fn(async () => opts.events ?? [ev(), ev({ id: 'e2', time: '19:00' })]);
    const deps: CarouselDeps = {
      fetch: fetchMock as unknown as typeof fetch,
      accessToken: TOKEN,
      userId: 'IGUSER',
      isEnabled: async () => opts.enabled ?? true,
      listEvents,
      async createPost(id, record: CarouselPostRecord) {
        if (posts.has(id)) return false;
        posts.set(id, { ...record });
        return true;
      },
      async updatePost(id, patch) {
        posts.set(id, { ...posts.get(id), ...patch });
      },
      generateCoverImage: async (name) => `https://img/${name}.jpg`,
      generateEventImage: async (name) => `https://img/${name}.jpg`,
      notifyAdmins: notify,
    };
    return { deps, fetchMock, posts, notify, calls, listEvents };
  }

  it('does nothing when the kill switch is off', async () => {
    const h = makeHarness({ enabled: false });
    expect(await runWeeklyCarousels(h.deps)).toEqual({ status: 'disabled' });
    expect(h.listEvents).not.toHaveBeenCalled();
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.posts.size).toBe(0);
  });

  it('does not post when no event is eligible (no consent yet)', async () => {
    const h = makeHarness({ events: [ev({ instagramConsent: undefined })] });
    const out = await runWeeklyCarousels(h.deps);
    expect(out).toMatchObject({ status: 'done', results: [] });
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('runs children -> poll children -> parent -> poll parent -> publish in order', async () => {
    const h = makeHarness();
    const out = await runWeeklyCarousels(h.deps);
    expect(out).toMatchObject({
      status: 'done',
      results: [{ id: 'carousel_dornbirn_2026-10-05', outcome: 'published' }],
    });
    expect(h.calls).toEqual([
      'child:https://img/carousel_dornbirn_2026-10-05_0.jpg:true',
      'child:https://img/carousel_dornbirn_2026-10-05_1.jpg:true',
      'child:https://img/carousel_dornbirn_2026-10-05_2.jpg:true',
      'poll:child1',
      'poll:child2',
      'poll:child3',
      'parent:child1,child2,child3',
      'poll:parent1',
      'publish:parent1',
    ]);
    expect(h.posts.get('carousel_dornbirn_2026-10-05')).toMatchObject({
      type: 'carousel',
      status: 'published',
      igMediaId: 'media1',
      permalink: 'https://instagram.com/p/abc/',
      attempts: 1,
      eventIds: ['e1', 'e2'],
    });
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('sends the caption URL-encoded in the form body', async () => {
    const h = makeHarness();
    await runWeeklyCarousels(h.deps);
    const parentCall = h.fetchMock.mock.calls.find(([, init]) =>
      String(init?.body ?? '').includes('media_type=CAROUSEL')
    );
    const body = new URLSearchParams(String(parentCall?.[1]?.body));
    expect(body.get('caption')).toContain('Events nächste Woche in Dornbirn');
    expect(body.get('access_token')).toBe(TOKEN);
  });

  it('does not post twice when the post document already exists', async () => {
    const h = makeHarness({ existing: ['carousel_dornbirn_2026-10-05'] });
    const out = await runWeeklyCarousels(h.deps);
    expect(out).toMatchObject({
      results: [{ id: 'carousel_dornbirn_2026-10-05', outcome: 'duplicate' }],
    });
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('creates a second part for more than 9 events', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ev({ id: `e${i}` }));
    const h = makeHarness({ events });
    const out = await runWeeklyCarousels(h.deps);
    expect(out).toMatchObject({
      results: [
        { id: 'carousel_dornbirn_2026-10-05', outcome: 'published' },
        { id: 'carousel_dornbirn_2026-10-05_p2', outcome: 'published' },
      ],
    });
  });

  it('marks failure, mails admins without leaking the token, and continues with other carousels', async () => {
    let first = true;
    const h = makeHarness({
      events: [ev(), ev({ id: 'f1', bezirk: 'Feldkirch' })],
      fetchImpl: (url, init) => {
        const body = new URLSearchParams(String(init?.body ?? ''));
        if (url.endsWith('/media') && body.get('is_carousel_item') === 'true' && first) {
          first = false;
          return json({ error: { message: `bad token ${TOKEN}` } }, 400);
        }
        if (url.endsWith('/media') && init?.method === 'POST') {
          return json({ id: body.get('media_type') === 'CAROUSEL' ? 'parent1' : 'c' });
        }
        if (url.includes('?fields=status_code')) return json({ status_code: 'FINISHED' });
        if (url.endsWith('/media_publish')) return json({ id: 'media1' });
        return json({ permalink: 'https://instagram.com/p/x/' });
      },
    });
    const out = await runWeeklyCarousels(h.deps);
    expect(out).toMatchObject({
      results: [
        { id: 'carousel_dornbirn_2026-10-05', outcome: 'failed' },
        { id: 'carousel_feldkirch_2026-10-05', outcome: 'published' },
      ],
    });
    const failed = h.posts.get('carousel_dornbirn_2026-10-05') as Record<string, unknown>;
    expect(failed.status).toBe('failed');
    expect(String(failed.error)).not.toContain(TOKEN);
    expect(h.notify).toHaveBeenCalledTimes(1);
    const [subject, text] = h.notify.mock.calls[0] as unknown as [string, string];
    expect(subject).toContain('Dornbirn');
    expect(text).not.toContain(TOKEN);
  });

  it('fails when a container reports ERROR and never publishes', async () => {
    const h = makeHarness({
      fetchImpl: (url, init) => {
        if (url.endsWith('/media') && init?.method === 'POST') return json({ id: 'c1' });
        if (url.includes('?fields=status_code')) {
          return json({ status_code: 'ERROR', status: 'bad image' });
        }
        return json({ id: 'should-not-happen' });
      },
    });
    const out = await runWeeklyCarousels(h.deps);
    expect(out).toMatchObject({ results: [{ outcome: 'failed' }] });
    expect(h.fetchMock.mock.calls.some(([u]) => String(u).endsWith('/media_publish'))).toBe(false);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('polls until FINISHED using fake timers', async () => {
    let polls = 0;
    const h = makeHarness({
      events: [ev()],
      fetchImpl: (url, init) => {
        if (url.endsWith('/media') && init?.method === 'POST') {
          const body = new URLSearchParams(String(init.body));
          return json({ id: body.get('media_type') === 'CAROUSEL' ? 'parent1' : 'c' });
        }
        if (url.includes('?fields=status_code')) {
          polls += 1;
          return json({ status_code: polls < 3 ? 'IN_PROGRESS' : 'FINISHED' });
        }
        if (url.endsWith('/media_publish')) return json({ id: 'media1' });
        return json({ permalink: null });
      },
    });
    const promise = runWeeklyCarousels(h.deps);
    await vi.runAllTimersAsync();
    const out = await promise;
    expect(out).toMatchObject({ results: [{ outcome: 'published' }] });
  });
});
