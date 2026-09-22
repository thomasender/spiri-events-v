import { collection, collectionGroup, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { slugify, generateEventSlug, slugifyName } from './slug-helpers';

// Re-exports so existing callers of `slugify` and `generateSlug` keep working.
// `generateSlug` is intentionally NOT re-exported: the canonical name is now
// `generateEventSlug(title, category, bezirk, date)` and takes the new fields.
export { slugify, generateEventSlug, slugifyName };

// Generates a slug from the new event format:
//   {titleSlug}-{categorySlug}-in-{bezirkSlug}-{yyyymmdd}
// Then checks Firestore for collisions and appends a counter (-2, -3, …) when
// the generated slug is already in use by another approved event.
export async function findUniqueSlug(title, category, bezirk, date) {
  let baseSlug = generateEventSlug(title, category, bezirk, date);
  if (!baseSlug) {
    throw new Error('Cannot generate slug from empty inputs');
  }
  let slug = baseSlug;
  let counter = 1;

  while (await slugExists(slug)) {
    counter += 1;
    slug = `${baseSlug}-${counter}`;
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
