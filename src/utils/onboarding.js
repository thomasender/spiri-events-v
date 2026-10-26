// Pure helpers of the profile onboarding wizard (flag app_settings/onboarding).
// No Firebase here.

import { normalizeInstagramHandle } from './instagramHandle';

export const ONBOARDING_STEPS = [
  { id: 'photo', label: 'Foto' },
  { id: 'bio', label: 'Beschreibung' },
  { id: 'directory', label: 'Verzeichnis' },
  { id: 'instagram', label: 'Instagram' },
];

export const ONBOARDING_BIO_STARTERS = [
  'Ich bin …, und mein Herz schlägt für …',
  'Ich biete … an, in … und online.',
  'Ich suche Austausch mit Menschen, die …',
];

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// Which steps the profile already covers.
export function getOnboardingDone(profile) {
  return {
    photo: hasText(profile?.photoURL),
    bio: hasText(profile?.bio),
    directory: profile?.listedInDirectory === true,
    instagram: Boolean(normalizeInstagramHandle(profile?.socialMedia?.instagram)),
  };
}

export function getOnboardingProgress(profile) {
  const done = getOnboardingDone(profile);
  const count = ONBOARDING_STEPS.filter((step) => done[step.id]).length;
  return {
    done,
    count,
    total: ONBOARDING_STEPS.length,
    percent: Math.round((count / ONBOARDING_STEPS.length) * 100),
  };
}

// Photo and description are what makes a profile worth visiting; the directory
// entry stays a free choice, so it never triggers the wizard on its own.
export function needsOnboarding(profile) {
  const done = getOnboardingDone(profile);
  return !done.photo || !done.bio;
}

// Whether the wizard should be offered. Once finished (`onboardingCompleted:
// true` on the user doc) never again. Accounts registered since the wizard
// exists carry `onboardingCompleted: false` and get it until they finish it;
// older accounts (no field) only while photo or description is missing.
export function shouldOfferOnboarding(profile) {
  if (profile?.onboardingCompleted === true) return false;
  if (profile?.onboardingCompleted === false) return true;
  return needsOnboarding(profile);
}

// Closing the wizard without finishing it only hides it for this visit (this
// browser tab session); the next visit offers it again.
export function onboardingDismissKey(uid) {
  return `onboarding-dismissed:${uid}`;
}

export function isOnboardingDismissed(uid) {
  try {
    return window.sessionStorage.getItem(onboardingDismissKey(uid)) === '1';
  } catch {
    return false;
  }
}

export function setOnboardingDismissed(uid) {
  try {
    window.sessionStorage.setItem(onboardingDismissKey(uid), '1');
  } catch {
    // Private window / blocked storage: the wizard may show again, nothing breaks.
  }
}
