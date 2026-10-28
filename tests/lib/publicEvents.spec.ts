import { describe, expect, it } from 'vitest';
import {
  changesOnlineListing,
  changesPublicList,
  nextVersion,
  parseVersionParam,
  toPublicEvent,
} from '../../functions/src/publicEventsLogic';

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe('parseVersionParam', () => {
  it('accepts only a single numeric v', () => {
    expect(parseVersionParam({ v: '1760990000000' })).toBe(1760990000000);
    expect(parseVersionParam({})).toBeNull();
    expect(parseVersionParam({ v: 'abc' })).toBeNull();
    expect(parseVersionParam({ v: ['1', '2'] })).toBeNull();
    expect(parseVersionParam({ v: '1', bust: 'x' })).toBeNull();
    expect(parseVersionParam({ v: '12345678901234567' })).toBeNull();
  });
});

describe('toPublicEvent', () => {
  it('drops owner uid and organizer e-mail, converts timestamps, adds id', () => {
    const out = toPublicEvent('e1', {
      title: 'Yoga',
      createdBy: 'uid1',
      organizer: { name: 'Anna', email: 'a@b.at' },
      updatedAt: ts('2026-10-20T10:00:00.000Z'),
    });
    expect(out).toEqual({
      id: 'e1',
      title: 'Yoga',
      organizer: { name: 'Anna' },
      updatedAt: '2026-10-20T10:00:00.000Z',
    });
  });
});

describe('changesPublicList', () => {
  const approved = { status: 'approved', title: 'A', createdBy: 'u' };

  it('ignores events that are not approved before or after', () => {
    expect(changesPublicList('e', { status: 'pending' }, { status: 'draft' })).toBe(false);
  });
  it('detects approval, un-approval, creation and deletion of approved events', () => {
    expect(changesPublicList('e', { status: 'pending' }, approved)).toBe(true);
    expect(changesPublicList('e', approved, { status: 'trashed' })).toBe(true);
    expect(changesPublicList('e', undefined, approved)).toBe(true);
    expect(changesPublicList('e', approved, undefined)).toBe(true);
  });
  it('detects edits to an approved event but not changes invisible to the public', () => {
    expect(changesPublicList('e', approved, { ...approved, title: 'B' })).toBe(true);
    expect(changesPublicList('e', approved, { ...approved, createdBy: 'other' })).toBe(false);
    expect(changesPublicList('e', approved, { ...approved })).toBe(false);
  });
});

describe('nextVersion', () => {
  it('uses the clock but never goes backwards or repeats', () => {
    expect(nextVersion(undefined, 100)).toBe(100);
    expect(nextVersion(50, 100)).toBe(100);
    expect(nextVersion(100, 100)).toBe(101);
    expect(nextVersion(200, 100)).toBe(201);
  });
});

describe('changesOnlineListing', () => {
  it('only listing fields that decide where online events show count', () => {
    const before = { displayName: 'Anna', listedInDirectory: true, directoryRegions: ['Bregenz'] };
    expect(changesOnlineListing(before, { ...before, displayName: 'Anna B' })).toBe(false);
    expect(changesOnlineListing(before, { ...before, directoryRegions: ['Dornbirn'] })).toBe(true);
    expect(changesOnlineListing(before, { ...before, directoryHidden: true })).toBe(true);
    expect(changesOnlineListing(before, { ...before, directoryRegionIds: ['tirol'] })).toBe(true);
    expect(changesOnlineListing(undefined, before)).toBe(true);
    expect(changesOnlineListing(undefined, undefined)).toBe(false);
  });
});
