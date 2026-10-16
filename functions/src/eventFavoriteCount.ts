/**
 * Anonymous favorite count for an event: how many users saved it as favorite.
 *
 * Favorites are private (users/{uid}/favorites/{eventId}), so the count comes
 * from this callable. It answers only the event's organizer and admins, and it
 * returns the number only, never who favorited.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { enforceRateLimit } from './rateLimit';

if (getApps().length === 0) {
  initializeApp();
}

const GET_ALL_CHUNK = 300;
const LIMIT = { maxAttempts: 60, windowMs: 10 * 60 * 1000 };

const ALLOWED_ORIGINS = [
  'https://www.thetribe.at',
  'https://thetribe.at',
  'https://spirieventsvbg.web.app',
  'http://localhost:5180',
];

// Same approach as the cancellation mail: the site has few accounts, so
// checking each user's favorite doc beats a collection-group index.
export async function countFavorites(eventId: string): Promise<number> {
  const db = getFirestore();
  const userRefs = await db.collection('users').listDocuments();
  let count = 0;
  for (let i = 0; i < userRefs.length; i += GET_ALL_CHUNK) {
    const refs = userRefs
      .slice(i, i + GET_ALL_CHUNK)
      .map((ref) => ref.collection('favorites').doc(eventId));
    const snaps = await db.getAll(...refs);
    count += snaps.filter((snap) => snap.exists).length;
  }
  return count;
}

export const getEventFavoriteCount = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('getEventFavoriteCount', request);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
    const eventId = (request.data as { eventId?: unknown } | undefined)?.eventId;
    if (typeof eventId !== 'string' || eventId.length === 0 || eventId.includes('/')) {
      throw new HttpsError('invalid-argument', 'eventId required.');
    }
    enforceRateLimit(request as never, 'eventFavoriteCount', LIMIT);

    const eventSnap = await getFirestore().collection('events').doc(eventId).get();
    if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
    const isAdmin = request.auth?.token?.role === 'Admin';
    if (!isAdmin && eventSnap.get('createdBy') !== uid) {
      throw new HttpsError('permission-denied', 'Only the organizer can see this.');
    }
    return { count: await countFavorites(eventId) };
  }
);
