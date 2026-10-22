import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getOnboardingProgress,
  isOnboardingDismissed,
  needsOnboarding,
  setOnboardingDismissed,
} from '../../src/utils/onboarding';

describe('onboarding progress', () => {
  it('counts photo, description and directory entry', () => {
    expect(getOnboardingProgress({}).percent).toBe(0);
    expect(getOnboardingProgress({ photoURL: 'https://x/y.jpg' }).percent).toBe(33);
    expect(
      getOnboardingProgress({ photoURL: 'u', bio: 'Hallo', listedInDirectory: true }).percent
    ).toBe(100);
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

describe('onboarding dismissal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('remembers the dismissal per user', () => {
    setOnboardingDismissed('a');
    expect(isOnboardingDismissed('a')).toBe(true);
    expect(isOnboardingDismissed('b')).toBe(false);
  });

  it('survives blocked storage', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setOnboardingDismissed('a')).not.toThrow();
    expect(isOnboardingDismissed('a')).toBe(false);
  });
});
