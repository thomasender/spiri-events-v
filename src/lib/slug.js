import { collection, collectionGroup, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

// Replacements applied before lowercasing so multi-character digraphs like
// "Ae"/"Oe"/"Ue" survive the .toLowerCase() step. Order matters: uppercase
// umlauts first (so Ä→Ae→ae), then &→und.
const CHAR_REPLACEMENTS = [
  [/Ä/g, 'Ae'],
  [/Ö/g, 'Oe'],
  [/Ü/g, 'Ue'],
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
  [/&/g, ' und '],
];

export function slugify(input) {
  if (input == null) return '';
  let s = String(input);
  for (const [pattern, replacement] of CHAR_REPLACEMENTS) {
    s = s.replace(pattern, replacement);
  }
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateSlug(title, place, date) {
  const titleSlug = slugify(title);
  const placeSlug = slugify(place);
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
  return slugify(name);
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
