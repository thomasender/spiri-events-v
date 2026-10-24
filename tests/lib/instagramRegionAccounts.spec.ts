import { describe, it, expect, vi } from 'vitest';
import {
  backfillRegion,
  becameEnabled,
  isValidRegionId,
  parseRegionAccount,
  refreshRegionAccounts,
  regionIdFromAccountDocId,
  resolveRegionCredentials,
  type BackfillCandidate,
  type BackfillDeps,
  type RegionAccount,
  type RegionRefreshDeps,
} from '../../functions/src/instagram/instagramRegionAccounts';
import { publishApprovedEvent } from '../../functions/src/instagram/instagramPublish';
import type { PublishDeps, PostRecord } from '../../functions/src/instagram/instagramPublish';
import { carouselPostId } from '../../functions/src/instagram/instagramCarousel';
import { storyPostId } from '../../functions/src/instagram/instagramStory';
import { isInstagramRegion } from '../../functions/src/regions';

const NOW = new Date('2026-10-24T10:00:00Z');
const DAY = 86_400_000;
const ts = (d: Date) => ({ toDate: () => d });

function account(over: Partial<RegionAccount> = {}): RegionAccount {
  return {
    regionId: 'tirol',
    userId: 'IG_TIROL',
    accessToken: 'TOKEN_TIROL',
    expiresAt: new Date(NOW.getTime() + 50 * DAY),
    refreshedAt: new Date(NOW.getTime() - 10 * DAY),
    enabled: true,
    ...over,
  };
}

describe('region account docs', () => {
  it('parses a complete doc and rejects incomplete ones', () => {
    const parsed = parseRegionAccount('tirol', {
      userId: ' 123 ',
      accessToken: 'tok',
      expiresAt: ts(NOW),
      enabled: true,
    });
    expect(parsed).toMatchObject({ regionId: 'tirol', userId: '123', enabled: true });
    expect(parseRegionAccount('tirol', { userId: '1' })).toBeNull();
    expect(parseRegionAccount('tirol', { accessToken: 'x' })).toBeNull();
    expect(parseRegionAccount('tirol', undefined)).toBeNull();
    expect(parseRegionAccount('tirol', { userId: '1', accessToken: 'x' })?.enabled).toBe(false);
  });

  it('only accepts safe region ids and region_ doc ids', () => {
    expect(isValidRegionId('tirol')).toBe(true);
    expect(isValidRegionId('bayern-oberbayern')).toBe(true);
    expect(isValidRegionId('a/b')).toBe(false);
    expect(isValidRegionId('')).toBe(false);
    expect(isValidRegionId(5)).toBe(false);
    expect(regionIdFromAccountDocId('region_tirol')).toBe('tirol');
    expect(regionIdFromAccountDocId('token')).toBeNull();
    expect(regionIdFromAccountDocId('region_')).toBeNull();
  });

  it('detects the transition to enabled only', () => {
    const doc = { userId: '1', accessToken: 't', enabled: true };
    const off = { ...doc, enabled: false };
    expect(becameEnabled(undefined, doc, 'tirol')).toBe(true);
    expect(becameEnabled(off, doc, 'tirol')).toBe(true);
    expect(becameEnabled(doc, { ...doc, accessToken: 'new' }, 'tirol')).toBe(false);
    expect(becameEnabled(doc, off, 'tirol')).toBe(false);
    expect(becameEnabled(doc, undefined, 'tirol')).toBe(false);
    expect(becameEnabled(off, { enabled: true, userId: '1' }, 'tirol')).toBe(false);
  });
});

describe('resolveRegionCredentials', () => {
  const legacy = vi.fn(async () => ({ accessToken: 'LEGACY', userId: 'LEGACY_ID' }));
  const base = (acc: RegionAccount | null | Error) => ({
    legacy,
    readRegionAccount: vi.fn(async () => {
      if (acc instanceof Error) throw acc;
      return acc;
    }),
    now: () => NOW,
  });

  it('Vorarlberg always uses the legacy path and never reads a region doc', async () => {
    const deps = base(null);
    expect(await resolveRegionCredentials(deps, 'vorarlberg')).toEqual({
      accessToken: 'LEGACY',
      userId: 'LEGACY_ID',
    });
    expect(deps.readRegionAccount).not.toHaveBeenCalled();
  });

  it('returns the regional credentials when configured and enabled', async () => {
    expect(await resolveRegionCredentials(base(account()), 'tirol')).toEqual({
      accessToken: 'TOKEN_TIROL',
      userId: 'IG_TIROL',
    });
  });

  it.each([
    ['missing', null],
    ['disabled', account({ enabled: false })],
    ['expired', account({ expiresAt: new Date(NOW.getTime() - 1) })],
  ])('skips a %s account', async (_name, acc) => {
    expect(await resolveRegionCredentials(base(acc), 'tirol')).toBeNull();
  });

  it('treats a failing lookup as not configured (safe default)', async () => {
    const log = vi.fn();
    const deps = { ...base(new Error('firestore down')), log };
    expect(await resolveRegionCredentials(deps, 'tirol')).toBeNull();
    expect(log).toHaveBeenCalled();
  });

  it('rejects unsafe region ids without reading', async () => {
    const deps = base(account());
    expect(await resolveRegionCredentials(deps, 'x/../token')).toBeNull();
    expect(deps.readRegionAccount).not.toHaveBeenCalled();
  });
});

describe('region gating in the publish path', () => {
  function publishDeps(over: Partial<PublishDeps> = {}) {
    const created: string[] = [];
    const deps: PublishDeps = {
      fetch: vi.fn() as never,
      accessToken: 'TOKEN_TIROL',
      userId: 'IG_TIROL',
      isEnabled: async () => true,
      createPost: async (id: string, _record: PostRecord) => {
        created.push(id);
        return false; // stop after the dedupe step: "duplicate"
      },
      updatePost: async () => undefined,
      generateImage: async () => 'https://img',
      notifyAdmins: async () => undefined,
      now: () => NOW,
      ...over,
    };
    return { deps, created };
  }
  const tirolEvent = {
    status: 'approved',
    regionId: 'tirol',
    instagramConsent: true,
    title: 'T',
    date: '2026-12-01',
  };

  it('a foreign region is skipped without a dedupe doc unless the account allows it', async () => {
    const { deps, created } = publishDeps();
    expect(await publishApprovedEvent(deps, 'e1', null, tirolEvent)).toBe('region');
    expect(created).toEqual([]);
    deps.instagramRegionIds = ['tirol'];
    expect(await publishApprovedEvent(deps, 'e1', null, tirolEvent)).toBe('duplicate');
    expect(created).toEqual(['feed_e1']);
  });

  it('a regional account never publishes Vorarlberg events', async () => {
    const { deps } = publishDeps({ instagramRegionIds: ['tirol'] });
    expect(
      await publishApprovedEvent(deps, 'e2', null, { ...tirolEvent, regionId: undefined })
    ).toBe('region');
  });

  it('isInstagramRegion keeps the Vorarlberg default for carousel and stories', () => {
    expect(isInstagramRegion({ regionId: 'tirol' })).toBe(false);
    expect(isInstagramRegion({ regionId: 'tirol' }, ['tirol'])).toBe(true);
    expect(isInstagramRegion({})).toBe(true);
  });
});

describe('refreshRegionAccounts', () => {
  function harness(accounts: RegionAccount[], fetchImpl?: (url: string) => Response) {
    const saved: Array<{ regionId: string; accessToken: string }> = [];
    const statuses: Array<{ regionId: string; patch: Record<string, unknown> }> = [];
    const mails: Array<{ subject: string; text: string }> = [];
    const fetchMock = vi.fn(async (url: string) =>
      fetchImpl
        ? fetchImpl(url)
        : new Response(JSON.stringify({ access_token: 'NEW', expires_in: 5184000 }))
    );
    const deps: RegionRefreshDeps = {
      fetch: fetchMock as never,
      listAccounts: async () => accounts,
      saveToken: async (regionId, token) => {
        saved.push({ regionId, accessToken: token.accessToken });
      },
      writeStatus: async (regionId, patch) => {
        statuses.push({ regionId, patch });
      },
      notifyAdmins: async (subject, text) => {
        mails.push({ subject, text });
      },
      now: () => NOW,
    };
    return { deps, saved, statuses, mails, fetchMock };
  }

  it('does not refresh a token with plenty of validity but records the expiry', async () => {
    const h = harness([account()]);
    expect(await refreshRegionAccounts(h.deps)).toEqual({ tirol: 'not-due' });
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.statuses[0].regionId).toBe('tirol');
  });

  it('refreshes tokens with < 30 days left and stores them per region', async () => {
    const h = harness([
      account({ expiresAt: new Date(NOW.getTime() + 20 * DAY) }),
      account({ regionId: 'bayern', accessToken: 'TOKEN_BY' }),
    ]);
    const out = await refreshRegionAccounts(h.deps);
    expect(out).toEqual({ tirol: 'refreshed', bayern: 'not-due' });
    expect(h.saved).toEqual([{ regionId: 'tirol', accessToken: 'NEW' }]);
    expect(h.fetchMock.mock.calls[0][0]).toContain('TOKEN_TIROL');
  });

  it('mails the admins with the region id when the refresh fails, and goes on', async () => {
    const h = harness(
      [
        account({ expiresAt: new Date(NOW.getTime() + 10 * DAY) }),
        account({ regionId: 'bayern', expiresAt: new Date(NOW.getTime() + 10 * DAY) }),
      ],
      () => new Response('{}', { status: 400 })
    );
    const out = await refreshRegionAccounts(h.deps);
    expect(out).toEqual({ tirol: 'failed', bayern: 'failed' });
    expect(h.mails).toHaveLength(2);
    expect(h.mails[0].subject).toContain('tirol');
    expect(h.mails[0].text).toContain('Region: tirol');
    expect(JSON.stringify(h.mails)).not.toContain('TOKEN_TIROL');
    expect(h.statuses.some((s) => s.patch.tokenRefreshError)).toBe(true);
  });

  it('flags an expired enabled token (mail) but not a disabled one', async () => {
    const expired = new Date(NOW.getTime() - DAY);
    const h = harness([
      account({ expiresAt: expired }),
      account({ regionId: 'bayern', expiresAt: expired, enabled: false }),
    ]);
    expect(await refreshRegionAccounts(h.deps)).toEqual({ tirol: 'expired', bayern: 'expired' });
    expect(h.mails).toHaveLength(1);
    expect(h.mails[0].text).toContain('tirol');
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('survives a listing error', async () => {
    const h = harness([]);
    h.deps.listAccounts = async () => {
      throw new Error('boom');
    };
    expect(await refreshRegionAccounts(h.deps)).toEqual({});
  });
});

describe('backfillRegion', () => {
  const cand = (id: string, over: Record<string, unknown> = {}): BackfillCandidate => ({
    id,
    data: {
      status: 'approved',
      instagramConsent: true,
      regionId: 'tirol',
      title: id,
      date: '2026-11-05',
      time: '10:00',
      ...over,
    } as never,
  });

  function harness(cands: BackfillCandidate[], existing: string[] = []) {
    const published: string[] = [];
    const deps: BackfillDeps = {
      listCandidates: async () => cands,
      existingPostEventIds: async (ids) => new Set(ids.filter((i) => existing.includes(i))),
      publish: vi.fn(async (id: string, before: unknown) => {
        expect(before).toBeNull();
        published.push(id);
        return 'published' as const;
      }),
      sleep: vi.fn(async () => undefined),
      now: () => NOW,
    };
    return { deps, published };
  }

  it('selects approved + consented + upcoming events without a post doc', async () => {
    const h = harness(
      [
        cand('ok'),
        cand('past', { date: '2026-10-01' }),
        cand('today', { date: '2026-10-24' }),
        cand('dup'),
        cand('noConsent', { instagramConsent: false }),
        cand('pending', { status: 'pending' }),
        cand('other', { regionId: 'bayern' }),
        cand('endsLater', { date: '2026-10-01', endDate: '2026-11-01' }),
      ],
      ['dup']
    );
    const res = await backfillRegion(h.deps, 'tirol', { pauseMs: 0 });
    expect(h.published.sort()).toEqual(['endsLater', 'ok', 'today']);
    expect(res).toMatchObject({
      candidates: 5,
      skippedPast: 1,
      skippedDuplicate: 1,
      published: 3,
      remaining: 0,
    });
  });

  it('is idempotent: a second run finds nothing new once posts exist', async () => {
    const cands = [cand('a'), cand('b')];
    const existing: string[] = [];
    const h = harness(cands, existing);
    await backfillRegion(h.deps, 'tirol', { pauseMs: 0 });
    existing.push(...h.published);
    const second = harness(cands, existing);
    const res = await backfillRegion(second.deps, 'tirol', { pauseMs: 0 });
    expect(second.published).toEqual([]);
    expect(res.skippedDuplicate).toBe(2);
  });

  it('bounds the batch, posts soonest first and pauses between posts', async () => {
    const cands = [
      cand('c', { date: '2026-12-03' }),
      cand('a', { date: '2026-11-01' }),
      cand('b', { date: '2026-11-02' }),
    ];
    const h = harness(cands);
    const res = await backfillRegion(h.deps, 'tirol', { limit: 2, pauseMs: 5 });
    expect(h.published).toEqual(['a', 'b']);
    expect(res.remaining).toBe(1);
    expect(h.deps.sleep).toHaveBeenCalledTimes(1);
    expect(h.deps.sleep).toHaveBeenCalledWith(5);
  });

  it('stops at once when the kill switch is off', async () => {
    const h = harness([cand('a'), cand('b')]);
    h.deps.publish = vi.fn(async () => 'disabled' as const);
    const res = await backfillRegion(h.deps, 'tirol', { pauseMs: 0 });
    expect(h.deps.publish).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ disabled: true, remaining: 2, published: 0 });
  });

  it('counts a crashing event as failed and continues', async () => {
    const h = harness([cand('a'), cand('b')]);
    h.deps.publish = vi.fn(async (id: string) => {
      if (id === 'a') throw new Error('x');
      return 'published' as const;
    });
    const res = await backfillRegion(h.deps, 'tirol', { pauseMs: 0 });
    expect(res).toMatchObject({ failed: 1, published: 1 });
  });
});

describe('post ids do not collide across regions', () => {
  it('keeps Vorarlberg ids unchanged and namespaces other regions', () => {
    expect(carouselPostId('Dornbirn', '2026-10-26', 1)).toBe('carousel_dornbirn_2026-10-26');
    expect(carouselPostId('Dornbirn', '2026-10-26', 2, 'vorarlberg')).toBe(
      'carousel_dornbirn_2026-10-26_p2'
    );
    expect(carouselPostId('Dornbirn', '2026-10-26', 1, 'tirol')).toBe(
      'carousel_tirol_dornbirn_2026-10-26'
    );
    expect(storyPostId('Dornbirn', '2026-10-26', 1, 'frueh')).toBe(
      'story_dornbirn_2026-10-26_frueh'
    );
    expect(storyPostId('Dornbirn', '2026-10-26', 1, 'frueh', 'vorarlberg')).toBe(
      'story_dornbirn_2026-10-26_frueh'
    );
    expect(storyPostId('Dornbirn', '2026-10-26', 1, 'frueh', 'tirol')).toBe(
      'story_tirol_dornbirn_2026-10-26_frueh'
    );
  });
});
