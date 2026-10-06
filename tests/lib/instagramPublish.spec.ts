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
  instagramConsent: true,
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
    handle?: string | null | Error;
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
    getOrganizerHandle: async () => {
      if (opts.handle instanceof Error) throw opts.handle;
      return opts.handle ?? null;
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

  describe('Instagram consent gate', () => {
    const { instagramConsent: _ignored, ...withoutConsent } = futureEvent;
    void _ignored;

    it.each([
      ['false', { ...futureEvent, instagramConsent: false }],
      ['absent', withoutConsent],
      ['non-boolean', { ...futureEvent, instagramConsent: 'true' }],
    ])('does not post and writes no dedupe doc when consent is %s', async (_label, ev) => {
      const h = makeHarness();
      const outcome = await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, ev);
      expect(outcome).toBe('no-consent');
      expect(h.posts.size).toBe(0);
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect(h.generateImage).not.toHaveBeenCalled();
    });

    it('still posts on a later re-approval once consent was given', async () => {
      const h = makeHarness();
      expect(await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, withoutConsent)).toBe(
        'no-consent'
      );
      expect(await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent)).toBe(
        'published'
      );
    });

    it('keeps the disabled outcome when the kill switch is off', async () => {
      const h = makeHarness({ enabled: false });
      expect(await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent)).toBe(
        'disabled'
      );
    });
  });

  describe('organizer tag', () => {
    const captionOf = (h: Harness) =>
      new URLSearchParams(String((h.fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).get(
        'caption'
      ) ?? '';

    it('adds the organizer handle to the caption', async () => {
      const h = makeHarness({ handle: '@kakao.maria' });
      await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent);
      expect(captionOf(h)).toContain('@kakao.maria');
    });

    it('posts without a tag when the organizer has no handle', async () => {
      const h = makeHarness({ handle: null });
      expect(await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent)).toBe(
        'published'
      );
      expect(captionOf(h)).not.toContain('@');
    });

    it('posts without a tag when the handle lookup throws', async () => {
      const h = makeHarness({ handle: new Error('firestore down') });
      expect(await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent)).toBe(
        'published'
      );
      expect(captionOf(h)).not.toContain('@');
    });
  });
});

describe('collaborator invite and user tag', () => {
  const ERR_110 = {
    error: { message: 'Invalid user id', code: 110, error_subcode: 2207018, error_user_msg: 'bad' },
  };
  const ERR_2207065 = { error: { message: 'user_tags', code: 100, error_subcode: 2207065 } };

  function harnessWithContainerResponses(handle: string | null, responses: Response[]) {
    const queue = [...responses];
    return makeHarness({
      handle,
      fetchImpl: (url, init) => {
        if (url.endsWith('/media') && init?.method === 'POST') {
          return queue.shift() ?? json({ id: 'container1' });
        }
        if (url.includes('/container1?')) return json({ status_code: 'FINISHED' });
        if (url.endsWith('/media_publish')) return json({ id: 'media1' });
        if (url.includes('/media1?')) return json({ permalink: 'https://instagram.com/p/abc/' });
        return json({ error: { message: 'unexpected' } }, 500);
      },
    });
  }

  const containerBodies = (h: Harness) =>
    h.fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith('/media'))
      .map(([, init]) => new URLSearchParams(String((init as RequestInit).body)));

  it('sends collaborators and user_tags without "@" when a handle exists', async () => {
    const h = harnessWithContainerResponses('@kakao.maria', []);
    expect(await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent)).toBe(
      'published'
    );
    const [body] = containerBodies(h);
    expect(body.get('collaborators')).toBe('["kakao.maria"]');
    expect(JSON.parse(body.get('user_tags') as string)).toEqual([
      { username: 'kakao.maria', x: 0.2, y: 0.93 },
    ]);
    expect(body.get('caption')).toContain('Mit @kakao.maria');
    expect(h.posts.get('feed_e1')).toMatchObject({
      collaboratorInvited: true,
      inviteFallbackReason: null,
    });
  });

  it('sends neither param without a handle', async () => {
    const h = harnessWithContainerResponses(null, []);
    await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent);
    const [body] = containerBodies(h);
    expect(body.has('collaborators')).toBe(false);
    expect(body.has('user_tags')).toBe(false);
    expect(h.posts.get('feed_e1')).toMatchObject({
      collaboratorInvited: false,
      inviteFallbackReason: null,
    });
  });

  it.each([
    ['110/2207018', ERR_110],
    ['100/2207065', ERR_2207065],
  ])('retries once without invite params on %s and still publishes', async (code, err) => {
    const h = harnessWithContainerResponses('@kakao.maria', [json(err, 400)]);
    expect(await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent)).toBe(
      'published'
    );
    const bodies = containerBodies(h);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].has('collaborators')).toBe(true);
    expect(bodies[1].has('collaborators')).toBe(false);
    expect(bodies[1].has('user_tags')).toBe(false);
    expect(bodies[1].get('caption')).toContain('Mit @kakao.maria');
    const post = h.posts.get('feed_e1');
    expect(post).toMatchObject({ status: 'published', collaboratorInvited: false });
    expect(String(post?.inviteFallbackReason)).toContain(code);
  });

  it('does not retry on other errors and records the failure', async () => {
    const h = harnessWithContainerResponses('@kakao.maria', [
      json({ error: { message: 'boom', code: 1, error_subcode: 99 } }, 500),
    ]);
    expect(await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent)).toBe(
      'failed'
    );
    expect(containerBodies(h)).toHaveLength(1);
    expect(h.posts.get('feed_e1')).toMatchObject({ status: 'failed' });
  });

  it('retries only once: a second invite error fails the post', async () => {
    const h = harnessWithContainerResponses('@kakao.maria', [
      json(ERR_110, 400),
      json(ERR_110, 400),
    ]);
    expect(await publishApprovedEvent(h.deps, 'e1', { status: 'pending' }, futureEvent)).toBe(
      'failed'
    );
    expect(containerBodies(h)).toHaveLength(2);
  });
});
