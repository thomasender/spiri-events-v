import { describe, it, expect, vi } from 'vitest';
import {
  AdminActionError,
  archiveInstagramPost,
  assertEventId,
  retryCarouselPost,
  retryInstagramPost,
  skipInstagramPost,
  type CarouselRetryDeps,
  type RetryDeps,
  type SkipDeps,
} from '../../functions/src/instagram/instagramAdminLogic';
import type { PublishDeps } from '../../functions/src/instagram/instagramPublish';

const future = {
  status: 'approved',
  title: 'Kakao',
  date: '2999-01-01',
  slug: 'kakao',
  instagramConsent: true,
};

function retryHarness(
  opts: { status?: string | null; event?: Record<string, unknown> | null } = {}
) {
  const order: string[] = [];
  const created: Array<{ id: string; status: string }> = [];
  const publishDeps = {
    fetch: vi.fn(),
    accessToken: 'tok',
    userId: 'u1',
    isEnabled: vi.fn(async () => true),
    createPost: vi.fn(async (id: string, rec: { status: string }) => {
      order.push('create');
      created.push({ id, status: rec.status });
      return true;
    }),
    updatePost: vi.fn(async () => undefined),
    // Fail fast after create so no real network is involved.
    generateImage: vi.fn(async () => {
      throw new Error('stop');
    }),
    notifyAdmins: vi.fn(async () => undefined),
  } as unknown as PublishDeps;
  const deps: RetryDeps = {
    publishDeps,
    getPostStatus: vi.fn(async () => (opts.status === undefined ? 'failed' : opts.status)),
    deletePost: vi.fn(async () => {
      order.push('delete');
    }),
    getEvent: vi.fn(async () => (opts.event === undefined ? future : opts.event)),
  };
  return { deps, order, created, publishDeps };
}

describe('assertEventId', () => {
  it('rejects empty, non-string and path-like ids', () => {
    for (const bad of [undefined, '', '  ', 5, 'a/b']) {
      expect(() => assertEventId(bad)).toThrow(AdminActionError);
    }
    expect(assertEventId(' abc ')).toBe('abc');
  });
});

describe('retryInstagramPost', () => {
  it('deletes the failed record, then re-runs the publish flow', async () => {
    const h = retryHarness();
    const outcome = await retryInstagramPost(h.deps, 'e1');
    expect(h.deps.deletePost).toHaveBeenCalledWith('feed_e1');
    expect(h.order).toEqual(['delete', 'create']);
    expect(h.created[0]).toEqual({ id: 'feed_e1', status: 'publishing' });
    expect(outcome).toBe('failed'); // generateImage stub throws
  });

  it.each(['published', 'publishing'])('refuses to retry a post with status %s', async (status) => {
    const h = retryHarness({ status });
    await expect(retryInstagramPost(h.deps, 'e1')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(h.deps.deletePost).not.toHaveBeenCalled();
  });

  it('re-posts a skipped record: deletes it first, then publishes', async () => {
    const h = retryHarness({ status: 'skipped' });
    const outcome = await retryInstagramPost(h.deps, 'e1');
    expect(h.deps.deletePost).toHaveBeenCalledWith('feed_e1');
    expect(h.order).toEqual(['delete', 'create']);
    expect(outcome).toBe('failed'); // generateImage stub throws
  });

  it('posts an approved event that has no record yet, without deleting anything', async () => {
    const h = retryHarness({ status: null });
    const outcome = await retryInstagramPost(h.deps, 'e1');
    expect(h.deps.deletePost).not.toHaveBeenCalled();
    expect(h.order).toEqual(['create']);
    expect(outcome).toBe('failed'); // generateImage stub throws
  });

  it('does not bypass the past-event rule', async () => {
    const h = retryHarness({ event: { ...future, date: '2020-01-01' } });
    expect(await retryInstagramPost(h.deps, 'e1')).toBe('skipped');
    expect(h.created[0].status).toBe('skipped');
  });

  it('posts a past event anyway when the admin forces it', async () => {
    const h = retryHarness({ status: 'skipped', event: { ...future, date: '2020-01-01' } });
    const outcome = await retryInstagramPost(h.deps, 'e1', { force: true });
    expect(h.created[0].status).toBe('publishing');
    expect(outcome).toBe('failed'); // generateImage stub throws
  });

  it('rejects missing or unapproved events without deleting', async () => {
    const missing = retryHarness({ event: null });
    await expect(retryInstagramPost(missing.deps, 'e1')).rejects.toMatchObject({
      code: 'not-found',
    });
    const draft = retryHarness({ event: { ...future, status: 'draft' } });
    await expect(retryInstagramPost(draft.deps, 'e1')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(missing.deps.deletePost).not.toHaveBeenCalled();
    expect(draft.deps.deletePost).not.toHaveBeenCalled();
  });
});

describe('skipInstagramPost', () => {
  function skipHarness(status: string | null) {
    const deps: SkipDeps = {
      getPostStatus: vi.fn(async () => status),
      setSkipped: vi.fn(async () => undefined),
      createSkipped: vi.fn(async () => undefined),
    };
    return deps;
  }

  it.each(['failed', 'publishing', 'skipped'])('sets an existing %s post to skipped', async (s) => {
    const deps = skipHarness(s);
    expect(await skipInstagramPost(deps, 'e1')).toBe('skipped');
    expect(deps.setSkipped).toHaveBeenCalledWith('feed_e1', 'admin');
    expect(deps.createSkipped).not.toHaveBeenCalled();
  });

  it('creates the doc as skipped when none exists so the post stays blocked', async () => {
    const deps = skipHarness(null);
    await skipInstagramPost(deps, 'e1');
    expect(deps.createSkipped).toHaveBeenCalledWith(
      'feed_e1',
      expect.objectContaining({
        type: 'feed',
        eventId: 'e1',
        status: 'skipped',
        attempts: 0,
        skipReason: 'admin',
      })
    );
    expect(deps.setSkipped).not.toHaveBeenCalled();
  });

  it('refuses to touch an already published post', async () => {
    const deps = skipHarness('published');
    await expect(skipInstagramPost(deps, 'e1')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});

describe('archiveInstagramPost', () => {
  function archiveHarness(status: string | null) {
    return {
      getPostStatus: vi.fn(async () => status),
      setArchived: vi.fn(async () => undefined),
    };
  }

  it('archives a skipped post', async () => {
    const deps = archiveHarness('skipped');
    expect(await archiveInstagramPost(deps, 'e1')).toBe('archived');
    expect(deps.setArchived).toHaveBeenCalledWith('feed_e1');
  });

  it('is a no-op for an already archived post', async () => {
    const deps = archiveHarness('archived');
    expect(await archiveInstagramPost(deps, 'e1')).toBe('archived');
    expect(deps.setArchived).not.toHaveBeenCalled();
  });

  it.each(['published', 'publishing', 'failed', null])('refuses a %s post', async (s) => {
    const deps = archiveHarness(s);
    await expect(archiveInstagramPost(deps, 'e1')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(deps.setArchived).not.toHaveBeenCalled();
  });
});

describe('carousel records (no eventId, the list sends their own id)', () => {
  const ID = 'carousel_bregenz_2026-11-02';
  const carouselEvent = {
    id: 'c1',
    status: 'approved',
    instagramConsent: true,
    title: 'Kakao Zeremonie',
    date: '2026-11-02',
    time: '18:00',
    place: 'Studio Eins',
    bezirk: 'Bregenz',
  };

  function carouselHarness(
    opts: { record?: Record<string, unknown> | null; stray?: boolean; publishFails?: boolean } = {}
  ) {
    const posts = new Map<string, Record<string, unknown>>();
    if (opts.record !== null) {
      posts.set(ID, {
        type: 'carousel',
        bezirk: 'Bregenz',
        weekStart: '2026-11-02',
        part: 1,
        status: 'failed',
        attempts: 1,
        ...opts.record,
      });
    }
    if (opts.stray) posts.set(`feed_${ID}`, { type: 'feed', eventId: ID, status: 'skipped' });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (opts.publishFails) return json({ error: { message: 'boom' } }, 400);
      const body = new URLSearchParams(String(init?.body ?? ''));
      if (url.endsWith('/media') && init?.method === 'POST') {
        return json({ id: body.get('media_type') === 'CAROUSEL' ? 'parent1' : 'child1' });
      }
      if (url.includes('fields=status_code')) return json({ status_code: 'FINISHED' });
      if (url.endsWith('/media_publish')) return json({ id: 'media1' });
      return json({ permalink: 'https://instagram.com/p/abc/' });
    });
    const deps: CarouselRetryDeps = {
      fetch: fetchMock as unknown as typeof fetch,
      accessToken: 'tok',
      userId: 'IGUSER',
      isEnabled: async () => false, // manual retries ignore the kill switch
      listEvents: vi.fn(async () => [carouselEvent]),
      createPost: vi.fn(async () => true),
      async updatePost(id, patch) {
        posts.set(id, { ...posts.get(id), ...patch });
      },
      generateCoverImage: async (name) => `https://img/${name}.jpg`,
      generateEventImage: async (name) => `https://img/${name}.jpg`,
      notifyAdmins: vi.fn(async () => undefined),
      getPostStatus: async (id) => (posts.get(id)?.status as string | undefined) ?? null,
      getPost: async (id) => posts.get(id) ?? null,
      deletePost: vi.fn(async (id: string) => {
        posts.delete(id);
      }),
    };
    return { deps, posts, fetchMock };
  }

  it('re-posts a failed carousel of the current week and removes the stray feed record', async () => {
    const h = carouselHarness({ stray: true });
    expect(await retryCarouselPost(h.deps, ID)).toBe('published');
    expect(h.posts.get(ID)).toMatchObject({
      status: 'published',
      attempts: 2,
      error: null,
      eventIds: ['c1'],
      permalink: 'https://instagram.com/p/abc/',
    });
    expect(h.posts.has(`feed_${ID}`)).toBe(false);
  });

  it('records the Instagram error when the retry fails again', async () => {
    const h = carouselHarness({ record: { status: 'skipped' }, publishFails: true });
    expect(await retryCarouselPost(h.deps, ID)).toBe('failed');
    expect(h.posts.get(ID)).toMatchObject({ status: 'failed' });
    expect(h.posts.get(ID)?.error).toEqual(expect.any(String));
  });

  it('refuses published carousels and ones without events', async () => {
    await expect(
      retryCarouselPost(carouselHarness({ record: { status: 'published' } }).deps, ID)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    const empty = carouselHarness();
    empty.deps.listEvents = async () => [];
    await expect(retryCarouselPost(empty.deps, ID)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    await expect(
      retryCarouselPost(carouselHarness({ record: null }).deps, ID)
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('skip and archive act on the carousel record itself, never on a feed_ record', async () => {
    const statuses = new Map<string, string>([
      [ID, 'failed'],
      [`feed_${ID}`, 'skipped'],
    ]);
    const skipDeps: SkipDeps = {
      getPostStatus: async (id) => statuses.get(id) ?? null,
      deletePost: vi.fn(async (id: string) => {
        statuses.delete(id);
      }),
      setSkipped: vi.fn(async (id: string) => {
        statuses.set(id, 'skipped');
      }),
      createSkipped: vi.fn(async () => undefined),
    };
    await skipInstagramPost(skipDeps, ID);
    expect(skipDeps.setSkipped).toHaveBeenCalledWith(ID, 'admin');
    expect(skipDeps.createSkipped).not.toHaveBeenCalled();
    expect(statuses.has(`feed_${ID}`)).toBe(false);

    const setArchived = vi.fn(async () => undefined);
    await archiveInstagramPost(
      { getPostStatus: async (id) => statuses.get(id) ?? null, setArchived },
      ID
    );
    expect(setArchived).toHaveBeenCalledWith(ID);
  });

  it('routes a story id to its own record and refuses to re-post it', async () => {
    const h = retryHarness();
    await expect(retryInstagramPost(h.deps, 'story_bregenz_2026-11-03')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(h.deps.deletePost).not.toHaveBeenCalled();
  });
});
