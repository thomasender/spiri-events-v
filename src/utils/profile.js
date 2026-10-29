export const PUBLIC_PROFILE_FIELDS = [
  'displayName',
  'bio',
  'bioHtml',
  'website',
  'photoURL',
  'photoFocalPoint',
  'photoZoom',
  'slug',
  'username',
  'socialMedia',
  'listedInDirectory',
  'directoryCategories',
  'directoryRegions',
  'directoryRegionIds',
  'showOnlineStatus',
  'allowMentions',
  // Only the place NAME of the Feuerplatz, and only while the person made it visible.
  'fireplaceLabel',
];

export const BIO_MAX = 2000;
export const DISPLAY_NAME_MAX = 80;
export const FIREPLACE_LABEL_MAX = 80;

const round3 = (x) => Math.round(x * 1000) / 1000;

// The Feuerplatz: the one place where a person is most at home. Private on `users/{uid}`
// as `{ label, lat, lon }` (place of the bundled list, rounded) together with the switch
// `fireplaceVisible`; only the NAME is mirrored to the publicProfile (`fireplaceLabel`),
// never the coordinates. Returns null for anything invalid.
export function normalizeFireplace(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, FIREPLACE_LABEL_MAX) : '';
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { label, lat: round3(lat), lon: round3(lon) };
}

// What the publicProfile must say about the Feuerplatz after a save: the place name when
// the person made it visible, `null` when it must not be public (the caller removes a
// stale field). `current` is the stored profile, `updates` what is being saved.
export function publicFireplaceLabel(current, updates) {
  const fireplace = normalizeFireplace(
    'fireplace' in updates ? updates.fireplace : current?.fireplace
  );
  const visible =
    'fireplaceVisible' in updates
      ? updates.fireplaceVisible === true
      : current?.fireplaceVisible === true;
  return visible && fireplace ? fireplace.label : null;
}

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
// name. The displayed organizer name links to the owner's profile even when
// the user entered a different organizer name for this event (UBexELod).
export function resolveOrganizerProfilePath(event, profile) {
  if (!event || !profile || !profile.slug) return null;
  if (!event.createdBy) return null;
  if (!combineOrganizerName(event.organizer)) return null;
  return getOrganizerProfilePath(profile.slug);
}
