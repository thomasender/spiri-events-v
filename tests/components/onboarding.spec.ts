import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getOnboardingProgress,
  isOnboardingDismissed,
  needsOnboarding,
  setOnboardingDismissed,
  shouldOfferOnboarding,
} from '../../src/utils/onboarding';

describe('onboarding progress', () => {
  it('counts photo, description, directory entry and Instagram name', () => {
    expect(getOnboardingProgress({}).percent).toBe(0);
    expect(getOnboardingProgress({ photoURL: 'https://x/y.jpg' }).percent).toBe(25);
    expect(
      getOnboardingProgress({ photoURL: 'u', bio: 'Hallo', listedInDirectory: true }).percent
    ).toBe(75);
    expect(
      getOnboardingProgress({
        photoURL: 'u',
        bio: 'Hallo',
        listedInDirectory: true,
        socialMedia: { instagram: '@sandra' },
      }).percent
    ).toBe(100);
  });

  it('only counts a valid Instagram name', () => {
    expect(getOnboardingProgress({ socialMedia: { instagram: 'kein name' } }).done.instagram).toBe(
      false
    );
  });

  it('ignores a blank description', () => {
    expect(getOnboardingProgress({ bio: '   ' }).done.bio).toBe(false);
  });

  it('needs onboarding while photo or description is missing, not for the directory', () => {
    expect(needsOnboarding(null)).toBe(true);
    expect(needsOnboarding({ photoURL: 'u' })).toBe(true);
    expect(needsOnboarding({ bio: 'Hallo' })).toBe(true);
    expect(needsOnboarding({ photoURL: 'u', bio: 'Hallo', listedInDirectory: false })).toBe(false);
  });
});

describe('when the wizard is offered', () => {
  const complete = { photoURL: 'u', bio: 'Hallo' };

  it('never again once finished, even with an incomplete profile', () => {
    expect(shouldOfferOnboarding({ onboardingCompleted: true })).toBe(false);
  });

  it('to a new account until it is finished, even with a complete profile', () => {
    expect(shouldOfferOnboarding({ ...complete, onboardingCompleted: false })).toBe(true);
  });

  it('to an older account only while photo or description is missing', () => {
    expect(shouldOfferOnboarding({ ...complete, onboardingCompleted: null })).toBe(false);
    expect(shouldOfferOnboarding({ photoURL: 'u', onboardingCompleted: null })).toBe(true);
    expect(shouldOfferOnboarding(null)).toBe(true);
  });
});

describe('onboarding dismissal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('lasts for this visit only (session storage)', () => {
    setOnboardingDismissed('a');
    expect(sessionStorage.getItem('onboarding-dismissed:a')).toBe('1');
    expect(localStorage.getItem('onboarding-dismissed:a')).toBeNull();
  });

  it('remembers the dismissal per user', () => {
    setOnboardingDismissed('a');
    expect(isOnboardingDismissed('a')).toBe(true);
    expect(isOnboardingDismissed('b')).toBe(false);
  });

  it('survives blocked storage', () => {
    vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setOnboardingDismissed('a')).not.toThrow();
    expect(isOnboardingDismissed('a')).toBe(false);
  });
});
