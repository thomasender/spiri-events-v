import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EMULATOR_HOST,
  MAX_BATCH_SIZE,
  REGION_MIGRATION_MARKER_PATH,
  buildMigrationMarker,
  chunk,
  decideMigrationMarker,
  isBackupFromToday,
  migrateSnapshotDocs,
  planEventUpdate,
  planMigration,
  planProfileUpdate,
  planRevert,
  planRevertDoc,
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
    // Former regions (Allgäu pilot, Germany) are reported, never rewritten.
    expect(planEventUpdate({ regionId: 'allgaeu' })).toEqual({ kind: 'invalid', value: 'allgaeu' });
    expect(planEventUpdate({ regionId: 'bayern' })).toEqual({ kind: 'invalid', value: 'bayern' });
    expect(planProfileUpdate({ directoryRegionIds: ['bayern', 'tirol'] })).toEqual({
      kind: 'invalid',
      value: ['bayern', 'tirol'],
    });
    expect(planEventUpdate({ regionId: 5 })).toEqual({ kind: 'invalid', value: 5 });
    // "Österreich" is a combined view, not a region.
    expect(planEventUpdate({ regionId: 'oesterreich' })).toEqual({
      kind: 'invalid',
      value: 'oesterreich',
    });
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
    expect(planProfileUpdate({ directoryRegionIds: ['vorarlberg', 'oesterreich'] }).kind).toBe(
      'invalid'
    );
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

describe('completion marker (app_settings/regionMigration)', () => {
  const event = (id: string, data: Record<string, unknown>) => ({
    path: `events/${id}`,
    type: 'event' as const,
    data,
  });
  const profile = (id: string, data: Record<string, unknown>) => ({
    path: `users/${id}/publicProfile/data`,
    type: 'profile' as const,
    data,
  });

  it('lives where the app reads it', () => {
    expect(REGION_MIGRATION_MARKER_PATH).toBe('app_settings/regionMigration');
  });

  it('is written only when the control read finds nothing open and nothing invalid', () => {
    const done = planMigration([
      event('a', { regionId: 'vorarlberg' }),
      event('b', { regionId: 'tirol', isOnline: true }),
      profile('u', { directoryRegionIds: ['vorarlberg'] }),
    ]);
    expect(decideMigrationMarker(done)).toMatchObject({ write: true });

    // one event still without regionId (e.g. created in between): no marker
    const open = planMigration([event('a', { regionId: 'vorarlberg' }), event('new', {})]);
    expect(decideMigrationMarker(open)).toMatchObject({ write: false });

    // a profile without ids would be missing from the directory query
    expect(
      decideMigrationMarker(planMigration([profile('u', { listedInDirectory: true })]))
    ).toMatchObject({ write: false });

    // invalid values: the app reads them differently from what a query matches
    for (const bad of [{ regionId: 'mars' }, { regionId: 7 }]) {
      expect(decideMigrationMarker(planMigration([event('x', bad)]))).toMatchObject({
        write: false,
      });
    }
    expect(
      decideMigrationMarker(planMigration([profile('u', { directoryRegionIds: ['mars'] })]))
    ).toMatchObject({ write: false });
  });

  it('a migration run followed by its control read allows the marker', () => {
    const docs = [event('a', { status: 'approved' }), profile('u', { listedInDirectory: true })];
    const first = planMigration(docs);
    expect(decideMigrationMarker(first).write).toBe(false);
    expect(decideMigrationMarker(planMigration(applyPlan(docs, first.updates))).write).toBe(true);
  });

  it('no plan, no marker', () => {
    expect(decideMigrationMarker(null).write).toBe(false);
    expect(decideMigrationMarker({}).write).toBe(false);
  });

  it('marker content: complete flag, timestamp, number of checked docs', () => {
    const plan = planMigration([event('a', { regionId: 'vorarlberg' })]);
    expect(buildMigrationMarker(plan, 'TS')).toEqual({
      complete: true,
      completedAt: 'TS',
      checkedDocs: 1,
    });
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

describe('staging target (resolveOptions)', () => {
  const NOW = new Date('2026-10-13T10:00:00Z');

  it('accepts tribe-vbg-staging as the second real project, dry-run by default', () => {
    expect(resolveOptions(['--project', 'tribe-vbg-staging'], { env: {}, now: NOW })).toMatchObject(
      { target: 'staging', projectId: 'tribe-vbg-staging', dryRun: true }
    );
  });

  it('staging --apply needs no backup and no --force', () => {
    const o = resolveOptions(['--project', 'tribe-vbg-staging', '--apply'], {
      env: {},
      backupExportedAt: null,
      now: NOW,
    });
    expect(o).toMatchObject({ target: 'staging', dryRun: false });
    expect(o).not.toHaveProperty('backupOk');
  });

  it('refuses everything that is neither production nor staging', () => {
    for (const id of ['tribe-vbg', 'tribe-vbg-staging2', 'demo-test', 'SPIRIEVENTSVBG']) {
      expect(() => resolveOptions(['--project', id], { env: {} })).toThrow(/Unbekanntes Projekt/);
    }
  });

  it('refuses an ambiguous environment for staging too', () => {
    const staging = ['--project', 'tribe-vbg-staging'];
    expect(() =>
      resolveOptions(staging, { env: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8181' } })
    ).toThrow(/unklares Ziel/);
    expect(() => resolveOptions(staging, { env: { GCLOUD_PROJECT: 'spirieventsvbg' } })).toThrow(
      /unklares Ziel/
    );
    expect(() =>
      resolveOptions(['--project', 'spirieventsvbg'], {
        env: { GOOGLE_CLOUD_PROJECT: 'tribe-vbg-staging' },
      })
    ).toThrow(/unklares Ziel/);
    expect(resolveOptions(staging, { env: { GCLOUD_PROJECT: 'tribe-vbg-staging' } }).target).toBe(
      'staging'
    );
  });

  it('production keeps its project id and backup guard', () => {
    expect(resolveOptions(['--project', 'spirieventsvbg'], { env: {}, now: NOW }).projectId).toBe(
      'spirieventsvbg'
    );
    expect(resolveOptions([], { env: {} }).projectId).toBe('spirieventsvbg');
  });
});

describe('--revert (resolveOptions)', () => {
  const NOW = new Date('2026-10-13T10:00:00Z');
  const TODAY = '2026-10-13T06:00:00.000Z';

  it('is dry-run by default on every target', () => {
    expect(resolveOptions(['--revert'], { env: {} })).toMatchObject({
      target: 'emulator',
      revert: true,
      dryRun: true,
    });
    expect(
      resolveOptions(['--revert', '--project', 'tribe-vbg-staging'], { env: {} })
    ).toMatchObject({ target: 'staging', revert: true, dryRun: true });
    expect(
      resolveOptions(['--revert', '--project', 'spirieventsvbg'], { env: {}, now: NOW })
    ).toMatchObject({ target: 'production', revert: true, dryRun: true });
  });

  it('has the same production backup guard as the migration', () => {
    const args = ['--revert', '--project', 'spirieventsvbg', '--apply'];
    expect(() => resolveOptions(args, { env: {}, backupExportedAt: null, now: NOW })).toThrow(
      /Kein Produktions-Backup von heute/
    );
    expect(resolveOptions(args, { env: {}, backupExportedAt: TODAY, now: NOW })).toMatchObject({
      revert: true,
      dryRun: false,
    });
    expect(
      resolveOptions(['--revert', '--project', 'tribe-vbg-staging', '--apply'], { env: {} })
    ).toMatchObject({ target: 'staging', revert: true, dryRun: false });
  });

  it('is not available for snapshot files', () => {
    expect(() => resolveOptions(['--revert', '--snapshot'], { env: {} })).toThrow(/--revert/);
  });
});

describe('planRevertDoc / planRevert', () => {
  it('reverts exactly the migration values', () => {
    expect(planRevertDoc('event', { status: 'approved', regionId: 'vorarlberg' })).toEqual({
      kind: 'revert',
      field: 'regionId',
    });
    expect(planRevertDoc('profile', { directoryRegionIds: ['vorarlberg'] })).toEqual({
      kind: 'revert',
      field: 'directoryRegionIds',
    });
  });

  it('leaves any other value alone and reports it', () => {
    const different: Array<['event' | 'profile', Record<string, unknown>]> = [
      ['event', { regionId: 'tirol' }],
      ['event', { regionId: 'Vorarlberg' }],
      ['event', { regionId: null }],
      ['event', { regionId: '' }],
      ['event', { regionId: ['vorarlberg'] }],
      ['profile', { directoryRegionIds: ['vorarlberg', 'tirol'] }],
      ['profile', { directoryRegionIds: ['tirol', 'vorarlberg'] }],
      ['profile', { directoryRegionIds: ['tirol'] }],
      ['profile', { directoryRegionIds: [] }],
      ['profile', { directoryRegionIds: 'vorarlberg' }],
      ['profile', { directoryRegionIds: null }],
    ];
    for (const [type, data] of different) {
      const plan = planRevertDoc(type, data);
      expect(plan.kind).toBe('different');
    }
  });

  it('counts docs without the field as already reverted', () => {
    expect(planRevertDoc('event', { status: 'draft' })).toEqual({ kind: 'missing' });
    expect(planRevertDoc('profile', { directoryRegions: ['Bregenz'] })).toEqual({
      kind: 'missing',
    });
    expect(planRevertDoc('event', undefined)).toEqual({ kind: 'missing' });
  });

  it('plans a mixed set: reverted / different / missing', () => {
    const docs = [
      { path: 'events/a', type: 'event' as const, data: { regionId: 'vorarlberg' } },
      { path: 'events/b', type: 'event' as const, data: { regionId: 'tirol' } },
      { path: 'events/c', type: 'event' as const, data: { status: 'approved' } },
      { path: 'users/u1', type: 'profile' as const, data: { directoryRegionIds: ['vorarlberg'] } },
      {
        path: 'users/u1/publicProfile/data',
        type: 'profile' as const,
        data: { directoryRegionIds: ['vorarlberg'] },
      },
      { path: 'users/u2', type: 'profile' as const, data: { directoryRegionIds: ['wien'] } },
      { path: 'users/u3', type: 'profile' as const, data: {} },
    ];
    const plan = planRevert(docs);
    expect(plan.total).toBe(7);
    expect(plan.reverts).toEqual([
      { path: 'events/a', type: 'event', field: 'regionId' },
      { path: 'users/u1', type: 'profile', field: 'directoryRegionIds' },
      { path: 'users/u1/publicProfile/data', type: 'profile', field: 'directoryRegionIds' },
    ]);
    expect(plan.different).toEqual([
      { path: 'events/b', type: 'event', value: 'tirol' },
      { path: 'users/u2', type: 'profile', value: ['wien'] },
    ]);
    expect(plan.missing).toBe(2);
  });

  it('migrate -> revert restores the original docs and is idempotent', () => {
    const original = [
      ...EVENT_SHAPES.map(([label, data], i) => ({
        path: `events/e${i}`,
        type: 'event' as const,
        data: { ...data, title: label },
      })),
      { path: 'events/t', type: 'event' as const, data: { status: 'approved', regionId: 'tirol' } },
      { path: 'users/u1', type: 'profile' as const, data: { listedInDirectory: true } },
      { path: 'users/u2', type: 'profile' as const, data: { directoryRegionIds: ['wien'] } },
    ];
    const migrated = applyPlan(original, planMigration(original).updates);
    const plan = planRevert(migrated);
    expect(plan.reverts).toHaveLength(EVENT_SHAPES.length + 1);
    const removed = new Map(plan.reverts.map((r) => [r.path, r.field]));
    const reverted = migrated.map((d) => {
      const field = removed.get(d.path);
      if (!field) return d;
      const data = { ...d.data };
      delete data[field];
      return { ...d, data };
    });
    expect(reverted).toEqual(original);
    const second = planRevert(reverted);
    expect(second.reverts).toEqual([]);
    expect(second.missing).toBe(EVENT_SHAPES.length + 1);
    expect(second.different).toHaveLength(2);
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
