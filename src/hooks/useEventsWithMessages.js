import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

export function useEventsWithMessages() {
  const { user, role } = useAuth();
  const [events, setEvents] = useState([]);
  const [unreadCountByEvent, setUnreadCountByEvent] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      setUnreadCountByEvent({});
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    const eventsRef = collection(db, 'events');
    let eventsQuery;
    if (role === 'Admin') {
      eventsQuery = query(eventsRef, where('status', '==', 'pending'));
    } else {
      eventsQuery = query(
        eventsRef,
        where('status', '==', 'pending'),
        where('createdBy', '==', user.uid)
      );
    }

    const messageUnsubscribers = [];

    const eventsUnsub = onSnapshot(
      eventsQuery,
      (snapshot) => {
        messageUnsubscribers.forEach((u) => {
          try {
            u();
          } catch {
            // ignore
          }
        });
        messageUnsubscribers.length = 0;

        const docs = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        if (docs.length === 0) {
          setEvents([]);
          setUnreadCountByEvent({});
          setLoading(false);
          return;
        }

        const perEventUnread = {};
        const perEventHasAny = {};
        const recompute = () => {
          const list = docs
            .filter((e) => perEventHasAny[e.id])
            .sort((a, b) => {
              const aUnread = perEventUnread[a.id] || 0;
              const bUnread = perEventUnread[b.id] || 0;
              if (aUnread !== bUnread) return bUnread - aUnread;
              return a.date > b.date ? 1 : -1;
            });
          setEvents(list);
          setUnreadCountByEvent({ ...perEventUnread });
          setLoading(false);
        };

        docs.forEach((event) => {
          const messagesRef = collection(db, 'events', event.id, 'messages');
          const unsub = onSnapshot(
            messagesRef,
            (snap) => {
              let unread = 0;
              let hasAny = false;
              snap.docs.forEach((docSnap) => {
                hasAny = true;
                const data = docSnap.data();
                if (data.authorUid !== user.uid && data.readByRecipient !== true) {
                  unread += 1;
                }
              });
              perEventUnread[event.id] = unread;
              perEventHasAny[event.id] = hasAny;
              recompute();
            },
            () => {
              perEventUnread[event.id] = 0;
              perEventHasAny[event.id] = false;
              recompute();
            }
          );
          messageUnsubscribers.push(unsub);
        });
      },
      (err) => {
        console.warn('useEventsWithMessages events error:', err);
        setEvents([]);
        setUnreadCountByEvent({});
        setLoading(false);
      }
    );

    return () => {
      messageUnsubscribers.forEach((u) => {
        try {
          u();
        } catch {
          // ignore
        }
      });
      try {
        eventsUnsub();
      } catch {
        // ignore
      }
    };
  }, [user, role]);

  return { events, unreadCountByEvent, loading };
}
