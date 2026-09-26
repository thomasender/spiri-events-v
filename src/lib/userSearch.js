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
// so we don't need a full-text index. Usernames are normalised to lowercase
// before the query so input casing does not matter.
export async function searchUsersByUsernamePrefix(rawPrefix, options = {}) {
  const max = Math.min(Math.max(options.limit ?? 8, 1), 20);
  const prefix = normalizeUsername(rawPrefix);
  if (prefix.length < 2) return [];

  try {
    const q = query(
      collectionGroup(db, 'publicProfile'),
      where('username', '>=', prefix),
      where('username', '<=', `${prefix}\uf8ff`),
      orderBy('username'),
      limit(max)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      const uid = docSnap.ref?.parent?.parent?.id || null;
      const photoURL = typeof data.photoURL === 'string' && data.photoURL ? data.photoURL : null;
      const displayName = typeof data.displayName === 'string' ? data.displayName : '';
      return {
        uid,
        username: data.username || '',
        displayName,
        photoURL,
        slug: data.slug || '',
      };
    });
  } catch (err) {
    console.warn('searchUsersByUsernamePrefix error:', err.code, err.message);
    throw err;
  }
}
