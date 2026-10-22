import { collectionGroup, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { foldQuery } from '../utils/mentions';

// People who allow being mentioned ("Andere dürfen mich erwähnen" in the profile),
// found by the start of their name. Reads the public `publicProfile` mirror only:
// `allowMentions` is the opt-in, `mentionName` the folded display name (lower case,
// no accents; written by useProfile.save only while the opt-in is on), so the
// prefix range below is case-insensitive. Needs the composite collection-group
// index in firestore.indexes.json.
export async function searchMentionableUsers(rawQuery, { limit: max = 6, excludeUid } = {}) {
  const prefix = foldQuery(rawQuery);
  if (prefix.length < 1) return [];
  const snapshot = await getDocs(
    query(
      collectionGroup(db, 'publicProfile'),
      where('allowMentions', '==', true),
      where('mentionName', '>=', prefix),
      where('mentionName', '<=', `${prefix}`),
      orderBy('mentionName'),
      // one extra, in case the person themselves is among the hits
      limit(max + 1)
    )
  );
  return snapshot.docs
    .map((docSnap) => {
      const data = docSnap.data() || {};
      return {
        uid: docSnap.ref?.parent?.parent?.id || null,
        displayName: typeof data.displayName === 'string' ? data.displayName.trim() : '',
        photoURL: typeof data.photoURL === 'string' && data.photoURL ? data.photoURL : null,
        username: typeof data.username === 'string' ? data.username : '',
      };
    })
    .filter((user) => user.uid && user.displayName && user.uid !== excludeUid)
    .slice(0, max);
}
