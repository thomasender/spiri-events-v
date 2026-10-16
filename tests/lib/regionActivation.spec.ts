import { describe, it, expect } from 'vitest';
import {
  MIN_UPCOMING_EVENTS,
  countModeratorsByRegion,
  countUpcomingEventsByRegion,
  decideRegionActive,
  evaluateRegionActivation,
  isUpcomingRegionEvent,
  regionActivationStatuses,
} from '../../functions/src/regionActivation';
import {
  listRegionActivationHandler,
  parseSetRegionActiveInput,
  setRegionActiveHandler,
  type RegionAuditEntry,
  type RegionTransaction,
} from '../../functions/src/adminRegions';

type Doc = Record<string, unknown>;

const TODAY = '2026-10-14';

const ev = (over: Doc = {}): Doc => ({ status: 'approved', date: '2026-11-01', ...over });
const many = (n: number, over: Doc = {}) => Array.from({ length: n }, () => ev(over));

describe('isUpcomingRegionEvent', () => {
  it('counts approved, non-online events whose last date is today or later', () => {
    expect(isUpcomingRegionEvent(ev(), TODAY)).toBe(true);
    expect(isUpcomingRegionEvent(ev({ date: TODAY }), TODAY)).toBe(true);
    expect(isUpcomingRegionEvent(ev({ date: '2026-10-13' }), TODAY)).toBe(false);
    // Multi-day event still running, series with a later end.
    expect(isUpcomingRegionEvent(ev({ date: '2026-10-10', endDate: '2026-10-15' }), TODAY)).toBe(
      true
    );
    expect(
      isUpcomingRegionEvent(
        ev({ date: '2026-09-01', recurrence: 'weekly', recurrenceEndDate: '2026-12-01' }),
        TODAY
      )
    ).toBe(true);
  });

  it('ignores online, unapproved and malformed events', () => {
    expect(isUpcomingRegionEvent(ev({ isOnline: true }), TODAY)).toBe(false);
    for (const status of ['pending', 'draft', 'trashed', undefined]) {
      expect(isUpcomingRegionEvent(ev({ status }), TODAY)).toBe(false);
    }
    expect(isUpcomingRegionEvent(ev({ date: undefined }), TODAY)).toBe(false);
    expect(isUpcomingRegionEvent(ev({ date: 20261101 }), TODAY)).toBe(false);
    expect(isUpcomingRegionEvent(null, TODAY)).toBe(false);
  });
});

describe('countUpcomingEventsByRegion', () => {
  it('counts per regionId, missing regionId as Vorarlberg, unknown ids not at all', () => {
    const counts = countUpcomingEventsByRegion(
      [
        ev(),
        ev({ regionId: 'vorarlberg' }),
        ev({ regionId: 'tirol' }),
        ev({ regionId: 'tirol', isOnline: true }),
        ev({ regionId: 'mars' }),
        ev({ regionId: 'wien', date: '2025-01-01' }),
      ],
      TODAY
    );
    expect(counts.vorarlberg).toBe(2);
    expect(counts.tirol).toBe(1);
    expect(counts.wien).toBe(0);
    expect(counts).not.toHaveProperty('mars');
  });
});

describe('countModeratorsByRegion', () => {
  it('counts moderators per region, ignoring Super-Admins and malformed docs', () => {
    const counts = countModeratorsByRegion([
      { role: 'RegionModerator', regionIds: ['tirol', 'wien'] },
      { role: 'RegionModerator', regionIds: ['tirol', 'tirol', 'mars'] },
      { role: 'Admin', regionIds: ['salzburg'] },
      { role: 'RegionModerator', regionIds: 'salzburg' },
      { role: 'RegionModerator' },
    ]);
    expect(counts).toMatchObject({ tirol: 2, wien: 1, salzburg: 0, vorarlberg: 0 });
    expect(counts).not.toHaveProperty('mars');
  });
});

describe('evaluateRegionActivation / regionActivationStatuses', () => {
  it('needs one moderator and 15 upcoming events', () => {
    expect(evaluateRegionActivation('tirol', 1, MIN_UPCOMING_EVENTS).unmet).toEqual([]);
    expect(evaluateRegionActivation('tirol', 0, MIN_UPCOMING_EVENTS).unmet).toEqual(['moderators']);
    expect(evaluateRegionActivation('tirol', 2, 14).unmet).toEqual(['events']);
    expect(evaluateRegionActivation('tirol', 0, 7)).toEqual({
      regionId: 'tirol',
      moderatorCount: 0,
      upcomingEventCount: 7,
      unmet: ['moderators', 'events'],
    });
  });

  it('returns every region in register order', () => {
    const statuses = regionActivationStatuses(
      [{ role: 'RegionModerator', regionIds: ['tirol'] }],
      many(15, { regionId: 'tirol' }),
      TODAY
    );
    expect(statuses.map((s) => s.regionId)[0]).toBe('vorarlberg');
    expect(statuses).toHaveLength(51);
    expect(statuses.find((s) => s.regionId === 'tirol')?.unmet).toEqual([]);
  });
});

describe('decideRegionActive', () => {
  const met = evaluateRegionActivation('tirol', 1, 20);
  const unmet = evaluateRegionActivation('tirol', 0, 7);
  const base = { regionId: 'tirol', override: false, currentActive: false, status: met };

  it('activates when the conditions are met', () => {
    expect(decideRegionActive({ ...base, active: true })).toEqual({
      kind: 'write',
      override: false,
    });
  });

  it('refuses unmet conditions without override, allows them with override', () => {
    expect(decideRegionActive({ ...base, active: true, status: unmet })).toEqual({
      kind: 'refuse-unmet',
      unmet: ['moderators', 'events'],
    });
    expect(decideRegionActive({ ...base, active: true, status: unmet, override: true })).toEqual({
      kind: 'write',
      override: true,
    });
    // An override with met conditions is not recorded as an override.
    expect(decideRegionActive({ ...base, active: true, override: true })).toEqual({
      kind: 'write',
      override: false,
    });
  });

  it('deactivates without conditions, except Vorarlberg', () => {
    expect(
      decideRegionActive({ ...base, active: false, currentActive: true, status: unmet })
    ).toEqual({ kind: 'write', override: false });
    const vbg = evaluateRegionActivation('vorarlberg', 0, 100);
    expect(
      decideRegionActive({
        regionId: 'vorarlberg',
        active: false,
        override: true,
        currentActive: true,
        status: vbg,
      })
    ).toEqual({ kind: 'refuse-permanent' });
  });

  it('reports no change for the current state', () => {
    expect(decideRegionActive({ ...base, active: false })).toEqual({ kind: 'unchanged' });
    expect(
      decideRegionActive({ ...base, active: true, currentActive: true, status: unmet })
    ).toEqual({ kind: 'unchanged' });
  });
});

describe('parseSetRegionActiveInput', () => {
  it('accepts known regions and booleans only', () => {
    expect(parseSetRegionActiveInput({ regionId: 'tirol', active: true })).toEqual({
      regionId: 'tirol',
      active: true,
      override: false,
    });
    for (const bad of [
      null,
      {},
      { regionId: 'mars', active: true },
      { regionId: 'tirol' },
      { regionId: 'tirol', active: 'true' },
      { regionId: 'tirol', active: true, override: 'yes' },
    ]) {
      expect(() => parseSetRegionActiveInput(bad)).toThrow(
        expect.objectContaining({ code: 'invalid-argument' })
      );
    }
  });
});

// In-memory admin_users, events and regions. Transactions buffer writes and
// apply them only if the callback succeeds, like Firestore.
function makeWorld({
  roles = {} as Record<string, Doc>,
  events = [] as Doc[],
  regions = { vorarlberg: { active: true }, tirol: { active: false } } as Record<string, Doc>,
} = {}) {
  const regionDocs = new Map<string, Doc>(Object.entries(regions));
  const audit: RegionAuditEntry[] = [];
  const readRoleDoc = async (uid: string) => roles[uid] ?? null;
  const deps = {
    readRoleDoc,
    listModeratorDocs: async () => Object.values(roles).filter((d) => d.role === 'RegionModerator'),
    listApprovedEvents: async () => events.filter((e) => e.status === 'approved'),
    today: () => TODAY,
    async runTransaction<T>(fn: (tx: RegionTransaction) => Promise<T>): Promise<T> {
      const pending: Array<() => void> = [];
      const tx: RegionTransaction = {
        getRegionDoc: async (id) => regionDocs.get(id) ?? null,
        setRegionActive: (id, active) =>
          pending.push(() => regionDocs.set(id, { ...regionDocs.get(id), active })),
        addAuditEntry: (entry) => pending.push(() => audit.push(entry)),
      };
      const result = await fn(tx);
      pending.forEach((w) => w());
      return result;
    },
  };
  return { regionDocs, audit, deps };
}

const ADMIN = { role: 'Admin' };
const TIROL_MOD = { role: 'RegionModerator', regionIds: ['tirol'] };
const call = (uid: string | null, data?: unknown) => ({ auth: uid ? { uid } : null, data });

describe('setRegionActiveHandler', () => {
  it('only lets Super-Admins switch regions', async () => {
    const w = makeWorld({ roles: { admin: ADMIN, mod: TIROL_MOD } });
    const data = { regionId: 'tirol', active: true, override: true };
    await expect(setRegionActiveHandler(call(null, data), w.deps)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    for (const uid of ['mod', 'nobody']) {
      await expect(setRegionActiveHandler(call(uid, data), w.deps)).rejects.toMatchObject({
        code: 'permission-denied',
      });
    }
    expect(w.regionDocs.get('tirol')?.active).toBe(false);
    expect(w.audit).toEqual([]);
  });

  it('activates a region that meets the conditions and writes an audit entry', async () => {
    const w = makeWorld({
      roles: { admin: ADMIN, mod: TIROL_MOD },
      events: [...many(15, { regionId: 'tirol' }), ev({ regionId: 'tirol', isOnline: true })],
    });
    const result = await setRegionActiveHandler(
      call('admin', { regionId: 'tirol', active: true }),
      w.deps
    );
    expect(result).toMatchObject({
      regionId: 'tirol',
      active: true,
      changed: true,
      override: false,
    });
    expect(w.regionDocs.get('tirol')?.active).toBe(true);
    expect(w.audit).toEqual([
      {
        action: 'activateRegion',
        actorUid: 'admin',
        regionId: 'tirol',
        active: true,
        override: false,
        unmet: [],
        moderatorCount: 1,
        upcomingEventCount: 15,
      },
    ]);
  });

  it('refuses unmet conditions with details, and accepts an explicit override', async () => {
    const w = makeWorld({ roles: { admin: ADMIN }, events: many(7, { regionId: 'tirol' }) });
    await expect(
      setRegionActiveHandler(call('admin', { regionId: 'tirol', active: true }), w.deps)
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      details: {
        reason: 'conditions-unmet',
        unmet: ['moderators', 'events'],
        moderatorCount: 0,
        upcomingEventCount: 7,
        minUpcomingEvents: 15,
      },
    });
    expect(w.regionDocs.get('tirol')?.active).toBe(false);
    expect(w.audit).toEqual([]);

    const result = await setRegionActiveHandler(
      call('admin', { regionId: 'tirol', active: true, override: true }),
      w.deps
    );
    expect(result).toMatchObject({ changed: true, override: true });
    expect(w.regionDocs.get('tirol')?.active).toBe(true);
    expect(w.audit[0]).toMatchObject({
      action: 'activateRegion',
      override: true,
      unmet: ['moderators', 'events'],
      upcomingEventCount: 7,
    });
  });

  it('counts events without regionId for Vorarlberg only', async () => {
    const w = makeWorld({
      roles: { admin: ADMIN, mod: TIROL_MOD },
      events: many(20),
    });
    await expect(
      setRegionActiveHandler(call('admin', { regionId: 'tirol', active: true }), w.deps)
    ).rejects.toMatchObject({ details: { unmet: ['events'], upcomingEventCount: 0 } });
  });

  it('deactivates without conditions but never Vorarlberg', async () => {
    const w = makeWorld({
      roles: { admin: ADMIN },
      regions: { vorarlberg: { active: true }, tirol: { active: true } },
    });
    const result = await setRegionActiveHandler(
      call('admin', { regionId: 'tirol', active: false }),
      w.deps
    );
    expect(result).toMatchObject({ active: false, changed: true });
    expect(w.regionDocs.get('tirol')?.active).toBe(false);
    expect(w.audit[0]).toMatchObject({ action: 'deactivateRegion', override: false });

    await expect(
      setRegionActiveHandler(
        call('admin', { regionId: 'vorarlberg', active: false, override: true }),
        w.deps
      )
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'permanent-region' },
    });
    expect(w.regionDocs.get('vorarlberg')?.active).toBe(true);
    expect(w.audit).toHaveLength(1);
  });

  it('is a no-op for the current state and refuses a missing region doc', async () => {
    const w = makeWorld({ roles: { admin: ADMIN }, regions: { tirol: { active: false } } });
    const result = await setRegionActiveHandler(
      call('admin', { regionId: 'tirol', active: false }),
      w.deps
    );
    expect(result.changed).toBe(false);
    expect(w.audit).toEqual([]);
    await expect(
      setRegionActiveHandler(
        call('admin', { regionId: 'wien', active: true, override: true }),
        w.deps
      )
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(w.regionDocs.has('wien')).toBe(false);
  });

  it('validates the input', async () => {
    const w = makeWorld({ roles: { admin: ADMIN } });
    await expect(
      setRegionActiveHandler(call('admin', { regionId: 'mars', active: true }), w.deps)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('listRegionActivationHandler', () => {
  it('returns the status of every region for Super-Admins only', async () => {
    const w = makeWorld({
      roles: { admin: ADMIN, mod: TIROL_MOD },
      events: many(3, { regionId: 'tirol' }),
    });
    const result = await listRegionActivationHandler(call('admin'), w.deps);
    expect(result.minUpcomingEvents).toBe(15);
    expect(result.minModerators).toBe(1);
    expect(result.regions.find((r) => r.regionId === 'tirol')).toEqual({
      regionId: 'tirol',
      moderatorCount: 1,
      upcomingEventCount: 3,
      unmet: ['events'],
    });
    await expect(listRegionActivationHandler(call('mod'), w.deps)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
