import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAdminAlerts } from './useAdminAlerts';
import { newReviewEventIds, toMillis } from '../utils/staffNotifications';

// Matches the cap in firestore.rules (users/{uid}/seen/{area}).
const MAX_SEEN_IDS = 500;

/**
 * The Review dot for staff (vX7TgrWN): pending events that are new since this
 * account last opened Review, plus organizer changes that arrived after that.
 * `markSeen()` is called when the Review tab is open; the dot then stays away
 * until something new arrives. Stored per account in `users/{uid}/seen/review`
 * so it holds across devices.
 */
export function useReviewNotifications(uid, enabled = true) {
  const { unreadByEvent, pendingIds } = useAdminAlerts(uid, enabled);
  const [seen, setSeen] = useState(null);

  useEffect(() => {
    if (!uid || !enabled) {
      setSeen(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'users', uid, 'seen', 'review'),
      (snap) => {
        const data = snap.exists() ? snap.data({ serverTimestamps: 'estimate' }) : null;
        setSeen(
          data
            ? {
                eventIds: Array.isArray(data.eventIds) ? data.eventIds : [],
                atMs: toMillis(data.at),
              }
            : null
        );
      },
      (err) => {
        console.warn('useReviewNotifications error:', err?.code || err);
        setSeen(null);
      }
    );
  }, [uid, enabled]);

  const newIds = useMemo(
    () => (enabled ? newReviewEventIds([...pendingIds], seen, unreadByEvent) : []),
    [enabled, pendingIds, seen, unreadByEvent]
  );

  const markSeen = useCallback(async () => {
    if (!uid || !enabled) return;
    await setDoc(doc(db, 'users', uid, 'seen', 'review'), {
      eventIds: [...pendingIds].slice(0, MAX_SEEN_IDS),
      at: serverTimestamp(),
    });
  }, [uid, enabled, pendingIds]);

  return { count: newIds.length, newIds, markSeen };
}
