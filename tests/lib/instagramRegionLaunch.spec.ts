import { describe, it, expect, vi } from 'vitest';
import {
  hasLaunchPlan,
  launchEnd,
  launchTarget,
  launchWindows,
  parseLaunchPlan,
  parseLaunchProgress,
  runLaunchDrip,
  zonedWallTimeToUtc,
  type LaunchDeps,
  type LaunchPlan,
  type LaunchProgress,
} from '../../functions/src/instagram/instagramRegionLaunch';
import {
  parseRegionAccount,
  resolveRegionCredentials,
  shouldAutoBackfill,
} from '../../functions/src/instagram/instagramRegionAccounts';
import type { TriggerOutcome } from '../../functions/src/instagram/instagramPublish';

const ts = (d: Date) => ({ toDate: () => d });
const H = 3_600_000;

// Bodensee: 25.11.2026 12:00 Europe/Berlin (CET, UTC+1), 3 days, 08:00-20:00.
const START = new Date('2026-11-25T11:00:00Z');
const PLAN: LaunchPlan = {
  startAt: START,
  days: 3,
  windowStart: '08:00',
  windowEnd: '20:00',
  timezone: 'Europe/Berlin',
};
const at = (iso: string) => new Date(iso);

describe('launch plan parsing', () => {
  it('reads the plan with defaults and the region timezone', () => {
    expect(parseLaunchPlan('bodensee', { launchStartAt: ts(START) })).toEqual(PLAN);
    expect(
      parseLaunchPlan('bodensee', {
        launchStartAt: ts(START),
        launchDays: 2,
        launchWindowStart: '09:30',
        launchWindowEnd: '18:00',
        launchTimezone: 'Europe/Zurich',
      })
    ).toEqual({
      ...PLAN,
      days: 2,
      windowStart: '09:30',
      windowEnd: '18:00',
      timezone: 'Europe/Zurich',
    });
    // broken fields fall back instead of breaking the drip
    expect(
      parseLaunchPlan('bodensee', {
        launchStartAt: ts(START),
        launchDays: 0,
        launchWindowStart: '20:00',
        launchWindowEnd: '08:00',
        launchTimezone: 'Mars/Base',
      })
    ).toEqual(PLAN);
    expect(parseLaunchPlan('bodensee', {})).toBeNull();
    expect(hasLaunchPlan({ launchStartAt: ts(START) })).toBe(true);
    expect(hasLaunchPlan({ enabled: true })).toBe(false);
  });
});

describe('slot maths', () => {
  it('day 1 starts at launchStartAt, days 2 and 3 are full windows (Europe/Berlin)', () => {
    expect(launchWindows(PLAN).map((w) => [w.start.toISOString(), w.end.toISOString()])).toEqual([
      ['2026-11-25T11:00:00.000Z', '2026-11-25T19:00:00.000Z'],
      ['2026-11-26T07:00:00.000Z', '2026-11-26T19:00:00.000Z'],
      ['2026-11-27T07:00:00.000Z', '2026-11-27T19:00:00.000Z'],
    ]);
    expect(launchEnd(PLAN).toISOString()).toBe('2026-11-27T19:00:00.000Z');
  });

  it('is DST-safe: wall clock 08:00 stays 08:00 across the March change', () => {
    expect(zonedWallTimeToUtc('2027-03-27', '08:00', 'Europe/Berlin').toISOString()).toBe(
      '2027-03-27T07:00:00.000Z'
    );
    expect(zonedWallTimeToUtc('2027-03-28', '08:00', 'Europe/Berlin').toISOString()).toBe(
      '2027-03-28T06:00:00.000Z'
    );
    const plan = { ...PLAN, startAt: at('2027-03-27T06:00:00Z'), days: 2 };
    expect(launchWindows(plan).map((w) => (w.end.getTime() - w.start.getTime()) / H)).toEqual([
      12, 12,
    ]);
  });

  it('spreads the total evenly over the 32 window hours', () => {
    // 32 events over 32 h: one per window hour, the first at the start.
    expect(launchTarget(PLAN, 32, at('2026-11-25T10:59:00Z'))).toBe(0);
    expect(launchTarget(PLAN, 32, START)).toBe(0);
    expect(launchTarget(PLAN, 32, at('2026-11-25T11:00:01Z'))).toBe(1);
    expect(launchTarget(PLAN, 32, at('2026-11-25T13:30:00Z'))).toBe(3);
    // overnight nothing more becomes due
    expect(launchTarget(PLAN, 32, at('2026-11-25T19:00:00Z'))).toBe(8);
    expect(launchTarget(PLAN, 32, at('2026-11-26T06:59:00Z'))).toBe(8);
    expect(launchTarget(PLAN, 32, at('2026-11-26T07:30:00Z'))).toBe(9);
    expect(launchTarget(PLAN, 32, at('2026-11-27T18:59:00Z'))).toBe(32);
    expect(launchTarget(PLAN, 32, at('2026-12-01T00:00:00Z'))).toBe(32);
  });

  it('never exceeds the total, also with few events', () => {
    for (let h = 0; h < 80; h += 0.5) {
      const now = new Date(START.getTime() + h * H);
      expect(launchTarget(PLAN, 3, now)).toBeLessThanOrEqual(3);
      expect(launchTarget(PLAN, 0, now)).toBe(0);
    }
  });
});

// ---------------------------------------------------------------- drip

type Ev = Record<string, unknown>;

function boEvent(id: string, over: Ev = {}): Ev {
  return {
    status: 'approved',
    instagramConsent: true,
    regionId: 'bodensee',
    date: '2026-12-10',
    time: '18:00',
    title: id,
    ...over,
  };
}

function harness(
  opts: {
    events?: Record<string, Ev>;
    posts?: string[];
    enabled?: boolean;
    progress?: Partial<LaunchProgress>;
    outcome?: (id: string) => TriggerOutcome | 'throw';
  } = {}
) {
  const events = new Map(Object.entries(opts.events ?? {}));
  const posts = new Set(opts.posts ?? []);
  const state: LaunchProgress & { lease: Date | null; total?: number; remaining?: number } = {
    startedAt: null,
    eventIds: null,
    cursor: 0,
    posted: 0,
    finishedAt: null,
    lease: null,
    ...opts.progress,
  };
  let now = START;
  const published: string[] = [];
  const deps: LaunchDeps = {
    isEnabled: async () => opts.enabled ?? true,
    async acquireLease(_r, t, until) {
      if (state.lease && state.lease > t) return null;
      state.lease = until;
      return {
        startedAt: state.startedAt,
        eventIds: state.eventIds ? [...state.eventIds] : null,
        cursor: state.cursor,
        posted: state.posted,
        finishedAt: state.finishedAt,
      };
    },
    async releaseLease() {
      state.lease = null;
    },
    async saveProgress(_r, patch) {
      Object.assign(state, patch);
    },
    listCandidates: async () => [...events].map(([id, data]) => ({ id, data })),
    existingPostEventIds: async (ids) => new Set(ids.filter((id) => posts.has(`feed_${id}`))),
    getEvent: async (id) => events.get(id) ?? null,
    publish: vi.fn(async (id: string) => {
      const o = opts.outcome?.(id) ?? 'published';
      if (o === 'throw') throw new Error('boom');
      if (o === 'disabled') return o;
      if (posts.has(`feed_${id}`)) return 'duplicate';
      posts.add(`feed_${id}`);
      if (o === 'published') published.push(id);
      return o;
    }),
    sleep: vi.fn(async () => undefined),
    now: () => now,
  };
  return {
    deps,
    state,
    posts,
    events,
    published,
    setNow: (d: Date) => {
      now = d;
    },
    run: () => runLaunchDrip(deps, 'bodensee', PLAN, { pauseMs: 0 }),
  };
}

const many = (n: number) =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [
      `e${String(i).padStart(2, '0')}`,
      boEvent(`e${i}`, { date: `2026-12-${String(10 + (i % 15)).padStart(2, '0')}` }),
    ])
  );

describe('runLaunchDrip', () => {
  it('posts nothing before the start', async () => {
    const h = harness({ events: many(4) });
    h.setNow(at('2026-11-25T10:00:00Z'));
    expect(await h.run()).toEqual({ regionId: 'bodensee', status: 'not-started' });
    expect(h.state.eventIds).toBeNull();
  });

  it('freezes the backlog at the first run: soonest first, no region mixing, no already posted ones', async () => {
    const h = harness({
      events: {
        late: boEvent('late', { date: '2026-12-20' }),
        early: boEvent('early', { date: '2026-12-01', time: '9:00' }),
        vbg: boEvent('vbg', { regionId: 'vorarlberg' }),
        legacy: boEvent('legacy', { regionId: undefined }),
        past: boEvent('past', { date: '2026-11-20' }),
        noConsent: boEvent('noConsent', { instagramConsent: false }),
        posted: boEvent('posted'),
        afterStart: boEvent('afterStart', { approvedAt: ts(at('2026-11-25T11:05:00Z')) }),
        beforeStart: boEvent('beforeStart', {
          date: '2026-12-05',
          approvedAt: ts(at('2026-11-20T09:00:00Z')),
        }),
      },
      posts: ['feed_posted'],
    });
    h.setNow(at('2026-11-25T11:10:00Z'));
    const result = await h.run();
    expect(h.state.eventIds).toEqual(['early', 'beforeStart', 'late']);
    expect(h.state.total).toBe(3);
    expect(result).toMatchObject({ status: 'ran', total: 3, postedThisRun: 1 });
    expect(h.published).toEqual(['early']);
  });

  it('posts only the difference to the target and is idempotent', async () => {
    const h = harness({ events: many(32) });
    h.setNow(at('2026-11-25T13:30:00Z')); // target 3
    expect(await h.run()).toMatchObject({ target: 3, posted: 3, postedThisRun: 3 });
    expect(await h.run()).toMatchObject({ posted: 3, postedThisRun: 0 });
    expect(h.published).toHaveLength(3);
  });

  it('catches up after a missed run and never exceeds the cumulative target', async () => {
    const h = harness({ events: many(32) });
    h.setNow(at('2026-11-25T11:30:00Z'));
    await h.run(); // 1
    h.setNow(at('2026-11-26T07:30:00Z')); // runs overnight and early morning missed: target 9
    expect(await h.run()).toMatchObject({ target: 9, posted: 9, postedThisRun: 8 });
    expect(h.published).toHaveLength(9);
  });

  it('does not use a slot for events that became past, were withdrawn or already posted', async () => {
    const h = harness({ events: many(32) });
    h.setNow(at('2026-11-25T11:30:00Z'));
    await h.run();
    const [, second, third] = h.state.eventIds as string[];
    h.events.set(second, { ...h.events.get(second), status: 'draft' });
    h.posts.add(`feed_${third}`); // instant post / manual backfill got there first
    h.setNow(at('2026-11-25T12:30:00Z')); // target 2
    const r = await h.run();
    expect(r).toMatchObject({ posted: 2, postedThisRun: 1, cursor: 4 });
    expect(h.published).toHaveLength(2);
  });

  it('kill switch: no lease, no backlog, no slot, no post doc', async () => {
    const h = harness({ events: many(5), enabled: false });
    h.setNow(at('2026-11-25T15:00:00Z'));
    expect(await h.run()).toMatchObject({ status: 'disabled' });
    expect(h.state.eventIds).toBeNull();
    expect(h.state.lease).toBeNull();
    expect(h.posts.size).toBe(0);
  });

  it('switch flipped during the run gives the slot back', async () => {
    const h = harness({ events: many(32), outcome: () => 'disabled' });
    h.setNow(at('2026-11-25T13:30:00Z'));
    expect(await h.run()).toMatchObject({ posted: 0, cursor: 0, postedThisRun: 0 });
    expect(h.posts.size).toBe(0);
  });

  it('a failing post uses its slot but does not stop the others', async () => {
    const h = harness({
      events: many(32),
      outcome: (id) => (id === 'e00' ? 'throw' : 'published'),
    });
    h.setNow(at('2026-11-25T13:30:00Z'));
    expect(await h.run()).toMatchObject({ posted: 3, postedThisRun: 3 });
    expect(h.state.eventIds?.[0]).toBe('e00');
    expect(h.published).toHaveLength(2);
    expect(h.published).not.toContain('e00');
  });

  it('does not run twice at once (lease)', async () => {
    const h = harness({ events: many(5) });
    h.state.lease = at('2026-11-25T12:00:00Z');
    h.setNow(at('2026-11-25T11:30:00Z'));
    expect(await h.run()).toMatchObject({ status: 'busy' });
    expect(h.posts.size).toBe(0);
  });

  it('after the last window it stops and records what is left, without a burst', async () => {
    const h = harness({ events: many(32) });
    h.setNow(at('2026-11-25T11:30:00Z'));
    await h.run();
    h.setNow(at('2026-11-28T08:00:00Z'));
    expect(await h.run()).toMatchObject({ status: 'finished', postedThisRun: 0, remaining: 31 });
    expect(h.state.remaining).toBe(31);
    expect(h.state.finishedAt).toEqual(at('2026-11-28T08:00:00Z'));
    expect(await h.run()).toMatchObject({ status: 'finished-before' });
    expect(h.published).toHaveLength(1);
  });

  it('finishes once the backlog is through', async () => {
    const h = harness({ events: many(2) });
    h.setNow(at('2026-11-27T12:00:00Z'));
    expect(await h.run()).toMatchObject({ status: 'finished', posted: 2, remaining: 0 });
  });

  it('reads stored progress', () => {
    expect(
      parseLaunchProgress({ launchEventIds: ['a', 1, 'b'], launchCursor: 1, launchPosted: -2 })
    ).toEqual({ startedAt: null, eventIds: ['a', 'b'], cursor: 1, posted: 0, finishedAt: null });
  });
});

describe('launch gate on the other paths', () => {
  const base = {
    userId: 'IG_BO',
    accessToken: 'TOKEN_BO',
    expiresAt: ts(at('2027-01-20T00:00:00Z')),
    enabled: true,
  };
  const resolve = (data: Ev, now: Date) =>
    resolveRegionCredentials(
      {
        legacy: async () => ({ accessToken: 'L', userId: 'L' }),
        readRegionAccount: async (id) => parseRegionAccount(id, data),
        now: () => now,
      },
      'bodensee'
    );

  it('before launchStartAt the region has no usable account (approval path posts nothing)', async () => {
    const data = { ...base, launchStartAt: ts(START) };
    expect(await resolve(data, at('2026-11-25T10:59:00Z'))).toBeNull();
    // from the start on, a newly approved event posts at once as before
    expect(await resolve(data, START)).toEqual({ accessToken: 'TOKEN_BO', userId: 'IG_BO' });
    // without a plan nothing changes
    expect(await resolve(base, at('2026-11-01T00:00:00Z'))).toEqual({
      accessToken: 'TOKEN_BO',
      userId: 'IG_BO',
    });
  });

  it('suppresses the automatic backfill only when a plan is set', () => {
    const off = { ...base, enabled: false };
    expect(shouldAutoBackfill(off, base, 'bodensee')).toBe(true);
    expect(shouldAutoBackfill(off, { ...base, launchStartAt: ts(START) }, 'bodensee')).toBe(false);
    expect(shouldAutoBackfill(base, base, 'bodensee')).toBe(false);
  });
});
