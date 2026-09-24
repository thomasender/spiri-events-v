export const PUBLIC_PROFILE_FIELDS = [
  'displayName',
  'bio',
  'bioHtml',
  'website',
  'photoURL',
  'slug',
  'username',
  'socialMedia',
];

export const BIO_MAX = 500;
export const DISPLAY_NAME_MAX = 80;

// Fields required for a public profile to feel "worth viewing". Without these,
// the public profile page (PublicProfilePage.jsx) renders mostly empty. The
// "Save & View Profile" button on the profile edit form gates the redirect on
// this list. Add an entry here when a new field is added to the public page
// that makes the page meaningfully richer.
//   key    — the profile doc field (must match what ProfileForm saves)
//   label  — German label shown in the "Profil noch nicht vollständig" dialog
export const REQUIRED_PUBLIC_PROFILE_FIELDS = [
  { key: 'displayName', label: 'Name' },
  { key: 'bio', label: 'Kurze Beschreibung' },
];

export function getMissingProfileFields(profile) {
  if (!profile || typeof profile !== 'object') {
    return REQUIRED_PUBLIC_PROFILE_FIELDS.map(({ key, label }) => ({ key, label }));
  }
  return REQUIRED_PUBLIC_PROFILE_FIELDS.filter(({ key }) => {
    const value = profile[key];
    return typeof value !== 'string' || value.trim() === '';
  });
}

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
