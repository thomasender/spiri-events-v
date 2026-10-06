import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  publishApprovedEvent,
  isApprovalTransition,
  isEventPast,
  POLL_TIMEOUT_MS,
  type PublishDeps,
  type PostRecord,
} from '../../functions/src/instagram/instagramPublish';

const TOKEN = 'SECRET_TOKEN_123';
const NOW = new Date('2026-10-06T10:00:00Z');

const futureEvent = {
  status: 'approved',
  title: 'Kakao Zeremonie',
  date: '2026-10-20',
  time: '18:00',
  place: 'Dornbirn',
  slug: 'kakao-zeremonie',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

interface Harness {
  deps: PublishDeps;
  fetchMock: ReturnType<typeof vi.fn>;
  posts: Map<string, Record<string, unknown>>;
  notify: ReturnType<typeof vi.fn>;
  generateImage: ReturnType<typeof vi.fn>;
}

function makeHarness(
  opts: {
    enabled?: boolean;
    fetchImpl?: (url: string, init?: RequestInit) => Response | Promise<Response>;
  } = {}
): Harness {
  const posts = new Map<string, Record<string, unknown>>();
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (opts.fetchImpl) return opts.fetchImpl(url, init);
    if (url.endsWith('/media') && init?.method === 'POST') return json({ id: 'container1' });
    if (url.includes('/container1?')) return json({ status_code: 'FINISHED' });
    if (url.endsWith('/media_publish')) return json({ id: 'media1' });
    if (url.includes('/media1?')) return json({ permalink: 'https://instagram.com/p/abc/' });
    return json({ error: { message: 'unexpected' } }, 500);
  });
  const notify = vi.fn(async () => undefined);
  const generateImage = vi.fn(
    async () => 'https://storage.example/o/instagram%2Ffeed_e1.jpg?alt=media&token=t'
  );
  const deps: PublishDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    accessToken: TOKEN,
    userId: '1789',
    isEnabled: async () => opts.enabled ?? true,
    createPost: async (id, record: PostRecord) => {
      if (posts.has(id)) return false;
      posts.set(id, { ...record });
      return true;
    },
    updatePost: async (id, patch) => {
      posts.set(id, { ...posts.get(id), ...patch });
    },
    generateImage,
    notifyAdmins: notify,
    now: () => new Date(),
  };
  return { deps, fetchMock, posts, notify, generateImage };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('isApprovalTransition', () => {
  it('fires for pending -> approved and for creation as approved', () => {
    expect(isApprovalTransition({ status: 'pending' }, { status: 'approved' })).toBe(true);
    expect(isApprovalTransition(undefined, { status: 'approved' })).toBe(true);
  });
  it('does not fire for edits of approved events, other statuses or deletion', () => {
    expect(isApprovalTransition({ status: 'approved' }, { status: 'approved' })).toBe(false);
    expect(isApprovalTransition({ status: 'approved' }, { status: 'trashed' })).toBe(false);
    expect(isApprovalTransition({ status: 'draft' }, { status: 'pending' })).toBe(false);
    expect(isApprovalTransition({ status: 'approved' }, undefined)).toBe(false);
  });
});

describe('isEventPast (Europe/Vienna)', () => {
  it('treats today as not past, yesterday as past', () => {
    expect(isEventPast({ date: '2026-10-06' }, NOW)).toBe(false);
    expect(isEventPast({ date: '2026-10-05' }, NOW)).toBe(true);
  });
  it('uses the Vienna calendar day, not UTC', () => {
    // 22:30 UTC on Oct 5 is already Oct 6 in Vienna (CEST, UTC+2).
    const lateUtc = new Date('2026-10-05T22:30:00Z');
    expect(isEventPast({ date: '2026-10-05' }, lateUtc)).toBe(true);
  });
  it('uses endDate for multi-day events', () => {
    expect(isEventPast({ date: '2026-10-04', endDate: '2026-10-07' }, NOW)).toBe(false);
  });
});

describe('publishApprovedEvent', () => {
  it('publishes on transition to approved and stores media id and permalink', async () => {
    const h = makeHarness();
    const outcome = await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent);
    expect(outcome).toBe('published');
    expect(h.posts.get('feed_e1')).toMatchObject({
      type: 'feed',
      eventId: 'e1',
      status: 'published',
      attempts: 1,
      igMediaId: 'media1',
      permalink: 'https://instagram.com/p/abc/',
    });
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('sends the container request URL-encoded as a form body', async () => {
    const h = makeHarness();
    await publishApprovedEvent(h.deps, 'e1', undefined, futureEvent);
    const [url, init] = h.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.instagram.com/v23.0/1789/media');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );
    const body = String(init.body);
    expect(body).toContain(
      'image_url=https%3A%2F%2Fstorage.example%2Fo%2Finstagram%252Ffeed_e1.jpg%3Falt%3Dmedia%26token%3Dt'
    );
    expect(body).toContain('caption=');
    const params = new URLSearchParams(body);
    expect(params.get('caption')).toContain('Kakao Zeremonie');
    expect(params.get('access_token')).toBe(TOKEN);
  });

  it('does not post again on edits of an already approved event', async () => {
    const h = makeHarness();
    const outcome = await publishApprovedEvent(
      h.deps,
      'e1',
      { status: 'approved' },
      { ...futureEvent, title: 'Neu' }
    );
    expect(outcome).toBe('ignored');
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.posts.size).toBe(0);
  });

  it('dedupes: an existing instagram_posts doc stops a second post', async () => {
    const h = makeHarness();
    await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent);
    h.fetchMock.mockClear();
    // re-approve after going back to pending
    const outcome = await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent);
    expect(outcome).toBe('duplicate');
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.generateImage).toHaveBeenCalledTimes(1);
  });

  it('skips events whose date is in the past', async () => {
    const h = makeHarness();
    const outcome = await publishApprovedEvent(
      h.deps,
      'e1',
      { status: 'pending' },
      { ...futureEvent, date: '2026-10-01' }
    );
    expect(outcome).toBe('skipped');
    expect(h.posts.get('feed_e1')).toMatchObject({ status: 'skipped' });
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.generateImage).not.toHaveBeenCalled();
  });

  it('kill switch off: does nothing and creates no instagram_posts doc', async () => {
    const h = makeHarness({ enabled: false });
    const outcome = await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent);
    expect(outcome).toBe('disabled');
    expect(h.posts.size).toBe(0);
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('records failure, mails admins and never leaks the token', async () => {
    const h = makeHarness({
      fetchImpl: (url) =>
        url.endsWith('/media')
          ? json({ error: { message: `Invalid token ${TOKEN} access_token=${TOKEN}` } }, 400)
          : json({}),
    });
    const outcome = await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent);
    expect(outcome).toBe('failed');
    const post = h.posts.get('feed_e1') as { status: string; error: string };
    expect(post.status).toBe('failed');
    expect(post.error).toContain('HTTP 400');
    expect(post.error).not.toContain(TOKEN);
    expect(h.notify).toHaveBeenCalledTimes(1);
    const [subject, text] = h.notify.mock.calls[0] as [string, string];
    expect(subject).toContain('Kakao Zeremonie');
    expect(text).not.toContain(TOKEN);
    // no retry
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still records failure when the admin mail itself fails', async () => {
    const h = makeHarness({ fetchImpl: () => json({ error: { message: 'boom' } }, 500) });
    h.notify.mockRejectedValueOnce(new Error('mailgun down'));
    const outcome = await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent);
    expect(outcome).toBe('failed');
    expect(h.posts.get('feed_e1')).toMatchObject({ status: 'failed' });
  });

  it('polls until the container is FINISHED', async () => {
    let polls = 0;
    const h = makeHarness({
      fetchImpl: (url, init) => {
        if (url.endsWith('/media') && init?.method === 'POST') return json({ id: 'container1' });
        if (url.includes('/container1?')) {
          polls += 1;
          return json({ status_code: polls < 3 ? 'IN_PROGRESS' : 'FINISHED' });
        }
        if (url.endsWith('/media_publish')) return json({ id: 'media1' });
        return json({ permalink: 'https://instagram.com/p/abc/' });
      },
    });
    const promise = publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent);
    await vi.advanceTimersByTimeAsync(20000);
    expect(await promise).toBe('published');
    expect(polls).toBe(3);
  });

  it('fails on container ERROR status', async () => {
    const h = makeHarness({
      fetchImpl: (url, init) => {
        if (url.endsWith('/media') && init?.method === 'POST') return json({ id: 'container1' });
        return json({ status_code: 'ERROR', status: 'Error: bad image' });
      },
    });
    const outcome = await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent);
    expect(outcome).toBe('failed');
    expect((h.posts.get('feed_e1') as { error: string }).error).toContain('ERROR');
    expect(h.notify).toHaveBeenCalled();
  });

  it('fails with a timeout when the container never finishes', async () => {
    const h = makeHarness({
      fetchImpl: (url, init) => {
        if (url.endsWith('/media') && init?.method === 'POST') return json({ id: 'container1' });
        return json({ status_code: 'IN_PROGRESS' });
      },
    });
    const promise = publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent);
    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS + 10000);
    expect(await promise).toBe('failed');
    expect((h.posts.get('feed_e1') as { error: string }).error).toContain('not ready');
    expect(h.notify).toHaveBeenCalled();
    // never published
    expect(h.fetchMock.mock.calls.some(([u]) => String(u).endsWith('/media_publish'))).toBe(false);
  });

  it('keeps status published when only the permalink lookup fails', async () => {
    const h = makeHarness({
      fetchImpl: (url, init) => {
        if (url.endsWith('/media') && init?.method === 'POST') return json({ id: 'container1' });
        if (url.includes('/container1?')) return json({ status_code: 'FINISHED' });
        if (url.endsWith('/media_publish')) return json({ id: 'media1' });
        return json({ error: { message: 'nope' } }, 500);
      },
    });
    const outcome = await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent);
    expect(outcome).toBe('published');
    expect(h.posts.get('feed_e1')).toMatchObject({
      status: 'published',
      igMediaId: 'media1',
      permalink: null,
    });
  });
});
