import { describe, it, expect } from 'vitest';
import {
  getOrganizerProfilePath,
  splitProfileData,
  PUBLIC_PROFILE_FIELDS,
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
