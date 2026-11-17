/**
 * System account "Dein Tribe" (Trello 6afb1116, docs/pre-entries.md).
 *
 * Owns every pre-entered event ("vorab eingetragen") until the organizer takes
 * it over. Nobody signs in with it: the Auth user is disabled, the profile is
 * visible on /dein-tribe but not listed in the directory. Created by
 * scripts/seed-dein-tribe.mjs.
 *
 * KEEP IN SYNC with src/utils/systemAccount.js (tests/lib/preEntries.spec.ts
 * compares both).
 */
export const SYSTEM_UID = 'system-dein-tribe';
export const SYSTEM_USERNAME = 'dein-tribe';
export const SYSTEM_DISPLAY_NAME = 'Dein Tribe';

export function isSystemUid(uid: unknown): boolean {
  return uid === SYSTEM_UID;
}
