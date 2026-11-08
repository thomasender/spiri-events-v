import { collectionGroup, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeUsername } from '../utils/username';

// Search the public user directory by Benutzername prefix.
//
// `publicProfile` mirrors the publicly-shared fields (displayName, bio,
// website, photoURL, slug, username, socialMedia) into `users/{uid}/publicProfile/data`
// so reading a user's display name + avatar does not require the owner-only
// access that `users/{uid}` enforces. The collection is publicly readable
// (see firestore.rules), so admins can search it without a Cloud Function.
//
// We use the standard prefix range trick:
//   where('username', '>=', prefix) AND where('username', '<=', prefix + '\uf8ff')
// (on `username` and on `slug`) so we don't need a full-text index. Usernames are normalised to lowercase
// before the query so input casing does not matter.
export async function searchUsersByUsernamePrefix(rawPrefix, options = {}) {
  const max = Math.min(Math.max(options.limit ?? 8, 1), 20);
  const prefix = normalizeUsername(rawPrefix);
  if (prefix.length < 2) return [];

  try {
    // Accounts that never saved the profile form (e.g. new registrations that
    // only went through the onboarding) have no `username` in their public
    // profile, only the `slug` it is derived from; the profile form and the
    // public URL show that slug as their Benutzername. Search both fields so
    // those people are found too, and treat the slug as the username.
    const prefixQuery = (field) =>
      getDocs(
        query(
          collectionGroup(db, 'publicProfile'),
          where(field, '>=', prefix),
          where(field, '<=', `${prefix}\uf8ff`),
          orderBy(field),
          limit(max)
        )
      );
    const [byUsername, bySlug] = await Promise.all([prefixQuery('username'), prefixQuery('slug')]);
    const seen = new Set();
    const results = [];
    for (const docSnap of [...byUsername.docs, ...bySlug.docs]) {
      const uid = docSnap.ref?.parent?.parent?.id || null;
      const key = uid || docSnap.ref?.path;
      if (seen.has(key)) continue;
      seen.add(key);
      const data = docSnap.data() || {};
      const photoURL = typeof data.photoURL === 'string' && data.photoURL ? data.photoURL : null;
      const displayName = typeof data.displayName === 'string' ? data.displayName : '';
      results.push({
        uid,
        username: data.username || data.slug || '',
        displayName,
        photoURL,
        slug: data.slug || '',
        website: typeof data.website === 'string' ? data.website : '',
      });
    }
    results.sort((a, b) => (a.username < b.username ? -1 : a.username > b.username ? 1 : 0));
    return results.slice(0, max);
  } catch (err) {
    console.warn('searchUsersByUsernamePrefix error:', err.code, err.message);
    throw err;
  }
}
