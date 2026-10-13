import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EMULATOR_HOST,
  MAX_BATCH_SIZE,
  chunk,
  isBackupFromToday,
  migrateSnapshotDocs,
  planEventUpdate,
  planMigration,
  planProfileUpdate,
  resolveOptions,
} from '../../src/utils/regionMigration.js';
import {
  isApprovalTransition,
  publishApprovedEvent,
  type PublishDeps,
} from '../../functions/src/instagram/instagramPublish';
import { decideEventStatusNotification } from '../../functions/src/notificationRouting';

const MIGRATE_EVENT = { kind: 'migrate', update: { regionId: 'vorarlberg' } };
const MIGRATE_PROFILE = { kind: 'migrate', update: { directoryRegionIds: ['vorarlberg'] } };

// Every event shape that exists in production: all statuses, trash, series.
const EVENT_SHAPES: Array<[string, Record<string, unknown>]> = [
  ['approved', { status: 'approved', title: 'A' }],
  ['pending', { status: 'pending' }],
  ['draft', { status: 'draft' }],
  ['rejected', { status: 'rejected' }],
  ['trashed', { status: 'trashed', trashedAt: '2026-10-01T00:00:00Z' }],
  ['series master', { status: 'approved', recurrence: 'weekly', exceptionDates: ['2026-10-20'] }],
  ['custom series', { status: 'approved', recurrence: 'custom', customDates: ['2026-10-21'] }],
  ['online', { status: 'approved', isOnline: true }],
];

describe('planEventUpdate', () => {
  it.each(EVENT_SHAPES)('%s without regionId gets vorarlberg', (_label, data) => {
    expect(planEventUpdate(data)).toEqual(MIGRATE_EVENT);
  });

  it.each(EVENT_SHAPES)('%s with regionId is left alone', (_label, data) => {
    expect(planEventUpdate({ ...data, regionId: 'tirol' })).toEqual({ kind: 'already' });
  });

  it('treats null and empty string as missing', () => {
    expect(planEventUpdate({ regionId: null })).toEqual(MIGRATE_EVENT);
    expect(planEventUpdate({ regionId: '' })).toEqual(MIGRATE_EVENT);
    expect(planEventUpdate(undefined)).toEqual(MIGRATE_EVENT);
  });

  it('reports unknown values instead of overwriting them', () => {
    expect(planEventUpdate({ regionId: 'mars' })).toEqual({ kind: 'invalid', value: 'mars' });
    expect(planEventUpdate({ regionId: 5 })).toEqual({ kind: 'invalid', value: 5 });
  });
});

describe('planProfileUpdate', () => {
  it('sets directoryRegionIds for listed and unlisted profiles, with or without directoryRegions', () => {
    expect(planProfileUpdate({ listedInDirectory: true, directoryRegions: ['Dornbirn'] })).toEqual(
      MIGRATE_PROFILE
    );
    expect(planProfileUpdate({ listedInDirectory: true, directoryRegions: [] })).toEqual(
      MIGRATE_PROFILE
    );
    expect(planProfileUpdate({ listedInDirectory: false })).toEqual(MIGRATE_PROFILE);
    expect(planProfileUpdate({})).toEqual(MIGRATE_PROFILE);
    expect(planProfileUpdate({ directoryRegionIds: [] })).toEqual(MIGRATE_PROFILE);
    expect(planProfileUpdate({ directoryRegionIds: null })).toEqual(MIGRATE_PROFILE);
  });

  it('keeps an existing valid list', () => {
    expect(planProfileUpdate({ directoryRegionIds: ['tirol', 'wien'] })).toEqual({
      kind: 'already',
    });
  });

  it('reports invalid lists', () => {
    expect(planProfileUpdate({ directoryRegionIds: ['mars'] }).kind).toBe('invalid');
    expect(planProfileUpdate({ directoryRegionIds: 'vorarlberg' }).kind).toBe('invalid');
  });

  it('never touches the old Bezirk field directoryRegions', () => {
    const plan = planProfileUpdate({ directoryRegions: ['Bregenz'] });
    expect(plan).toEqual(MIGRATE_PROFILE);
  });
});

function applyPlan(
  docs: Array<{ path: string; type: 'event' | 'profile'; data: Record<string, unknown> }>,
  updates: Array<{ path: string; update: Record<string, unknown> }>
) {
  const byPath = new Map(updates.map((u) => [u.path, u.update]));
  return docs.map((d) => ({ ...d, data: { ...d.data, ...(byPath.get(d.path) ?? {}) } }));
}

describe('planMigration', () => {
  const docs = [
    ...EVENT_SHAPES.map(([label, data], i) => ({
      path: `events/e${i}`,
      type: 'event' as const,
      data: { ...data, title: label, updatedAt: 'T0' },
    })),
    {
      path: 'events/done',
      type: 'event' as const,
      data: { status: 'approved', regionId: 'tirol' },
    },
    { path: 'events/bad', type: 'event' as const, data: { status: 'approved', regionId: 'mars' } },
    { path: 'users/u1', type: 'profile' as const, data: { listedInDirectory: true } },
    {
      path: 'users/u1/publicProfile/data',
      type: 'profile' as const,
      data: { listedInDirectory: true },
    },
    { path: 'users/u2', type: 'profile' as const, data: { listedInDirectory: false } },
    { path: 'users/u3', type: 'profile' as const, data: { directoryRegionIds: ['vorarlberg'] } },
  ];

  it('counts total, already set, updates and invalid docs', () => {
    const plan = planMigration(docs);
    expect(plan.total).toBe(docs.length);
    expect(plan.already).toBe(2);
    expect(plan.invalid).toEqual([{ path: 'events/bad', type: 'event', value: 'mars' }]);
    expect(plan.updates).toHaveLength(EVENT_SHAPES.length + 3);
    expect(plan.updates.find((u) => u.path === 'users/u1/publicProfile/data')?.update).toEqual({
      directoryRegionIds: ['vorarlberg'],
    });
  });

  it('only adds the region field (updatedAt and everything else stay as they are)', () => {
    for (const u of planMigration(docs).updates) {
      expect(Object.keys(u.update)).toEqual([
        u.type === 'event' ? 'regionId' : 'directoryRegionIds',
      ]);
    }
  });

  it('is idempotent: a second run yields 0 updates', () => {
    const first = planMigration(docs);
    const second = planMigration(applyPlan(docs, first.updates));
    expect(second.updates).toEqual([]);
    expect(second.already).toBe(docs.length - 1);
    expect(second.invalid).toHaveLength(1);
  });
});

describe('chunk', () => {
  it('splits into batches of at most 400', () => {
    const items = Array.from({ length: 901 }, (_, i) => i);
    const parts = chunk(items);
    expect(MAX_BATCH_SIZE).toBe(400);
    expect(parts.map((p) => p.length)).toEqual([400, 400, 101]);
    expect(chunk([])).toEqual([]);
  });
});

describe('production guard (resolveOptions)', () => {
  const NOW = new Date('2026-10-13T10:00:00Z');
  const TODAY = '2026-10-13T06:00:00.000Z';
  const YESTERDAY = '2026-10-12T06:00:00.000Z';

  it('defaults to emulator + dry-run', () => {
    const o = resolveOptions([], { env: {}, now: NOW });
    expect(o).toMatchObject({
      target: 'emulator',
      dryRun: true,
      emulatorHost: DEFAULT_EMULATOR_HOST,
    });
  });

  it('only writes with --apply', () => {
    expect(resolveOptions(['--apply'], { env: {} }).dryRun).toBe(false);
    expect(resolveOptions(['--dry-run'], { env: {} }).dryRun).toBe(true);
    expect(() => resolveOptions(['--apply', '--dry-run'], { env: {} })).toThrow();
  });

  it('keeps a custom emulator host', () => {
    const o = resolveOptions([], { env: { FIRESTORE_EMULATOR_HOST: 'localhost:9999' } });
    expect(o.emulatorHost).toBe('localhost:9999');
  });

  it('reaches production only with --project spirieventsvbg', () => {
    const o = resolveOptions(['--project', 'spirieventsvbg'], { env: {}, now: NOW });
    expect(o).toMatchObject({ target: 'production', dryRun: true });
    expect(() => resolveOptions(['--project', 'other'], { env: {} })).toThrow(
      /Unbekanntes Projekt/
    );
    expect(() => resolveOptions(['--project'], { env: {} })).toThrow();
    expect(() => resolveOptions(['--prod'], { env: {} })).toThrow(/Unbekannte Option/);
  });

  it('refuses production while FIRESTORE_EMULATOR_HOST is set', () => {
    expect(() =>
      resolveOptions(['--project', 'spirieventsvbg'], {
        env: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8181' },
        backupExportedAt: TODAY,
        now: NOW,
      })
    ).toThrow(/unklares Ziel/);
  });

  it('production --apply needs a backup from today, or --force', () => {
    const prodApply = ['--project', 'spirieventsvbg', '--apply'];
    expect(() => resolveOptions(prodApply, { env: {}, backupExportedAt: null, now: NOW })).toThrow(
      /Kein Produktions-Backup von heute/
    );
    expect(() =>
      resolveOptions(prodApply, { env: {}, backupExportedAt: YESTERDAY, now: NOW })
    ).toThrow(/Kein Produktions-Backup von heute/);
    expect(resolveOptions(prodApply, { env: {}, backupExportedAt: TODAY, now: NOW })).toMatchObject(
      { target: 'production', dryRun: false, backupOk: true }
    );
    expect(
      resolveOptions([...prodApply, '--force'], { env: {}, backupExportedAt: null, now: NOW })
    ).toMatchObject({ target: 'production', dryRun: false, backupOk: false, force: true });
  });

  it('production dry-run works without a backup', () => {
    expect(
      resolveOptions(['--project', 'spirieventsvbg'], { env: {}, backupExportedAt: null, now: NOW })
    ).toMatchObject({ target: 'production', dryRun: true, backupOk: false });
  });

  it('snapshot mode is file-only and dry-run by default', () => {
    expect(resolveOptions(['--snapshot'], { env: {} })).toMatchObject({
      target: 'snapshot',
      dryRun: true,
    });
    expect(
      resolveOptions(['--snapshot', '--snapshot-dir', '/tmp/x', '--apply'], { env: {} })
    ).toMatchObject({ target: 'snapshot', dryRun: false, snapshotDir: '/tmp/x' });
    expect(() =>
      resolveOptions(['--snapshot', '--project', 'spirieventsvbg'], { env: {} })
    ).toThrow();
    expect(() => resolveOptions(['--snapshot-dir', '/tmp/x'], { env: {} })).toThrow();
  });
});

describe('isBackupFromToday (Europe/Vienna)', () => {
  it('compares Vienna calendar days', () => {
    const now = new Date('2026-10-13T10:00:00Z');
    expect(isBackupFromToday('2026-10-13T00:30:00Z', now)).toBe(true);
    // 22:30 UTC on Oct 12 is already Oct 13 in Vienna (CEST).
    expect(isBackupFromToday('2026-10-12T22:30:00Z', now)).toBe(true);
    expect(isBackupFromToday('2026-10-12T21:30:00Z', now)).toBe(false);
    expect(isBackupFromToday('garbage', now)).toBe(false);
    expect(isBackupFromToday(null, now)).toBe(false);
  });
});

describe('snapshot files', () => {
  it('adds regionId in the typed shape used by events.json', () => {
    const docs = [
      { id: 'a', status: { stringValue: 'approved' }, customDates: [] },
      { id: 'b', status: { stringValue: 'trashed' }, regionId: { stringValue: 'tirol' } },
      { id: 'c', status: { stringValue: 'draft' }, regionId: { nullValue: null } },
    ];
    const { docs: out, changed } = migrateSnapshotDocs(docs, 'event');
    expect(changed).toBe(2);
    expect(out[0]).toEqual({ ...docs[0], regionId: { stringValue: 'vorarlberg' } });
    expect(out[1]).toBe(docs[1]);
    expect(out[2].regionId).toEqual({ stringValue: 'vorarlberg' });
    expect(migrateSnapshotDocs(out, 'event').changed).toBe(0);
  });

  it('adds plain values to plain exports (scripts/export-firestore.mjs shape)', () => {
    const { docs: out } = migrateSnapshotDocs([{ id: 'a', status: 'approved' }], 'event');
    expect(out[0].regionId).toBe('vorarlberg');
    const users = migrateSnapshotDocs(
      [
        { id: 'u', listedInDirectory: true },
        { id: 'v', directoryRegionIds: ['wien'] },
      ],
      'profile'
    );
    expect(users.changed).toBe(1);
    expect(users.docs[0].directoryRegionIds).toEqual(['vorarlberg']);
    expect(migrateSnapshotDocs(users.docs, 'profile').changed).toBe(0);
  });

  it('adds typed directoryRegionIds to typed profile docs', () => {
    const { docs: out } = migrateSnapshotDocs(
      [{ id: 'u', listedInDirectory: { booleanValue: 'true' } }],
      'profile'
    );
    expect(out[0].directoryRegionIds).toEqual([{ stringValue: 'vorarlberg' }]);
    expect(migrateSnapshotDocs(out, 'profile').changed).toBe(0);
  });

  it('tolerates a non-array file', () => {
    expect(migrateSnapshotDocs(null, 'event')).toEqual({ docs: [], changed: 0 });
  });
});

// The migration write only adds regionId. The event triggers must treat that
// as "no status change": no Instagram post, no status mail.
describe('event triggers ignore the migration write', () => {
  const statuses = ['approved', 'pending', 'draft', 'rejected', 'trashed'];
  const owner = { email: 'owner@example.com', firstName: 'O', lastName: 'W' };

  it.each(statuses)('%s: no Instagram approval transition', (status) => {
    const before = { status, instagramConsent: true, organizer: owner };
    const after = { ...before, ...planEventUpdate(before).update };
    expect(isApprovalTransition(before, after)).toBe(false);
  });

  it.each(statuses)('%s: no status notification', (status) => {
    const before = { status, organizer: owner };
    const after = { ...before, regionId: 'vorarlberg' };
    expect(decideEventStatusNotification('e1', before, after, 'T', 'slug')).toBeNull();
  });

  it('publishApprovedEvent returns ignored without touching any dependency', async () => {
    const before = {
      status: 'approved',
      instagramConsent: true,
      title: 'Kakao',
      date: '2099-01-01',
      slug: 's',
    };
    const after = { ...before, regionId: 'vorarlberg' };
    const fail = () => {
      throw new Error('must not be called');
    };
    const deps = new Proxy({} as PublishDeps, { get: () => fail });
    await expect(publishApprovedEvent(deps, 'e1', before, after)).resolves.toBe('ignored');
  });
});
