import { describe, it, expect, vi } from 'vitest';
import {
  buildUpdateComment,
  canResolveOutdatedPost,
  captionFieldsChanged,
  commentWorthyChange,
  handleEventUpdate,
  type FeedPostState,
  type PostUpdateDeps,
} from '../../functions/src/instagram/instagramPostUpdate';

const NOW = new Date('2026-11-25T10:00:00Z');

const approved = {
  status: 'approved',
  title: 'Kakao Zeremonie',
  description: '<p>Herzöffnend</p>',
  date: '2026-12-12',
  time: '18:00',
  place: 'Kulturhaus',
  city: 'Dornbirn',
  bezirk: 'Dornbirn',
  category: 'Meditation',
  slug: 'kakao-zeremonie',
  instagramConsent: true,
  favoriteCount: 3,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function makeHarness(
  opts: {
    post?: FeedPostState | null;
    enabled?: boolean;
    credentials?: { accessToken: string; userId: string } | null;
    commentStatus?: number;
  } = {}
) {
  const post: FeedPostState | null =
    opts.post === undefined ? { status: 'published', igMediaId: 'media1' } : opts.post;
  const store = { post: post ? { ...post } : null } as { post: Record<string, unknown> | null };
  const fetchMock = vi.fn(async () =>
    opts.commentStatus && opts.commentStatus >= 400
      ? json({ error: { message: 'nope' } }, opts.commentStatus)
      : json({ id: 'c1' })
  );
  const getPost = vi.fn(async () => (store.post ? { ...store.post } : null));
  const updatePost = vi.fn(async (_id: string, patch: Record<string, unknown>) => {
    store.post = { ...(store.post ?? {}), ...patch };
  });
  const claimCommentKey = vi.fn(async (_id: string, key: string) => {
    if (store.post?.lastUpdateCommentKey === key) return false;
    store.post = { ...(store.post ?? {}), lastUpdateCommentKey: key };
    return true;
  });
  const resolveCredentials = vi.fn(async () =>
    opts.credentials === undefined ? { accessToken: 'TOKEN', userId: 'ig1' } : opts.credentials
  );
  const deps: PostUpdateDeps = {
    getPost,
    updatePost,
    claimCommentKey,
    isEnabled: async () => opts.enabled ?? true,
    resolveCredentials,
    getTagHandles: async () => ['@organizer'],
    fetch: fetchMock as unknown as typeof fetch,
    now: () => NOW,
  };
  return { deps, store, fetchMock, getPost, updatePost, claimCommentKey, resolveCredentials };
}

function commentCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/media1/comments'));
}

describe('captionFieldsChanged', () => {
  it('lists only the fields that go into the caption', () => {
    expect(captionFieldsChanged(approved, { ...approved, favoriteCount: 9 })).toEqual([]);
    expect(
      captionFieldsChanged(approved, { ...approved, title: 'Neu', description: 'x', fee: 20 })
    ).toEqual(['title', 'description', 'fee']);
    expect(
      captionFieldsChanged(approved, { ...approved, instagramExtraHandles: ['@freundin'] })
    ).toEqual(['instagramExtraHandles']);
  });

  it('treats missing, null, empty string and empty list as equal', () => {
    expect(
      captionFieldsChanged(
        { ...approved, feeNote: undefined, customDates: undefined },
        { ...approved, feeNote: '', customDates: [], endTime: null }
      )
    ).toEqual([]);
  });
});

describe('commentWorthyChange', () => {
  it('is null for title, description or price changes', () => {
    expect(commentWorthyChange(approved, { ...approved, title: 'Neu', fee: 30 })).toBeNull();
  });

  it('flags date, time, place and cancellations', () => {
    expect(commentWorthyChange(approved, { ...approved, date: '2026-12-13' })).toMatchObject({
      date: true,
      time: false,
      place: false,
    });
    expect(commentWorthyChange(approved, { ...approved, time: '19:00' })?.time).toBe(true);
    expect(commentWorthyChange(approved, { ...approved, place: 'Spielboden' })?.place).toBe(true);
    expect(commentWorthyChange(approved, { ...approved, cancelled: true })?.cancelled).toBe(true);
    expect(
      commentWorthyChange(
        { ...approved, cancelledDates: ['2026-12-19'] },
        { ...approved, cancelledDates: ['2026-12-26', '2026-12-19'] }
      )?.cancelledDates
    ).toEqual(['2026-12-26']);
  });
});

describe('buildUpdateComment', () => {
  it('announces a new date with time and the event link', () => {
    const after = { ...approved, date: '2026-12-13', time: '19:00' };
    const text = buildUpdateComment(commentWorthyChange(approved, after), after);
    expect(text).toBe(
      'Update: Neuer Termin: So, 13. Dez · 19:00 Uhr\n\nAlle Details: https://www.deintribe.at/event/kakao-zeremonie'
    );
  });

  it('announces a new place and a new time', () => {
    const after = { ...approved, time: '19:30', place: 'Spielboden' };
    expect(buildUpdateComment(commentWorthyChange(approved, after), after)).toContain(
      'Update: Neue Uhrzeit: 19:30 Uhr\nNeuer Ort: Spielboden, Dornbirn'
    );
  });

  it('says "abgesagt" for a cancelled event', () => {
    const after = { ...approved, cancelled: true };
    expect(buildUpdateComment(commentWorthyChange(approved, after), after)).toMatch(
      /^Update: Dieses Event ist leider abgesagt\./
    );
  });

  it('names a called-off single date of a series', () => {
    const series = { ...approved, recurrence: 'weekly' };
    const after = { ...series, cancelledDates: ['2026-12-19'] };
    expect(buildUpdateComment(commentWorthyChange(series, after), after)).toContain(
      'Der Termin am Sa, 19. Dez fällt leider aus.'
    );
  });

  it('is null without a comment-worthy change', () => {
    expect(buildUpdateComment(null, approved)).toBeNull();
  });
});

describe('handleEventUpdate', () => {
  it('ignores updates without caption changes without reading the post', async () => {
    const h = makeHarness();
    expect(await handleEventUpdate(h.deps, 'e1', approved, { ...approved, favoriteCount: 4 })).toBe(
      'ignored'
    );
    expect(h.getPost).not.toHaveBeenCalled();
  });

  it('does nothing when the post is not published', async () => {
    for (const post of [null, { status: 'failed' }, { status: 'publishing' }]) {
      const h = makeHarness({ post });
      expect(await handleEventUpdate(h.deps, 'e1', approved, { ...approved, title: 'Neu' })).toBe(
        'no-post'
      );
      expect(h.updatePost).not.toHaveBeenCalled();
      expect(h.fetchMock).not.toHaveBeenCalled();
    }
  });

  it('marks the post outdated with fields, region and new caption, but no comment for a title change', async () => {
    const h = makeHarness();
    const outcome = await handleEventUpdate(h.deps, 'e1', approved, {
      ...approved,
      title: 'Kakao Zeremonie am Feuer',
    });
    expect(outcome).toBe('outdated');
    expect(h.store.post).toMatchObject({
      outdated: true,
      outdatedFields: ['title'],
      regionId: 'vorarlberg',
      eventTitle: 'Kakao Zeremonie am Feuer',
      outdatedAt: NOW,
    });
    expect(h.store.post?.suggestedCaption).toContain('Kakao Zeremonie am Feuer');
    expect(h.store.post?.suggestedCaption).toContain('Mit @organizer');
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the region of the post doc and falls back to the event region', async () => {
    const withRegion = makeHarness({
      post: { status: 'published', igMediaId: 'media1', regionId: 'bodensee' },
    });
    await handleEventUpdate(withRegion.deps, 'e1', approved, { ...approved, title: 'x' });
    expect(withRegion.store.post?.regionId).toBe('bodensee');
    const fromEvent = makeHarness();
    const tirol = { ...approved, regionId: 'tirol' };
    await handleEventUpdate(fromEvent.deps, 'e1', tirol, { ...tirol, title: 'x' });
    expect(fromEvent.store.post?.regionId).toBe('tirol');
  });

  it('comments once with the account of the region when the date changes', async () => {
    const h = makeHarness();
    const after = { ...approved, date: '2026-12-13' };
    expect(await handleEventUpdate(h.deps, 'e1', approved, after)).toBe('commented');
    expect(h.resolveCredentials).toHaveBeenCalledWith('vorarlberg');
    const calls = commentCalls(h.fetchMock);
    expect(calls).toHaveLength(1);
    const body = new URLSearchParams(String((calls[0][1] as RequestInit).body));
    expect(body.get('message')).toMatch(/^Update: Neuer Termin: So, 13\. Dez · 18:00 Uhr/);
    expect(body.get('access_token')).toBe('TOKEN');

    // The same state again (retried delivery, or a later description edit): no second comment.
    expect(await handleEventUpdate(h.deps, 'e1', approved, after)).toBe('comment-skipped');
    expect(await handleEventUpdate(h.deps, 'e1', after, { ...after, description: 'Neu' })).toBe(
      'outdated'
    );
    expect(commentCalls(h.fetchMock)).toHaveLength(1);
  });

  it('writes no comment while Instagram is switched off or the region has no account', async () => {
    const after = { ...approved, cancelled: true };
    const off = makeHarness({ enabled: false });
    expect(await handleEventUpdate(off.deps, 'e1', approved, after)).toBe('comment-skipped');
    expect(off.store.post?.outdated).toBe(true);
    const noAccount = makeHarness({ credentials: null });
    expect(await handleEventUpdate(noAccount.deps, 'e1', approved, after)).toBe('comment-skipped');
    expect(off.fetchMock).not.toHaveBeenCalled();
    expect(noAccount.fetchMock).not.toHaveBeenCalled();
  });

  it('a failing comment keeps the outdated mark and is not retried for the same state', async () => {
    const h = makeHarness({ commentStatus: 400 });
    const after = { ...approved, place: 'Spielboden' };
    expect(await handleEventUpdate(h.deps, 'e1', approved, after)).toBe('comment-failed');
    expect(h.store.post?.outdated).toBe(true);
    expect(await handleEventUpdate(h.deps, 'e1', approved, after)).toBe('comment-skipped');
    expect(commentCalls(h.fetchMock)).toHaveLength(1);
  });

  it('compares edits made in review only when the event is approved again', async () => {
    const h = makeHarness();
    const pending = { ...approved, status: 'pending' };
    expect(await handleEventUpdate(h.deps, 'e1', approved, pending)).toBe('baseline');
    expect(h.store.post?.outdated).toBeUndefined();
    const edited = { ...pending, date: '2026-12-14', title: 'Neu' };
    expect(await handleEventUpdate(h.deps, 'e1', pending, edited)).toBe('ignored');
    expect(h.store.post?.outdated).toBeUndefined();

    const reapproved = { ...edited, status: 'approved' };
    expect(await handleEventUpdate(h.deps, 'e1', edited, reapproved)).toBe('commented');
    expect(h.store.post).toMatchObject({ outdated: true, outdatedFields: ['title', 'date'] });
    expect(commentCalls(h.fetchMock)).toHaveLength(1);
  });

  it('clears the mark when the event is edited back to what the post shows', async () => {
    const h = makeHarness();
    const changed = { ...approved, title: 'Neu' };
    await handleEventUpdate(h.deps, 'e1', approved, changed);
    expect(h.store.post?.outdated).toBe(true);
    expect(await handleEventUpdate(h.deps, 'e1', changed, approved)).toBe('cleared');
    expect(h.store.post).toMatchObject({ outdated: false, outdatedFields: null });
  });

  it('collects every changed field until the post is marked as updated', async () => {
    const h = makeHarness();
    const first = { ...approved, title: 'Neu' };
    await handleEventUpdate(h.deps, 'e1', approved, first);
    await handleEventUpdate(h.deps, 'e1', first, { ...first, fee: 25 });
    expect(h.store.post?.outdatedFields).toEqual(['title', 'fee']);
  });
});

describe('canResolveOutdatedPost', () => {
  it('allows Super-Admins and moderators of the post region only', () => {
    expect(canResolveOutdatedPost({ kind: 'superAdmin' }, undefined)).toBe(true);
    const mod = { kind: 'regionModerator' as const, regionIds: ['tirol'] };
    expect(canResolveOutdatedPost(mod, 'tirol')).toBe(true);
    expect(canResolveOutdatedPost(mod, 'vorarlberg')).toBe(false);
    expect(canResolveOutdatedPost(mod, undefined)).toBe(false);
    expect(canResolveOutdatedPost(null, 'tirol')).toBe(false);
  });
});
