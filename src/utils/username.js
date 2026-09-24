// Username validation for the profile's public handle ("Benutzername").
//
// The username is the human-facing input on the profile form. It is
// restricted to a slug-safe subset so that it can be used directly as the
// public profile path (`/:username`) without further mapping — this avoids
// the surprise of a user picking a handle that does not match the URL.
//
// Pure: no Firebase, no DOM, no env. Safe to import from Node scripts.

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
]);

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
  if (RESERVED_USERNAMES.has(normalized)) {
    return { valid: false, error: 'RESERVED', normalized };
  }
  if (currentUsername && normalizeUsername(currentUsername) === normalized) {
    return { valid: true, normalized };
  }
  return { valid: true, normalized };
}

export function isReservedUsername(slug) {
  if (!slug) return false;
  return RESERVED_USERNAMES.has(normalizeUsername(slug));
}
