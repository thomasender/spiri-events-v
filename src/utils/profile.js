import { slugifyName } from '../lib/slug-helpers';

export const PUBLIC_PROFILE_FIELDS = ['displayName', 'bio', 'website', 'photoURL', 'slug'];

export const BIO_MAX = 500;
export const DISPLAY_NAME_MAX = 80;

export function splitProfileData(data) {
  if (!data || typeof data !== 'object') {
    return { publicDoc: {}, privateDoc: {} };
  }
  const publicDoc = {};
  const privateDoc = {};
  for (const [key, value] of Object.entries(data)) {
    if (PUBLIC_PROFILE_FIELDS.includes(key)) {
      publicDoc[key] = value;
    } else {
      privateDoc[key] = value;
    }
  }
  return { publicDoc, privateDoc };
}

export function buildPublicProfileDoc(publicDoc, { updatedAt } = {}) {
  return {
    ...publicDoc,
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export function getOrganizerProfilePath(slug) {
  if (!slug || typeof slug !== 'string') return null;
  return `/${slug}`;
}

// Best-effort slug derived from the denormalized organizer object on an event.
// Used as a fallback when the event document has no `organizerSlug` (legacy
// events created before that field existed). Mirrors `getOrganizerName`: prefers
// `organizer.name`, otherwise joins `firstName` + `lastName`.
export function deriveOrganizerSlug(organizer) {
  if (!organizer || typeof organizer !== 'object') return null;
  const name =
    (typeof organizer.name === 'string' && organizer.name.trim()) ||
    [organizer.firstName, organizer.lastName]
      .filter((part) => typeof part === 'string' && part.trim())
      .join(' ');
  if (!name) return null;
  const slug = slugifyName(name);
  return slug || null;
}

// Resolves the public profile path for an event's organizer. Prefers the
// persisted `event.organizerSlug`; falls back to a slug derived from the
// denormalized `event.organizer` object so legacy events still link somewhere.
export function resolveOrganizerProfilePath(event) {
  const persisted = event?.organizerSlug;
  if (typeof persisted === 'string' && persisted.trim()) {
    return getOrganizerProfilePath(persisted);
  }
  return getOrganizerProfilePath(deriveOrganizerSlug(event?.organizer));
}
