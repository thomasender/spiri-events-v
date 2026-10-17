import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MAX_EVENTS_PER_STORY,
  buildStoryItem,
  buildStoryModel,
  groupStories,
  runDailyStory,
  storyPostId,
  type StoryDeps,
  type StoryPostRecord,
} from '../../functions/src/instagram/instagramStory';
import type { CarouselEvent } from '../../functions/src/instagram/instagramCarousel';

const TOKEN = 'SECRET_TOKEN_123';
// Saturday 2026-10-17, 09:00 Vienna (CEST, UTC+2)
const NOW = new Date('2026-10-17T07:00:00Z');
const DAY = '2026-10-17';

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

  it('spreads more than one story worth of events evenly', () => {
    const many = Array.from({ length: MAX_EVENTS_PER_STORY + 1 }, (_, i) =>
      ev({ id: `e${i}`, time: `${String(8 + i).padStart(2, '0')}:00` })
    );
    const groups = groupStories(many, DAY, 'Feldkirch');
    expect(groups.map((g) => g.events.length)).toEqual([3, 2]);
    expect(groups.flatMap((g) => g.events.map((e) => e.id))).toEqual(many.map((e) => e.id));
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
      dateLabel: 'Sa, 17. Okt',
      partLabel: '',
    });
    expect(model.items).toHaveLength(1);
  });

  it('shows the organizer handle only on short stories', () => {
    const [short] = groupStories([ev(), ev({ id: 'e2' })], DAY, 'Feldkirch');
    expect(buildStoryModel(short, DAY, null, 'Heute', ['@maitri.roots', null]).items).toMatchObject(
      [{ organizer: '@maitri.roots' }, { organizer: '' }]
    );
    const many = Array.from({ length: 3 }, (_, i) => ev({ id: `e${i}` }));
    const [long] = groupStories(many, DAY, 'Feldkirch');
    expect(
      buildStoryModel(long, DAY, null, 'Heute', ['@a', '@b', '@c']).items.map((i) => i.organizer)
    ).toEqual(['', '', '']);
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
    const h = makeHarness();
    const outcome = await runDailyStory(h.deps, 'Feldkirch');
    expect(outcome).toEqual({
      status: 'done',
      day: DAY,
      results: [{ id: 'story_feldkirch_2026-10-17', outcome: 'published' }],
    });
    expect(h.bodies[0].get('media_type')).toBe('STORIES');
    expect(h.bodies[0].get('image_url')).toBe('https://img/story_feldkirch_2026-10-17.jpg');
    expect(h.bodies[1].get('creation_id')).toBe('container1');
    expect(h.posts.get('story_feldkirch_2026-10-17')).toMatchObject({
      type: 'story',
      status: 'published',
      igMediaId: 'media1',
      permalink: 'https://instagram.com/stories/x/1/',
      eventIds: ['e1'],
    });
    expect(h.deps.listEvents).toHaveBeenCalledWith({ start: DAY, end: DAY });
  });

  it('uses the Vienna day, not UTC (00:30 Vienna is still the day before in UTC)', async () => {
    const h = makeHarness({ events: [ev({ date: '2026-10-18' })] });
    vi.setSystemTime(new Date('2026-10-17T22:30:00Z'));
    const outcome = await runDailyStory(h.deps, 'Feldkirch');
    expect(outcome).toMatchObject({ day: '2026-10-18' });
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
      day: DAY,
      results: [],
    });
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('does not post twice for the same Bezirk and day', async () => {
    const h = makeHarness({ existing: ['story_feldkirch_2026-10-17'] });
    const outcome = await runDailyStory(h.deps, 'Feldkirch');
    expect(outcome).toMatchObject({
      results: [{ id: 'story_feldkirch_2026-10-17', outcome: 'duplicate' }],
    });
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('records the failure, mails the admins and never leaks the token', async () => {
    const h = makeHarness({
      fetchImpl: () => json({ error: { message: `bad token ${TOKEN}` } }, 400),
    });
    const outcome = await runDailyStory(h.deps, 'Feldkirch');
    expect(outcome).toMatchObject({
      results: [{ id: 'story_feldkirch_2026-10-17', outcome: 'failed' }],
    });
    const record = h.posts.get('story_feldkirch_2026-10-17');
    expect(record?.status).toBe('failed');
    expect(String(record?.error)).not.toContain(TOKEN);
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.notify.mock.calls)).not.toContain(TOKEN);
  });

  it('still counts the story as published when the permalink lookup fails', async () => {
    const h = makeHarness({
      fetchImpl: (url, init) => {
        if (url.includes('/media1?')) return json({ error: { message: 'nope' } }, 500);
        if (url.endsWith('/media') && init?.method === 'POST') return json({ id: 'container1' });
        if (url.includes('?fields=status_code')) return json({ status_code: 'FINISHED' });
        return json({ id: 'media1' });
      },
    });
    const outcome = await runDailyStory(h.deps, 'Feldkirch');
    expect(outcome).toMatchObject({ results: [{ outcome: 'published' }] });
    expect(h.posts.get('story_feldkirch_2026-10-17')).toMatchObject({
      status: 'published',
      permalink: null,
    });
  });
});
