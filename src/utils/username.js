// Username validation for the profile's public handle ("Benutzername").
//
// The username is the human-facing input on the profile form. It is
// restricted to a slug-safe subset so that it can be used directly as the
// public profile path (`/:username`) without further mapping — this avoids
// the surprise of a user picking a handle that does not match the URL.
//
// Pure: no Firebase, no DOM, no env. Safe to import from Node scripts.

import {
  COMBINED_VIEW_SLUGS,
  LEGACY_REGION_ALIASES,
  REGION_SLUGS,
  RETIRED_REGION_IDS,
  RETIRED_VIEW_SLUGS,
} from './regions.js';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

// Lowercase letters, digits, dot, dash, underscore. No spaces, no
// consecutive separators at the edges.
export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/;

// Usernames that collide with reserved routes (the SPA uses the top-level
// path `/:slug` for organizer profiles, so any of these would shadow a real
// route or be confusing on the share URL). Kept in sync with the top-level
// routes in `src/App.jsx`.
export const RESERVED_USERNAMES = new Set([
  'admin',
  'profil',
  'profile',
  'login',
  'registrieren',
  'register',
  'event',
  'events',
  'calendar',
  'verzeichnis',
  'favoriten',
  'chat',
  'postfach',
  'kalender',
  'spenden',
  'spenden-danke',
  'ueber-uns',
  'about',
  'datenschutz',
  'impressum',
  'auth-action',
  'login-anleitungen',
  'api',
  'static',
  'public',
  'assets',
  // Region addresses (`/tirol`, ...) and the combined views (`/oesterreich`,
  // `/schweiz`, `/alle-tribes`, not regions themselves) share the top-level path
  // space with profiles. Addresses of former regions (`/bayern`, `/luzern`,
  // `/allgaeu`, ...) and views (`/deutschland`) stay reserved: nobody may claim
  // an old region URL.
  ...REGION_SLUGS,
  ...RETIRED_REGION_IDS,
  ...Object.keys(LEGACY_REGION_ALIASES),
  ...COMBINED_VIEW_SLUGS,
  ...RETIRED_VIEW_SLUGS,
  'austria',
  'online',
  'regionen',
  'region',
]);

// Fold umlauts so spellings like "Kärnten" or "Österreich" hit the ASCII
// reserved slugs. Only used for the reserved check.
function foldUmlauts(s) {
  return s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

// Normalise a user-typed string into the canonical username form:
// trim, strip a leading "@", lowercase. Returns '' for empty/null.
export function normalizeUsername(raw) {
  if (raw == null) return '';
  return String(raw).trim().replace(/^@+/, '').toLowerCase();
}

// Pure validator. Returns `{ valid: true }` or `{ valid: false, error }`.
// The caller decides how to display the error (German copy in ProfileForm).
export function validateUsername(raw, { currentUsername } = {}) {
  const normalized = normalizeUsername(raw);
  if (!normalized) {
    return { valid: false, error: 'EMPTY', normalized };
  }
  if (normalized.length < USERNAME_MIN) {
    return { valid: false, error: 'TOO_SHORT', normalized };
  }
  if (normalized.length > USERNAME_MAX) {
    return { valid: false, error: 'TOO_LONG', normalized };
  }
  if (!USERNAME_RE.test(normalized)) {
    return { valid: false, error: 'INVALID_CHARS', normalized };
  }
  // An existing user keeps their current handle even if it became reserved
  // later (e.g. a Bundesland name); only new/changed handles are blocked.
  if (currentUsername && normalizeUsername(currentUsername) === normalized) {
    return { valid: true, normalized };
  }
  if (isReservedUsername(normalized)) {
    return { valid: false, error: 'RESERVED', normalized };
  }
  return { valid: true, normalized };
}

export function isReservedUsername(slug) {
  if (!slug) return false;
  const folded = foldUmlauts(normalizeUsername(slug));
  // REGION_SLUGS also holds regions created in the Verwaltung after this file loaded.
  return RESERVED_USERNAMES.has(folded) || REGION_SLUGS.includes(folded);
}
