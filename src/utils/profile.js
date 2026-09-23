export const PUBLIC_PROFILE_FIELDS = [
  'displayName',
  'bio',
  'website',
  'photoURL',
  'slug',
  'socialMedia',
];

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

// Combines the denormalized organizer object on an event into a single
// display string. Mirrors `getOrganizerName`: prefers the explicit `name`
// field, otherwise joins `firstName` + `lastName`.
function combineOrganizerName(organizer) {
  if (!organizer || typeof organizer !== 'object') return '';
  if (typeof organizer.name === 'string' && organizer.name.trim()) {
    return organizer.name.trim();
  }
  return [organizer.firstName, organizer.lastName]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ');
}

// Resolves the public profile path for an event's organizer. The profile is
// strictly tied to the user account (keyed by uid via the live
// `users/{createdBy}/publicProfile/data` doc), not to the organizer display
// name. A link is only shown when the event's organizer name matches the
// profile's displayName — otherwise we hide it, since linking to a profile
// with a mismatched name would be confusing for users. (TYz5kp0d)
export function resolveOrganizerProfilePath(event, profile) {
  if (!event || !profile || !profile.slug) return null;
  if (!event.createdBy) return null;
  const organizerName = combineOrganizerName(event.organizer);
  if (!organizerName || organizerName !== profile.displayName) return null;
  return getOrganizerProfilePath(profile.slug);
}
