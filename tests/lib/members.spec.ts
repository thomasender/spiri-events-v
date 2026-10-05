import { describe, it, expect } from 'vitest';
import {
  filterMembers,
  sortMembers,
  membersToCsv,
  membersToPrintHtml,
} from '../../src/utils/members';
import { buildMemberRow, validateMemberPatch } from '../../functions/src/adminMembers';

const base = {
  emailVerified: true,
  photoURL: '',
  slug: '',
  listedInDirectory: false,
  directoryHidden: false,
  directoryCategories: [] as string[],
  directoryRegions: [] as string[],
  createdAt: '2026-01-02T00:00:00.000Z',
  lastSignInAt: null,
  disabled: false,
};
const members = [
  {
    ...base,
    uid: 'a',
    displayName: 'Änne Müller',
    username: 'anne',
    email: 'anne@x.at',
    directoryRegions: ['Dornbirn'],
    directoryCategories: ['Yoga'],
    slug: 'anne',
  },
  {
    ...base,
    uid: 'b',
    displayName: 'Bernd',
    username: '',
    email: 'bernd@y.at',
    directoryRegions: ['Bregenz'],
    directoryCategories: ['Tanz'],
  },
  { ...base, uid: 'c', displayName: '=SUM(A1)', username: 'zed', email: 'c@z.at' },
];

describe('filterMembers', () => {
  it('searches name, username and email, ignoring case and accents', () => {
    expect(filterMembers(members, { search: 'anne' }).map((m) => m.uid)).toEqual(['a']);
    expect(filterMembers(members, { search: 'muller' }).map((m) => m.uid)).toEqual(['a']);
    expect(filterMembers(members, { search: 'Y.AT' }).map((m) => m.uid)).toEqual(['b']);
  });
  it('filters by region, category and list', () => {
    expect(filterMembers(members, { region: 'Bregenz' }).map((m) => m.uid)).toEqual(['b']);
    expect(filterMembers(members, { category: 'Yoga' }).map((m) => m.uid)).toEqual(['a']);
    expect(filterMembers(members, { listUids: new Set(['c']) }).map((m) => m.uid)).toEqual(['c']);
  });
});

describe('sortMembers', () => {
  it('sorts by key and keeps empty values last in both directions', () => {
    expect(sortMembers(members, 'username', 'asc').map((m) => m.uid)).toEqual(['a', 'c', 'b']);
    expect(sortMembers(members, 'username', 'desc').map((m) => m.uid)).toEqual(['c', 'a', 'b']);
  });
});

describe('exports', () => {
  it('neutralises spreadsheet formulas and escapes quotes in CSV', () => {
    const csv = membersToCsv([{ ...members[2], displayName: '=SUM(A1) "x"' }], 'https://t.at');
    expect(csv).toContain(`"'=SUM(A1) ""x"""`);
  });
  it('includes the profile link in the CSV', () => {
    expect(membersToCsv([members[0]], 'https://t.at')).toContain('https://t.at/anne');
  });
  it('escapes HTML in the printable document', () => {
    const html = membersToPrintHtml([{ ...members[0], displayName: '<script>x</script>' }]);
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('buildMemberRow', () => {
  it('merges the auth record with the public profile', () => {
    const row = buildMemberRow(
      {
        uid: 'u1',
        email: 'a@b.at',
        emailVerified: true,
        metadata: { creationTime: '2026-03-01T10:00:00Z' },
      },
      { displayName: 'Anna', directoryRegions: ['Dornbirn', 5], listedInDirectory: true }
    );
    expect(row).toMatchObject({
      uid: 'u1',
      email: 'a@b.at',
      displayName: 'Anna',
      listedInDirectory: true,
    });
    expect(row.directoryRegions).toEqual(['Dornbirn']);
    expect(row.createdAt).toBe('2026-03-01T10:00:00.000Z');
  });
});

describe('validateMemberPatch', () => {
  it('accepts whitelisted fields only', () => {
    expect(validateMemberPatch({ displayName: ' Anna ', directoryRegions: ['Dornbirn'] })).toEqual({
      displayName: 'Anna',
      directoryRegions: ['Dornbirn'],
    });
    expect(validateMemberPatch({ directoryRegions: ['Online'] })).toEqual({
      directoryRegions: ['Online'],
    });
    expect(() => validateMemberPatch({ email: 'x@y.at' })).toThrow();
    expect(() => validateMemberPatch({ directoryRegions: ['Wien'] })).toThrow();
    expect(() => validateMemberPatch({ displayName: '' })).toThrow();
    expect(() => validateMemberPatch({})).toThrow();
  });
});
