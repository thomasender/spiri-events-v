import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MAX_EVENTS_PER_STORY,
  buildStoryItem,
  buildStoryModel,
  formatStoryDate,
  overviewStoryTitle,
  groupStories,
  runDailyStory,
  storyPostId,
  storyHeading,
  type StoryDeps,
  type StoryPostRecord,
} from '../../functions/src/instagram/instagramStory';
import type { CarouselEvent } from '../../functions/src/instagram/instagramCarousel';

const TOKEN = 'SECRET_TOKEN_123';
// Saturday 2026-10-17, 09:00 Vienna (CEST, UTC+2)
const NOW = new Date('2026-10-17T07:00:00Z');
const DAY = '2026-10-17';
// runDailyStory posts the day before, so with NOW on the 17th it covers the 18th.
const TOMORROW = '2026-10-18';

function ev(over: Partial<CarouselEvent> = {}): CarouselEvent {
  return {
    id: 'e1',
    status: 'approved',
    instagramConsent: true,
    title: 'Kundalini Yoga',
    date: DAY,
    time: '19:00',
    place: 'Studio Eins',
    bezirk: 'Feldkirch',
    category: 'Yoga',
    ...over,
  };
}

describe('groupStories', () => {
  it('keeps only consented, approved events of the day in that Bezirk, sorted by time', () => {
    const groups = groupStories(
      [
        ev({ id: 'late', time: '19:00' }),
        ev({ id: 'early', time: '9:30' }),
        ev({ id: 'other-day', date: '2026-10-18' }),
        ev({ id: 'other-bezirk', bezirk: 'Dornbirn' }),
        ev({ id: 'no-consent', instagramConsent: false }),
        ev({ id: 'pending', status: 'pending' }),
        ev({ id: 'online', isOnline: true }),
      ],
      DAY,
      'Feldkirch'
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].events.map((e) => e.id)).toEqual(['early', 'late']);
    expect(groups[0].parts).toBe(1);
  });

  it('returns nothing for a day without events or an unknown Bezirk', () => {
    expect(groupStories([ev({ date: '2026-10-18' })], DAY, 'Feldkirch')).toEqual([]);
    expect(groupStories([ev({ bezirk: 'Wien' })], DAY, 'Wien')).toEqual([]);
  });

  it('keeps up to 7 events in one story', () => {
    const seven = Array.from({ length: MAX_EVENTS_PER_STORY }, (_, i) =>
      ev({ id: `e${i}`, time: `${String(8 + i).padStart(2, '0')}:00` })
    );
    const groups = groupStories(seven, DAY, 'Feldkirch');
    expect(MAX_EVENTS_PER_STORY).toBe(7);
    expect(groups).toHaveLength(1);
    expect(groups[0].section).toBeUndefined();
    expect(storyHeading(groups[0])).toBe('Morgen');
  });

  it('splits a day with more than 7 events into Früh and Abend by start time', () => {
    const times = ['08:00', '09:00', '10:00', '11:00', '13:59', '14:00', '19:00', '20:00'];
    const many = times.map((time, i) => ev({ id: `e${i}`, time }));
    const groups = groupStories(many, DAY, 'Feldkirch');
    expect(groups.map((g) => [g.section, g.events.length])).toEqual([
      ['frueh', 5],
      ['abend', 3],
    ]);
    expect(groups.map((g) => storyHeading(g))).toEqual(['Morgen Früh', 'Morgen Abend']);
    expect(buildStoryModel(groups[0], DAY).partLabel).toBe('');
    const ids = groups.map((g) => storyPostId(g.bezirk, DAY, g.part, g.section));
    expect(ids).toEqual(['story_feldkirch_2026-10-17_frueh', 'story_feldkirch_2026-10-17_abend']);
  });

  it('spreads a half that still has more than 7 events evenly', () => {
    const morning = Array.from({ length: 8 }, (_, i) => ev({ id: `m${i}`, time: `0${i}:30` }));
    const evening = [ev({ id: 'a', time: '19:00' })];
    const groups = groupStories([...morning, ...evening], DAY, 'Feldkirch');
    expect(groups.map((g) => [g.section, g.part, g.events.length])).toEqual([
      ['frueh', 1, 4],
      ['frueh', 2, 4],
      ['abend', 1, 1],
    ]);
  });

  it('does not split by time when all events are in one half of the day', () => {
    const evening = Array.from({ length: 8 }, (_, i) => ev({ id: `a${i}`, time: `${15 + i}:00` }));
    const groups = groupStories(evening, DAY, 'Feldkirch');
    expect(groups.map((g) => g.section)).toEqual([undefined, undefined]);
  });
});

describe('story content', () => {
  it('builds image-safe items with time without "Uhr" and a shortened location', () => {
    const item = buildStoryItem(
      ev({ title: '🌿 Ein Tag 🌿', place: 'Aure Yoga - Le Studio / Steinebach 7, Dornbirn' })
    );
    expect(item.time).toBe('19:00');
    expect(item.title).toBe('Ein Tag');
    expect(item.location.length).toBeLessThanOrEqual(34);
    expect(item.location.endsWith('…')).toBe(true);
    expect(buildStoryItem(ev({ time: undefined })).time).toBe('');
  });

  it('labels the model with Bezirk, date and part', () => {
    const [group] = groupStories([ev()], DAY, 'Feldkirch');
    const model = buildStoryModel(group, DAY);
    expect(model).toMatchObject({
      heading: 'Heute',
      bezirk: 'in Feldkirch',
      dateLabel: 'Samstag, 17. Oktober',
      partLabel: '',
    });
    expect(model.items).toHaveLength(1);
  });

  it('shows the organizer name (never the @handle) only on short stories', () => {
    const named = (id: string, name?: string) =>
      ev({ id, organizer: name ? { name, instagramHandle: '@' + id } : undefined });
    const [short] = groupStories([named('e1', 'Maitri Roots'), named('e2')], DAY, 'Feldkirch');
    expect(buildStoryModel(short, DAY).items).toMatchObject([
      { organizer: 'Maitri Roots' },
      { organizer: '' },
    ]);
    const many = ['a', 'b', 'c'].map((id) => named(id, 'Name ' + id));
    const [long] = groupStories(many, DAY, 'Feldkirch');
    expect(buildStoryModel(long, DAY).items.map((i) => i.organizer)).toEqual(['', '', '']);
  });

  it('carries the event picture and its crop only for a story about a single event', () => {
    const single = { bezirk: 'Feldkirch', part: 1, parts: 1 } as const;
    const own = ev({
      id: 'a',
      imageUrl: ' https://img/a.jpg ',
      imageFocalPoint: { x: 0.4, y: 0.7 },
      imageZoom: 1.5,
    });
    expect(buildStoryModel({ ...single, events: [own] }, DAY).image).toEqual({
      url: 'https://img/a.jpg',
      focalX: 0.4,
      focalY: 0.7,
      zoom: 1.5,
    });
    expect(
      buildStoryModel(
        { ...single, events: [own, ev({ id: 'b', imageUrl: 'https://img/b.jpg' })] },
        DAY
      ).image
    ).toBeNull();
    expect(buildStoryModel({ ...single, events: [ev()] }, DAY).image).toBeNull();
  });

  it('prefers the organizer pick for Instagram over the event crop', () => {
    const picked = ev({
      imageUrl: 'https://img/a.jpg',
      imageFocalPoint: { x: 0.4, y: 0.7 },
      instagramImage: { url: 'https://img/ig.jpg', focalPoint: { x: 0.1, y: 0.2 }, zoom: 2 },
    });
    expect(
      buildStoryModel({ bezirk: 'Feldkirch', part: 1, parts: 1, events: [picked] }, DAY).image
    ).toEqual({ url: 'https://img/ig.jpg', focalX: 0.1, focalY: 0.2, zoom: 2 });
  });

  it('uses the calendar crop when the Instagram pick is the cover photo itself', () => {
    const picked = ev({
      imageUrl: 'https://img/a.jpg',
      imageFocalPoint: { x: 0.4, y: 0.7 },
      imageZoom: 1.5,
      instagramImage: { url: 'https://img/a.jpg', focalPoint: { x: 0.5, y: 0.5 }, zoom: 1 },
    });
    expect(
      buildStoryModel({ bezirk: 'Feldkirch', part: 1, parts: 1, events: [picked] }, DAY).image
    ).toEqual({ url: 'https://img/a.jpg', focalX: 0.4, focalY: 0.7, zoom: 1.5 });
  });

  it('has no suffix for part 1 and _p<n> afterwards', () => {
    expect(storyPostId('Feldkirch', DAY, 1)).toBe('story_feldkirch_2026-10-17');
    expect(storyPostId('Feldkirch', DAY, 2)).toBe('story_feldkirch_2026-10-17_p2');
  });
});

describe('runDailyStory', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
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
    const bodies: URLSearchParams[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (opts.fetchImpl) return opts.fetchImpl(url, init);
      const body = new URLSearchParams(String(init?.body ?? ''));
      if (url.endsWith('/media') && init?.method === 'POST') {
        bodies.push(body);
        return json({ id: 'container1' });
      }
      if (url.includes('?fields=status_code')) return json({ status_code: 'FINISHED' });
      if (url.endsWith('/media_publish')) {
        bodies.push(body);
        return json({ id: 'media1' });
      }
      if (url.includes('/media1?'))
        return json({ permalink: 'https://instagram.com/stories/x/1/' });
      return json({ error: { message: 'unexpected' } }, 500);
    });
    const notify = vi.fn(async () => undefined);
    const deps: StoryDeps = {
      fetch: fetchMock as unknown as typeof fetch,
      accessToken: TOKEN,
      userId: 'IGUSER',
      isEnabled: async () => opts.enabled ?? true,
      listEvents: vi.fn(async () => opts.events ?? [ev()]),
      async createPost(id, record: StoryPostRecord) {
        if (posts.has(id)) return false;
        posts.set(id, { ...record });
        return true;
      },
      async updatePost(id, patch) {
        posts.set(id, { ...posts.get(id), ...patch });
      },
      generateStoryImage: async (name) => `https://img/${name}.jpg`,
      notifyAdmins: notify,
    };
    return { deps, posts, bodies, fetchMock, notify };
  }

  it('posts one story with media_type STORIES and records it', async () => {
    const h = makeHarness({ events: [ev({ date: TOMORROW })] });
    const outcome = await runDailyStory(h.deps, 'Feldkirch');
    expect(outcome).toEqual({
      status: 'done',
      day: TOMORROW,
      results: [{ id: 'story_feldkirch_2026-10-18', outcome: 'published' }],
    });
    expect(h.bodies[0].get('media_type')).toBe('STORIES');
    expect(h.bodies[0].get('image_url')).toBe('https://img/story_feldkirch_2026-10-18.jpg');
    expect(h.bodies[1].get('creation_id')).toBe('container1');
    expect(h.posts.get('story_feldkirch_2026-10-18')).toMatchObject({
      type: 'story',
      status: 'published',
      igMediaId: 'media1',
      permalink: 'https://instagram.com/stories/x/1/',
      eventIds: ['e1'],
    });
    expect(h.deps.listEvents).toHaveBeenCalledWith({ start: TOMORROW, end: TOMORROW });
  });

  it('uses the Vienna day, not UTC (00:30 Vienna is still the day before in UTC)', async () => {
    const h = makeHarness({ events: [ev({ date: '2026-10-19' })] });
    vi.setSystemTime(new Date('2026-10-17T22:30:00Z'));
    const outcome = await runDailyStory(h.deps, 'Feldkirch');
    expect(outcome).toMatchObject({ day: '2026-10-19' });
  });

  it('does nothing when posting is disabled', async () => {
    const h = makeHarness({ enabled: false });
    expect(await runDailyStory(h.deps, 'Feldkirch')).toEqual({ status: 'disabled' });
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('posts nothing on a day without events', async () => {
    const h = makeHarness({ events: [] });
    expect(await runDailyStory(h.deps, 'Feldkirch')).toEqual({
      status: 'done',
      day: TOMORROW,
      results: [],
    });
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('does not post twice for the same Bezirk and day', async () => {
    const h = makeHarness({
      events: [ev({ date: TOMORROW })],
      existing: ['story_feldkirch_2026-10-18'],
    });
    const outcome = await runDailyStory(h.deps, 'Feldkirch');
    expect(outcome).toMatchObject({
      results: [{ id: 'story_feldkirch_2026-10-18', outcome: 'duplicate' }],
    });
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('records the failure, mails the admins and never leaks the token', async () => {
    const h = makeHarness({
      events: [ev({ date: TOMORROW })],
      fetchImpl: () => json({ error: { message: `bad token ${TOKEN}` } }, 400),
    });
    const outcome = await runDailyStory(h.deps, 'Feldkirch');
    expect(outcome).toMatchObject({
      results: [{ id: 'story_feldkirch_2026-10-18', outcome: 'failed' }],
    });
    const record = h.posts.get('story_feldkirch_2026-10-18');
    expect(record?.status).toBe('failed');
    expect(String(record?.error)).not.toContain(TOKEN);
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.notify.mock.calls)).not.toContain(TOKEN);
  });

  it('still counts the story as published when the permalink lookup fails', async () => {
    const h = makeHarness({
      events: [ev({ date: TOMORROW })],
      fetchImpl: (url, init) => {
        if (url.includes('/media1?')) return json({ error: { message: 'nope' } }, 500);
        if (url.endsWith('/media') && init?.method === 'POST') return json({ id: 'container1' });
        if (url.includes('?fields=status_code')) return json({ status_code: 'FINISHED' });
        return json({ id: 'media1' });
      },
    });
    const outcome = await runDailyStory(h.deps, 'Feldkirch');
    expect(outcome).toMatchObject({ results: [{ outcome: 'published' }] });
    expect(h.posts.get('story_feldkirch_2026-10-18')).toMatchObject({
      status: 'published',
      permalink: null,
    });
  });
});

describe('story title and date', () => {
  it('titles the overview "Morgen in <Bezirk>"', () => {
    expect(overviewStoryTitle('Dornbirn')).toBe('Morgen in Dornbirn');
    expect(overviewStoryTitle('Grenznahe')).toBe('Morgen in der Umgebung');
    expect(overviewStoryTitle('Dornbirn', 'Morgen Abend')).toBe('Morgen Abend in Dornbirn');
  });

  it('writes weekday and date out in full', () => {
    expect(formatStoryDate('2026-10-18')).toBe('Sonntag, 18. Oktober');
    expect(formatStoryDate('kaputt')).toBe('');
    const [group] = groupStories([ev({ date: TOMORROW })], TOMORROW, 'Feldkirch');
    expect(buildStoryModel(group, TOMORROW, null, 'Morgen').dateLabel).toBe('Sonntag, 18. Oktober');
  });
});
