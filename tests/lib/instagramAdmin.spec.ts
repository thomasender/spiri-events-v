import { describe, it, expect, vi } from 'vitest';
import {
  AdminActionError,
  archiveInstagramPost,
  assertEventId,
  retryInstagramPost,
  skipInstagramPost,
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
