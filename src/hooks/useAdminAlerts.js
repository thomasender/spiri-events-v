import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Admin-only: events an organizer edited (or sent back in) while they were pending
// (`users/{uid}/adminAlerts/{eventId}`, written by the Cloud Function
// `onEventUpdatedWriteRevision`, never by a client). Feeds the badge on "Verwaltung"
// and the "Vom User bearbeitet" mark in the Review tab.
//
// Only alerts for events that are still pending count: an alert is marked read only
// for the admin who opens / approves / sends back the event, so every other admin
// (and every event approved, deleted or sent back elsewhere) would otherwise keep an
// unread alert forever.
export function useAdminAlerts(uid, enabled = true) {
  const [items, setItems] = useState([]);
  const [pendingIds, setPendingIds] = useState(() => new Set());

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

  useEffect(() => {
    if (!uid || !enabled) {
      setPendingIds(new Set());
      return undefined;
    }
    return onSnapshot(
      query(collection(db, 'events'), where('status', '==', 'pending')),
      (snapshot) => setPendingIds(new Set(snapshot.docs.map((d) => d.id))),
      (err) => {
        console.warn('useAdminAlerts pending events error:', err?.code || err);
        setPendingIds(new Set());
      }
    );
  }, [uid, enabled]);

  const unreadByEvent = useMemo(() => {
    const map = {};
    items.forEach((a) => {
      if (!a.read && pendingIds.has(a.id)) map[a.id] = a;
    });
    return map;
  }, [items, pendingIds]);
  const unreadCount = Object.keys(unreadByEvent).length;

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
