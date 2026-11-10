import { describe, it, expect } from 'vitest';
import {
  actorRoleFromStaffDoc,
  buildBackfillEntries,
  buildModerationLogEntry,
  classifyModerationAction,
} from '../../functions/src/moderationLog';

const mod = { uid: 'm1', name: 'Mia Moderatorin', role: 'RegionModerator' as const };

describe('classifyModerationAction', () => {
  it.each([
    ['pending', 'approved', {}, 'approved'],
    ['pending', 'draft', {}, 'returned'],
    ['approved', 'draft', {}, 'unpublished'],
    ['pending', 'trashed', { trashKind: 'rejected' }, 'rejected'],
    ['pending', 'trashed', {}, 'trashed'],
    ['approved', 'trashed', { trashKind: null }, 'trashed'],
    ['trashed', 'draft', {}, 'restored'],
    ['draft', 'pending', {}, 'submitted'],
    ['trashed', 'pending', {}, 'submitted'],
    ['draft', 'archived', {}, 'status'],
  ])('%s -> %s is %s', (from, to, extra, expected) => {
    expect(
      classifyModerationAction({
        kind: 'update',
        before: { status: from },
        after: { status: to, ...extra },
      })
    ).toBe(expected);
  });

  it('logs edits of submitted and approved events, not of drafts', () => {
    const edit = (status: string) =>
      classifyModerationAction({
        kind: 'update',
        before: { status },
        after: { status },
        changedFields: ['title'],
      });
    expect(edit('approved')).toBe('edited');
    expect(edit('pending')).toBe('edited');
    expect(edit('draft')).toBeNull();
  });

  it('a cancellation is its own action', () => {
    expect(
      classifyModerationAction({
        kind: 'update',
        before: { status: 'approved', cancelled: false },
        after: { status: 'approved', cancelled: true },
        changedFields: ['cancelled'],
      })
    ).toBe('cancelled');
  });

  it('creating: submitted or approved right away, drafts are not logged', () => {
    expect(classifyModerationAction({ kind: 'create', after: { status: 'pending' } })).toBe(
      'submitted'
    );
    expect(classifyModerationAction({ kind: 'create', after: { status: 'approved' } })).toBe(
      'approved'
    );
    expect(classifyModerationAction({ kind: 'create', after: { status: 'draft' } })).toBeNull();
  });

  it('nothing changed: nothing to log', () => {
    expect(
      classifyModerationAction({
        kind: 'update',
        before: { status: 'approved' },
        after: { status: 'approved' },
      })
    ).toBeNull();
  });
});

describe('buildModerationLogEntry', () => {
  it('denormalises event, region and person', () => {
    const entry = buildModerationLogEntry({
      kind: 'update',
      eventId: 'e1',
      before: { status: 'pending', title: 'Yoga', regionId: 'tirol', createdBy: 'o1' },
      after: {
        status: 'approved',
        title: 'Yoga',
        slug: 'yoga',
        date: '2026-12-01',
        regionId: 'tirol',
        createdBy: 'o1',
      },
      changedFields: [],
      actor: mod,
    });
    expect(entry).toEqual({
      action: 'approved',
      eventId: 'e1',
      eventTitle: 'Yoga',
      eventSlug: 'yoga',
      eventDate: '2026-12-01',
      regionId: 'tirol',
      ownerUid: 'o1',
      statusFrom: 'pending',
      statusTo: 'approved',
      changedFields: [],
      reason: null,
      actorUid: 'm1',
      actorName: 'Mia Moderatorin',
      actorRole: 'RegionModerator',
      byStaff: true,
      source: 'trigger',
    });
  });

  it('events without regionId belong to Vorarlberg', () => {
    const entry = buildModerationLogEntry({
      kind: 'delete',
      eventId: 'e2',
      before: { status: 'trashed', title: 'Alt' },
      actor: { uid: null, name: null, role: 'System' },
    });
    expect(entry).toMatchObject({
      action: 'deleted',
      regionId: 'vorarlberg',
      statusFrom: 'trashed',
      statusTo: null,
      byStaff: false,
    });
  });

  it('keeps the rejection reason, shortened', () => {
    const entry = buildModerationLogEntry({
      kind: 'update',
      eventId: 'e3',
      before: { status: 'pending' },
      after: { status: 'trashed', trashKind: 'rejected', trashReason: 'x'.repeat(900) },
      actor: mod,
    });
    expect(entry?.action).toBe('rejected');
    expect(entry?.reason).toHaveLength(500);
  });

  it('organizer edits are logged but not as staff', () => {
    const entry = buildModerationLogEntry({
      kind: 'update',
      eventId: 'e4',
      before: { status: 'pending', title: 'A' },
      after: { status: 'pending', title: 'B' },
      changedFields: ['title'],
      actor: { uid: 'o1', name: 'Olga', role: 'User' },
    });
    expect(entry).toMatchObject({ action: 'edited', changedFields: ['title'], byStaff: false });
  });
});

describe('actorRoleFromStaffDoc', () => {
  it('maps the admin_users doc', () => {
    expect(actorRoleFromStaffDoc('a', { role: 'Admin' })).toBe('Admin');
    expect(actorRoleFromStaffDoc('a', { role: 'RegionModerator', regionIds: ['tirol'] })).toBe(
      'RegionModerator'
    );
    expect(actorRoleFromStaffDoc('a', undefined)).toBe('User');
    expect(actorRoleFromStaffDoc(null, { role: 'Admin' })).toBe('System');
  });
});

describe('buildBackfillEntries', () => {
  const ts = (iso: string) => ({ toMillis: () => new Date(iso).getTime() });
  const people = {
    m1: { name: 'Mia', staffDoc: { role: 'RegionModerator', regionIds: ['tirol'] } },
    a1: { name: 'Peter', staffDoc: { role: 'Admin' } },
  };

  it('turns revisions into entries with the revision id, skipping draft edits', () => {
    const entries = buildBackfillEntries(
      'e1',
      { status: 'approved', title: 'Yoga', regionId: 'tirol' },
      [
        {
          id: 'r0',
          atMs: 1,
          by: 'o1',
          byName: 'Olga',
          statusFrom: 'draft',
          statusTo: 'draft',
          changes: { title: {} },
        },
        { id: 'r1', atMs: 2, by: 'o1', byName: 'Olga', statusFrom: 'draft', statusTo: 'pending' },
        {
          id: 'r2',
          atMs: 3,
          by: 'm1',
          byName: 'Mia M.',
          statusFrom: 'pending',
          statusTo: 'approved',
        },
      ],
      people
    );
    expect(entries.map((e) => [e.id, e.action, e.actorRole, e.source])).toEqual([
      ['r1', 'submitted', 'User', 'backfill'],
      ['r2', 'approved', 'RegionModerator', 'backfill'],
    ]);
    expect(entries[1].actorName).toBe('Mia M.');
    expect(entries[1].atMs).toBe(3);
  });

  it('uses approvedBy/approvedAt when no revision records the approval', () => {
    const entries = buildBackfillEntries(
      'e2',
      {
        status: 'approved',
        title: 'Alt',
        approvedBy: 'a1',
        approvedAt: ts('2026-01-05T10:00:00Z'),
      },
      [],
      people
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 'approved-e2',
      action: 'approved',
      actorName: 'Peter',
      actorRole: 'Admin',
      regionId: 'vorarlberg',
    });
  });

  it('a rejection is recognised for the current trash state only', () => {
    const entries = buildBackfillEntries(
      'e3',
      {
        status: 'trashed',
        trashKind: 'rejected',
        trashReason: 'Spam',
        trashedBy: 'm1',
        trashedAt: ts('2026-02-01T00:00:00Z'),
      },
      [
        { id: 'r1', atMs: 1, by: 'm1', statusFrom: 'pending', statusTo: 'trashed' },
        { id: 'r2', atMs: 2, by: 'm1', statusFrom: 'trashed', statusTo: 'draft' },
        { id: 'r3', atMs: 3, by: 'o1', statusFrom: 'draft', statusTo: 'pending' },
        { id: 'r4', atMs: 4, by: 'm1', statusFrom: 'pending', statusTo: 'trashed' },
      ],
      people
    );
    expect(entries.map((e) => [e.id, e.action, e.reason])).toEqual([
      ['r1', 'trashed', null],
      ['r2', 'restored', null],
      ['r3', 'submitted', null],
      ['r4', 'rejected', 'Spam'],
    ]);
  });
});
