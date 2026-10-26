import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Admin-only: events an organizer edited (or sent back in) while they were pending
// (`users/{uid}/adminAlerts/{eventId}`, written by the Cloud Function
// `onEventUpdatedWriteRevision`, never by a client). Feeds the badge on "Verwaltung"
// and the "Vom User bearbeitet" mark in the Review tab.
export function useAdminAlerts(uid, enabled = true) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!uid || !enabled) {
      setItems([]);
      return undefined;
    }
    return onSnapshot(
      collection(db, 'users', uid, 'adminAlerts'),
      (snapshot) =>
        setItems(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              kind: data.kind === 'resubmitted' ? 'resubmitted' : 'edited',
              eventTitle: data.eventTitle ?? '',
              ownerName: data.ownerName ?? '',
              changeCount: typeof data.changeCount === 'number' ? data.changeCount : 1,
              read: data.read === true,
            };
          })
        ),
      (err) => {
        console.warn('useAdminAlerts error:', err?.code || err);
        setItems([]);
      }
    );
  }, [uid, enabled]);

  const unreadCount = useMemo(() => items.filter((a) => !a.read).length, [items]);
  const unreadByEvent = useMemo(() => {
    const map = {};
    items.forEach((a) => {
      if (!a.read) map[a.id] = a;
    });
    return map;
  }, [items]);

  // Marks one event's alert as read; does nothing when there is no unread alert for it.
  const markRead = useCallback(
    async (eventId) => {
      if (!uid || !eventId || !unreadByEvent[eventId]) return;
      await updateDoc(doc(db, 'users', uid, 'adminAlerts', eventId), { read: true });
    },
    [uid, unreadByEvent]
  );

  return { items, unreadCount, unreadByEvent, markRead };
}
