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
