import type { Firestore } from 'firebase-admin/firestore';
import type { FeedRegion } from './regions';
import { annotateOnlineRegionIds, onlineOrganizerUids } from './onlineEventEligibility';

/**
 * Adds `onlineRegionIds` to the online events of non-staff organisers (Trello
 * lVFp6Dvw), reading the organisers' `users/{uid}/publicProfile/data` and the
 * `admin_users` ids (staff are exempt). With fewer than two active regions it
 * returns `events` unchanged and reads nothing (dark launch).
 */
export async function annotateOnlineEvents<T extends { isOnline?: unknown; createdBy?: unknown }>(
  db: Firestore,
  events: T[],
  regions: readonly FeedRegion[]
): Promise<T[]> {
  if (regions.filter((r) => r.active).length < 2) return events;
  const uids = onlineOrganizerUids(events);
  if (uids.length === 0) return events;
  const [staffSnap, profileSnaps] = await Promise.all([
    db.collection('admin_users').get(),
    db.getAll(...uids.map((uid) => db.doc(`users/${uid}/publicProfile/data`))),
  ]);
  const listings: Record<string, Record<string, unknown> | null> = {};
  profileSnaps.forEach((snap, i) => {
    listings[uids[i]] = snap.exists ? (snap.data() as Record<string, unknown>) : null;
  });
  return annotateOnlineRegionIds(events, {
    regions,
    listings,
    staffUids: staffSnap.docs.map((d) => d.id),
  });
}
