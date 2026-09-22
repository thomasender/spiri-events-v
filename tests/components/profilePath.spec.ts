import { describe, it, expect } from 'vitest';
import {
  getOrganizerProfilePath,
  splitProfileData,
  PUBLIC_PROFILE_FIELDS,
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

describe('resolveOrganizerProfilePath (TYz5kp0d)', () => {
  const annaEvent = {
    createdBy: 'user-1',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'a@x.com' },
  };

  it('returns the profile path when the organizer name matches the profile displayName', () => {
    const profile = { displayName: 'Anna Schmidt', slug: 'anna-schmidt' };
    expect(resolveOrganizerProfilePath(annaEvent, profile)).toBe('/anna-schmidt');
  });

  it('returns null when the organizer name differs from the profile displayName', () => {
    const profile = { displayName: 'Anna Schmidt', slug: 'anna-schmidt' };
    const mismatchedEvent = {
      ...annaEvent,
      organizer: { ...annaEvent.organizer, name: 'Yoga Studio Dornbirn' },
    };
    expect(resolveOrganizerProfilePath(mismatchedEvent, profile)).toBeNull();
  });

  it('matches via firstName + lastName when organizer.name is not set', () => {
    const profile = { displayName: 'Lukas Müller', slug: 'lukas-mueller' };
    const event = {
      createdBy: 'user-2',
      organizer: { firstName: 'Lukas', lastName: 'Müller', email: 'l@x.com' },
    };
    expect(resolveOrganizerProfilePath(event, profile)).toBe('/lukas-mueller');
  });

  it('prefers organizer.name over firstName + lastName when both are set', () => {
    const profile = { displayName: 'Anna M. Schmidt', slug: 'anna-m-schmidt' };
    const event = {
      createdBy: 'user-1',
      organizer: {
        firstName: 'Anna',
        lastName: 'Schmidt',
        name: 'Anna M. Schmidt',
        email: 'a@x.com',
      },
    };
    expect(resolveOrganizerProfilePath(event, profile)).toBe('/anna-m-schmidt');
  });

  it('returns null when the profile is missing', () => {
    expect(resolveOrganizerProfilePath(annaEvent, null)).toBeNull();
    expect(resolveOrganizerProfilePath(annaEvent, undefined)).toBeNull();
  });

  it('returns null when the profile has no slug', () => {
    const profile = { displayName: 'Anna Schmidt' };
    expect(resolveOrganizerProfilePath(annaEvent, profile)).toBeNull();
  });

  it('returns null when the event has no createdBy (legacy event)', () => {
    const profile = { displayName: 'Anna Schmidt', slug: 'anna-schmidt' };
    expect(
      resolveOrganizerProfilePath(
        { organizer: { firstName: 'Anna', lastName: 'Schmidt' } },
        profile
      )
    ).toBeNull();
  });

  it('returns null when the event organizer has no usable name', () => {
    const profile = { displayName: 'Anna Schmidt', slug: 'anna-schmidt' };
    expect(
      resolveOrganizerProfilePath(
        { createdBy: 'user-1', organizer: { email: 'anon@x.com' } },
        profile
      )
    ).toBeNull();
  });

  it('returns null for invalid inputs', () => {
    expect(resolveOrganizerProfilePath(null, { displayName: 'x', slug: 'x' })).toBeNull();
    expect(
      resolveOrganizerProfilePath({ createdBy: 'u' }, { displayName: 'x', slug: 'x' })
    ).toBeNull();
    expect(
      resolveOrganizerProfilePath({ createdBy: 'u', organizer: { name: 'x' } }, null)
    ).toBeNull();
  });
});
