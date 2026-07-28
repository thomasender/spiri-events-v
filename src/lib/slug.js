import { collection, query, where, getDocs } from 'firebase/firestore';
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
