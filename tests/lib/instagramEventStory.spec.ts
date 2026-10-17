import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MAX_PER_RUN,
  MAX_STORIES_PER_DAY,
  eventStoryPostId,
  findDueEvents,
  runEventStories,
  storyDueTimes,
  storyHeadingFor,
  viennaWallNow,
} from '../../functions/src/instagram/instagramEventStory';
import type { CarouselEvent } from '../../functions/src/instagram/instagramCarousel';
import type {
  StoryDeps,
  StoryModel,
  StoryPostRecord,
} from '../../functions/src/instagram/instagramStory';

const TOKEN = 'SECRET_TOKEN_123';
// Vienna is UTC+2 until 2026-10-25, so 08:00Z is 10:00 in Vienna.
const at = (isoUtc: string) => new Date(isoUtc);

function ev(over: Partial<CarouselEvent> = {}): CarouselEvent {
  return {
    id: 'e1',
    status: 'approved',
    instagramConsent: true,
    title: 'Kakao Zeremonie',
    date: '2026-10-18',
    time: '12:00',
    place: 'Studio Eins',
    bezirk: 'Bregenz',
    ...over,
  };
}

describe('storyDueTimes', () => {
  const minutesBetween = (a: number, b: number) => b - a;

  it('is due two hours before the start', () => {
    const t = storyDueTimes('2026-10-18', '12:00')!;
    expect(minutesBetween(t.due, t.start)).toBe(120);
  });

  it('posts events that start before 10:00 the evening before at 18:00', () => {
    const t = storyDueTimes('2026-10-18', '07:30')!;
    const eveningBefore = storyDueTimes('2026-10-17', '18:00')!.start;
    expect(t.due).toBe(eveningBefore);
  });

  it('keeps the 08:00 boundary on the same day (10:00 start -> 08:00)', () => {
    const t = storyDueTimes('2026-10-18', '10:00')!;
    expect(minutesBetween(t.due, t.start)).toBe(120);
  });

  it('never makes a late event wait past 19:00', () => {
    const t = storyDueTimes('2026-10-18', '22:30')!;
    expect(storyDueTimes('2026-10-18', '19:00')!.start).toBe(t.due);
  });

  it('has no due time without a valid start time or date', () => {
    expect(storyDueTimes('2026-10-18', '')).toBeNull();
    expect(storyDueTimes('2026-10-18', undefined)).toBeNull();
    expect(storyDueTimes('2026-10-18', 'abends')).toBeNull();
    expect(storyDueTimes('', '12:00')).toBeNull();
  });
});

describe('viennaWallNow', () => {
  it('uses the Vienna day and hour, not UTC', () => {
    const w = viennaWallNow(at('2026-10-17T22:30:00Z'));
    expect(w.day).toBe('2026-10-18');
    expect(w.hour).toBe(0);
  });
});

describe('findDueEvents', () => {
  it('is due from two hours before until the start', () => {
    const events = [ev()];
    expect(findDueEvents(events, at('2026-10-18T07:59:00Z'))).toHaveLength(0); // 09:59
    expect(findDueEvents(events, at('2026-10-18T08:00:00Z'))).toHaveLength(1); // 10:00
    expect(findDueEvents(events, at('2026-10-18T09:59:00Z'))).toHaveLength(1); // 11:59
    expect(findDueEvents(events, at('2026-10-18T10:00:00Z'))).toHaveLength(0); // started
  });

  it('posts nothing outside 08:00-20:00 Vienna', () => {
    const late = [ev({ time: '23:00', date: '2026-10-18' })];
    // 20:30 Vienna: the event is "due" (19:00) but the window is closed
    expect(findDueEvents(late, at('2026-10-18T18:30:00Z'))).toHaveLength(0);
    // 19:30 Vienna: open
    expect(findDueEvents(late, at('2026-10-18T17:30:00Z'))).toHaveLength(1);
    // 07:30 Vienna: closed even though a 09:00 event would be due soon
    expect(findDueEvents([ev({ time: '09:30' })], at('2026-10-18T05:30:00Z'))).toHaveLength(0);
  });

  it('announces a morning event the evening before', () => {
    const events = [ev({ time: '07:30' })];
    expect(findDueEvents(events, at('2026-10-17T15:59:00Z'))).toHaveLength(0); // 17:59
    expect(findDueEvents(events, at('2026-10-17T16:00:00Z'))).toHaveLength(1); // 18:00
  });

  it('skips events that are not eligible or have no start time', () => {
    const now = at('2026-10-18T08:30:00Z');
    expect(findDueEvents([ev({ instagramConsent: false })], now)).toHaveLength(0);
    expect(findDueEvents([ev({ status: 'pending' })], now)).toHaveLength(0);
    expect(findDueEvents([ev({ isOnline: true })], now)).toHaveLength(0);
    expect(findDueEvents([ev({ time: undefined })], now)).toHaveLength(0);
    expect(findDueEvents([ev({ id: undefined })], now)).toHaveLength(0);
  });

  it('sorts by due time', () => {
    const now = at('2026-10-18T09:30:00Z'); // 11:30
    const due = findDueEvents(
      [ev({ id: 'b', time: '13:00' }), ev({ id: 'a', time: '12:00' })],
      now
    );
    expect(due.map((d) => d.event.id)).toEqual(['a', 'b']);
  });
});

describe('labels', () => {
  it('names the post and the day', () => {
    expect(eventStoryPostId('abc', '2026-10-18')).toBe('story_event_abc_2026-10-18');
    expect(storyHeadingFor('2026-10-18', '2026-10-18')).toBe('Heute');
    expect(storyHeadingFor('2026-10-18', '2026-10-17')).toBe('Morgen');
  });
});

describe('runEventStories', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });
  afterEach(() => vi.useRealTimers());

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
  }

  function makeHarness(
    opts: {
      now?: string;
      enabled?: boolean;
      events?: CarouselEvent[];
      existing?: string[];
      postedToday?: number;
      handle?: string | null;
    } = {}
  ) {
    const now = at(opts.now ?? '2026-10-18T08:30:00Z'); // 10:30 Vienna
    vi.setSystemTime(now);
    const posts = new Map<string, Record<string, unknown>>();
    for (const id of opts.existing ?? []) posts.set(id, {});
    const models: StoryModel[] = [];
    const bodies: URLSearchParams[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body ?? ''));
      if (url.endsWith('/media') && init?.method === 'POST') {
        bodies.push(body);
        return json({ id: 'container1' });
      }
      if (url.includes('?fields=status_code')) return json({ status_code: 'FINISHED' });
      if (url.endsWith('/media_publish')) return json({ id: 'media1' });
      if (url.includes('/media1?')) return json({ permalink: 'https://instagram.com/s/1/' });
      return json({ error: { message: 'unexpected' } }, 500);
    });
    const deps: StoryDeps = {
      fetch: fetchMock as unknown as typeof fetch,
      accessToken: TOKEN,
      userId: 'IGUSER',
      isEnabled: async () => opts.enabled ?? true,
      listEvents: vi.fn(async () => opts.events ?? [ev()]),
      countStoriesPostedOn: async () => opts.postedToday ?? 0,
      getOrganizerHandle: async () => (opts.handle === undefined ? '@maitri.roots' : opts.handle),
      async createPost(id, record: StoryPostRecord) {
        if (posts.has(id)) return false;
        posts.set(id, { ...record });
        return true;
      },
      async updatePost(id, patch) {
        posts.set(id, { ...posts.get(id), ...patch });
      },
      async generateStoryImage(name, model) {
        models.push(model);
        return `https://img/${name}.jpg`;
      },
      notifyAdmins: vi.fn(async () => undefined),
    };
    return { deps, posts, models, bodies, fetchMock };
  }

  it('posts a due event with heading, organizer tag and a record for the cap', async () => {
    const h = makeHarness();
    const outcome = await runEventStories(h.deps);
    expect(outcome).toEqual({
      status: 'done',
      results: [{ id: 'story_event_e1_2026-10-18', outcome: 'published' }],
    });
    expect(h.models[0]).toMatchObject({ heading: 'Heute', bezirk: 'in Bregenz' });
    expect(h.models[0].items).toHaveLength(1);
    expect(h.bodies[0].get('media_type')).toBe('STORIES');
    expect(JSON.parse(h.bodies[0].get('user_tags')!)[0]).toMatchObject({
      username: 'maitri.roots',
    });
    expect(h.posts.get('story_event_e1_2026-10-18')).toMatchObject({
      type: 'story',
      kind: 'event',
      day: '2026-10-18',
      postedDay: '2026-10-18',
      status: 'published',
      taggedHandles: ['maitri.roots'],
    });
  });

  it('calls tomorrow\'s early event "Morgen" when posting the evening before', async () => {
    const h = makeHarness({
      now: '2026-10-17T16:05:00Z', // 18:05 Vienna
      events: [ev({ time: '07:30' })],
    });
    await runEventStories(h.deps);
    expect(h.models[0]).toMatchObject({ heading: 'Morgen', dateLabel: 'So, 18. Okt' });
    expect(h.posts.get('story_event_e1_2026-10-18')).toMatchObject({
      day: '2026-10-18',
      postedDay: '2026-10-17',
    });
  });

  it('posts without a tag when the organizer has no handle', async () => {
    const h = makeHarness({ handle: null });
    await runEventStories(h.deps);
    expect(h.bodies[0].get('user_tags')).toBeNull();
  });

  it('does not post the same event twice', async () => {
    const h = makeHarness({ existing: ['story_event_e1_2026-10-18'] });
    expect(await runEventStories(h.deps)).toEqual({ status: 'done', results: [] });
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('posts at most MAX_PER_RUN stories per run, the rest on the next run', async () => {
    const many = Array.from({ length: MAX_PER_RUN + 2 }, (_, i) =>
      ev({ id: `e${i}`, time: '12:00' })
    );
    const h = makeHarness({ events: many });
    const first = await runEventStories(h.deps);
    expect(first).toMatchObject({ status: 'done' });
    expect((first as { results: unknown[] }).results).toHaveLength(MAX_PER_RUN);
    const second = await runEventStories(h.deps);
    expect((second as { results: unknown[] }).results).toHaveLength(MAX_PER_RUN);
    expect(h.posts.size).toBe(MAX_PER_RUN * 2);
  });

  it('stops at the daily cap', async () => {
    const h = makeHarness({ postedToday: MAX_STORIES_PER_DAY });
    expect(await runEventStories(h.deps)).toEqual({ status: 'daily-cap' });
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when disabled or outside the posting hours', async () => {
    const off = makeHarness({ enabled: false });
    expect(await runEventStories(off.deps)).toEqual({ status: 'disabled' });
    const night = makeHarness({ now: '2026-10-18T19:00:00Z' }); // 21:00 Vienna
    expect(await runEventStories(night.deps)).toEqual({ status: 'outside-hours' });
    expect(night.deps.listEvents).not.toHaveBeenCalled();
  });

  it('does not post an event that already started', async () => {
    const h = makeHarness({ now: '2026-10-18T10:30:00Z' }); // 12:30, event at 12:00
    expect(await runEventStories(h.deps)).toEqual({ status: 'done', results: [] });
  });
});
