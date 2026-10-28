import { describe, it, expect } from 'vitest';
import { buildRevisionDraft, computeEventChanges } from '../../functions/src/eventRevisions';
import {
  buildEditAlertFields,
  pickResponsibleStaff,
  shouldNotifyAdminsOfEdit,
} from '../../functions/src/eventEditNotice';

describe('computeEventChanges', () => {
  it('returns only changed fields as from/to', () => {
    const changes = computeEventChanges(
      { title: 'Yoga', place: 'Bregenz', time: '18:00' },
      { title: 'Yoga Flow', place: 'Bregenz', time: '18:00' }
    );
    expect(changes).toEqual({ title: { from: 'Yoga', to: 'Yoga Flow' } });
  });

  it('ignores bookkeeping fields', () => {
    const changes = computeEventChanges(
      { title: 'A', updatedAt: 1, favoriteCount: 2, slug: 'a', approvedAt: 1 },
      { title: 'A', updatedAt: 2, favoriteCount: 3, slug: 'a-2', approvedAt: 2 }
    );
    expect(changes).toEqual({});
  });

  it('treats missing, null and empty values as equal', () => {
    expect(
      computeEventChanges(
        { feeNote: '', customDates: [] },
        { feeNote: null, customDates: undefined }
      )
    ).toEqual({});
  });

  it('detects nested object and array changes', () => {
    const changes = computeEventChanges(
      { organizer: { firstName: 'A', lastName: 'B' }, customDates: ['2026-01-01'] },
      { organizer: { lastName: 'B', firstName: 'C' }, customDates: ['2026-01-01', '2026-01-08'] }
    );
    expect(Object.keys(changes).sort()).toEqual(['customDates', 'organizer']);
  });

  it('converts timestamps to ISO strings', () => {
    const ts = { toMillis: () => Date.UTC(2026, 0, 1) };
    const changes = computeEventChanges({ x: null }, { x: ts });
    expect(changes.x.to).toBe('2026-01-01T00:00:00.000Z');
  });

  it('records added fields', () => {
    expect(computeEventChanges({}, { link: 'https://a.at' })).toEqual({
      link: { from: null, to: 'https://a.at' },
    });
  });
});

describe('buildRevisionDraft', () => {
  it('returns null when nothing relevant changed', () => {
    expect(
      buildRevisionDraft({ status: 'pending', updatedAt: 1 }, { status: 'pending', updatedAt: 2 })
    ).toBeNull();
  });

  it('records a pure status transition without changes', () => {
    expect(
      buildRevisionDraft({ status: 'pending' }, { status: 'approved', approvedAt: 5 })
    ).toEqual({
      statusFrom: 'pending',
      statusTo: 'approved',
      changes: {},
    });
  });

  it('keeps status out of the field changes', () => {
    const draft = buildRevisionDraft(
      { status: 'approved', title: 'A' },
      { status: 'pending', title: 'B' }
    );
    expect(draft?.statusFrom).toBe('approved');
    expect(draft?.statusTo).toBe('pending');
    expect(Object.keys(draft?.changes ?? {})).toEqual(['title']);
  });
});

describe('shouldNotifyAdminsOfEdit', () => {
  const decide = (
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    role: 'Admin' | 'User' | 'System' = 'User'
  ) =>
    shouldNotifyAdminsOfEdit(before, after, role, buildRevisionDraft(before, after)?.changes ?? {});

  it('alerts when an organizer changes content of a pending event', () => {
    expect(decide({ status: 'pending', title: 'A' }, { status: 'pending', title: 'B' })).toBe(
      'edited'
    );
  });

  it('ignores bookkeeping-only updates of a pending event', () => {
    expect(
      decide(
        { status: 'pending', title: 'A', updatedAt: 1 },
        { status: 'pending', title: 'A', updatedAt: 2, slug: 'x' }
      )
    ).toBeNull();
  });

  it('does not alert for admin or system edits', () => {
    const b = { status: 'pending', title: 'A' };
    const a = { status: 'pending', title: 'B' };
    expect(decide(b, a, 'Admin')).toBeNull();
    expect(decide(b, a, 'System')).toBeNull();
  });

  it('does not alert for approved or trashed events', () => {
    expect(
      decide({ status: 'approved', title: 'A' }, { status: 'approved', title: 'B' })
    ).toBeNull();
    expect(decide({ status: 'trashed', title: 'A' }, { status: 'trashed', title: 'B' })).toBeNull();
    expect(
      decide({ status: 'approved', title: 'A' }, { status: 'pending', title: 'B' })
    ).toBeNull();
  });

  it('alerts on a re-submission from draft, even without content changes', () => {
    expect(decide({ status: 'draft', title: 'A' }, { status: 'pending', title: 'A' })).toBe(
      'resubmitted'
    );
  });

  it('does not alert when a user moves a pending event back to draft', () => {
    expect(decide({ status: 'pending', title: 'A' }, { status: 'draft', title: 'A' })).toBeNull();
  });
});

describe('buildEditAlertFields', () => {
  it('starts a new alert unread with the number of changed fields', () => {
    expect(
      buildEditAlertFields(undefined, { triggerId: 't1', kind: 'edited', changeCount: 3 })
    ).toEqual({ kind: 'edited', read: false, changeCount: 3, lastTriggerId: 't1' });
  });

  it('counts a re-submission without content changes as one', () => {
    expect(
      buildEditAlertFields(undefined, { triggerId: 't1', kind: 'resubmitted', changeCount: 0 })
        ?.changeCount
    ).toBe(1);
  });

  it('keeps one alert per event: a further edit raises the counter and makes it unread again', () => {
    const next = buildEditAlertFields(
      { read: true, changeCount: 2, lastTriggerId: 't1' },
      { triggerId: 't2', kind: 'edited', changeCount: 1 }
    );
    expect(next).toMatchObject({ read: false, changeCount: 3, lastTriggerId: 't2' });
  });

  it('does not count a retried delivery of the same trigger twice', () => {
    expect(
      buildEditAlertFields(
        { read: false, changeCount: 2, lastTriggerId: 't1' },
        { triggerId: 't1', kind: 'edited', changeCount: 1 }
      )
    ).toBeNull();
  });
});

describe('pickResponsibleStaff', () => {
  const messages = [
    { authorRole: 'User', authorUid: 'owner', atMs: 1 },
    { authorRole: 'Admin', authorUid: 'ben', atMs: 30 },
    { authorRole: 'Admin', authorUid: 'anna', atMs: 20 },
  ];
  const reverts = [
    { statusFrom: 'pending', statusTo: 'draft', by: 'carla', atMs: 10 },
    { statusFrom: 'pending', statusTo: 'draft', by: 'dora', atMs: 40 },
    // The organizer pulling her own event back is no change request.
    { statusFrom: 'pending', statusTo: 'draft', by: 'owner', atMs: 50 },
  ];

  it('an edit during "In Klärung" goes to whoever wrote the first staff message', () => {
    expect(
      pickResponsibleStaff({ kind: 'edited', ownerUid: 'owner', messages, revisions: reverts })
    ).toBe('anna');
  });

  it('a re-submission goes to whoever sent it back to draft last', () => {
    expect(
      pickResponsibleStaff({ kind: 'resubmitted', ownerUid: 'owner', messages, revisions: reverts })
    ).toBe('dora');
  });

  it('falls back to the other kind of request', () => {
    expect(
      pickResponsibleStaff({ kind: 'resubmitted', ownerUid: 'owner', messages, revisions: [] })
    ).toBe('anna');
    expect(
      pickResponsibleStaff({ kind: 'edited', ownerUid: 'owner', messages: [], revisions: reverts })
    ).toBe('dora');
  });

  it('is null when nobody asked for a change (then every admin is alerted)', () => {
    expect(
      pickResponsibleStaff({
        kind: 'edited',
        ownerUid: 'owner',
        messages: [{ authorRole: 'User', authorUid: 'owner', atMs: 1 }],
        revisions: [{ statusFrom: 'pending', statusTo: 'draft', by: 'owner', atMs: 2 }],
      })
    ).toBeNull();
  });
});
