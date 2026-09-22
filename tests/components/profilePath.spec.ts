import { describe, it, expect } from 'vitest';
import {
  getOrganizerProfilePath,
  splitProfileData,
  PUBLIC_PROFILE_FIELDS,
  deriveOrganizerSlug,
  resolveOrganizerProfilePath,
} from '../../src/utils/profile';

describe('getOrganizerProfilePath', () => {
  it('builds a path at the root level for a given slug', () => {
    expect(getOrganizerProfilePath('anna-schmidt')).toBe('/anna-schmidt');
  });

  it('returns null for empty or non-string input', () => {
    expect(getOrganizerProfilePath('')).toBeNull();
    expect(getOrganizerProfilePath(null)).toBeNull();
    expect(getOrganizerProfilePath(undefined)).toBeNull();
    expect(getOrganizerProfilePath(123)).toBeNull();
  });
});

describe('splitProfileData', () => {
  it('puts slug in the public subdoc alongside the other public fields', () => {
    expect(PUBLIC_PROFILE_FIELDS).toContain('slug');
    const { publicDoc, privateDoc } = splitProfileData({
      displayName: 'Anna',
      bio: 'bio',
      website: 'https://x',
      photoURL: 'p',
      slug: 'anna',
      contact: 'secret',
    });
    expect(publicDoc).toEqual({
      displayName: 'Anna',
      bio: 'bio',
      website: 'https://x',
      photoURL: 'p',
      slug: 'anna',
    });
    expect(privateDoc).toEqual({ contact: 'secret' });
  });
});

describe('deriveOrganizerSlug (LjqWg0mD)', () => {
  it('slugifies firstName + lastName from a legacy organizer object', () => {
    expect(deriveOrganizerSlug({ firstName: 'Anna', lastName: 'Schmidt', email: 'a@x.com' })).toBe(
      'anna-schmidt'
    );
  });

  it('handles umlauts in the same way as profile slug generation', () => {
    expect(deriveOrganizerSlug({ firstName: 'Lukas', lastName: 'Müller', email: 'l@x.com' })).toBe(
      'lukas-mueller'
    );
  });

  it('prefers organizer.name when present and non-empty', () => {
    expect(
      deriveOrganizerSlug({
        firstName: 'Anna',
        lastName: 'Schmidt',
        name: '  Anna M. Schmidt  ',
        email: 'a@x.com',
      })
    ).toBe('anna-m-schmidt');
  });

  it('falls back to firstName + lastName when organizer.name is empty', () => {
    expect(
      deriveOrganizerSlug({ firstName: 'Anna', lastName: 'Schmidt', name: '', email: 'a@x.com' })
    ).toBe('anna-schmidt');
  });

  it('returns null when no name fields are present', () => {
    expect(deriveOrganizerSlug({ email: 'anon@x.com' })).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(deriveOrganizerSlug(null)).toBeNull();
    expect(deriveOrganizerSlug(undefined)).toBeNull();
    expect(deriveOrganizerSlug('not-an-object')).toBeNull();
    expect(deriveOrganizerSlug({ firstName: ' ', lastName: ' ' })).toBeNull();
  });
});

describe('resolveOrganizerProfilePath (LjqWg0mD)', () => {
  it('prefers the persisted organizerSlug when it is set', () => {
    expect(
      resolveOrganizerProfilePath({
        organizerSlug: 'anna-schmidt',
        organizer: { firstName: 'Wrong', lastName: 'Name' },
      })
    ).toBe('/anna-schmidt');
  });

  it('falls back to a derived slug when organizerSlug is missing', () => {
    expect(
      resolveOrganizerProfilePath({
        organizer: { firstName: 'Anna', lastName: 'Schmidt' },
      })
    ).toBe('/anna-schmidt');
  });

  it('falls back to a derived slug when organizerSlug is an empty string', () => {
    expect(
      resolveOrganizerProfilePath({
        organizerSlug: '',
        organizer: { firstName: 'Anna', lastName: 'Schmidt' },
      })
    ).toBe('/anna-schmidt');
  });

  it('returns null when neither organizerSlug nor organizer name exist', () => {
    expect(resolveOrganizerProfilePath({ organizer: { email: 'anon@x.com' } })).toBeNull();
    expect(resolveOrganizerProfilePath({})).toBeNull();
  });
});
