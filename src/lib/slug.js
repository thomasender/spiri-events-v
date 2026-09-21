import { collection, collectionGroup, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export function generateSlug(title, place, date) {
  const normalize = (str) =>
    str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const titleSlug = normalize(title);
  const placeSlug = normalize(place);
  const dateSlug = date ? date.replace(/-/g, '') : '';

  const parts = [titleSlug, placeSlug, dateSlug].filter(Boolean);
  return parts.join('-');
}

export async function findUniqueSlug(title, place, date) {
  let baseSlug = generateSlug(title, place, date);
  let slug = baseSlug;
  let counter = 1;

  while (await slugExists(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

async function slugExists(slug) {
  try {
    const q = query(
      collection(db, 'events'),
      where('slug', '==', slug),
      where('status', '==', 'approved')
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (err) {
    console.error('slugExists error:', err.code, err.message);
    throw err;
  }
}

export function isLegacyId(id) {
  return id && !id.includes('-') && id.length > 15;
}

export function slugifyName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function findUniqueProfileSlug(displayName, currentUid) {
  const baseSlug = slugifyName(displayName) || 'veranstalter';
  let slug = baseSlug;
  let counter = 2;

  while (await profileSlugTakenByOther(slug, currentUid)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

async function profileSlugTakenByOther(slug, currentUid) {
  try {
    const q = query(collectionGroup(db, 'publicProfile'), where('slug', '==', slug));
    const snapshot = await getDocs(q);
    return snapshot.docs.some((doc) => {
      const ownerUid = doc.ref.parent.parent?.id;
      return ownerUid && ownerUid !== currentUid;
    });
  } catch (err) {
    console.error('profileSlugTakenByOther error:', err.code, err.message);
    throw err;
  }
}
