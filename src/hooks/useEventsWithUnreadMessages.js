import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

export function useEventsWithUnreadMessages() {
  const { user, role } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setEvents([]);
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
          setLoading(false);
          return;
        }

        const perEventHasUnread = {};
        const recompute = () => {
          const list = docs
            .filter((e) => perEventHasUnread[e.id])
            .sort((a, b) => (a.date > b.date ? 1 : -1));
          setEvents(list);
          setLoading(false);
        };

        docs.forEach((event) => {
          const messagesRef = collection(db, 'events', event.id, 'messages');
          const unsub = onSnapshot(
            messagesRef,
            (snap) => {
              let hasUnread = false;
              snap.docs.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.authorUid !== user.uid && data.readByRecipient !== true) {
                  hasUnread = true;
                }
              });
              perEventHasUnread[event.id] = hasUnread;
              recompute();
            },
            () => {
              perEventHasUnread[event.id] = false;
              recompute();
            }
          );
          messageUnsubscribers.push(unsub);
        });
      },
      (err) => {
        console.warn('useEventsWithUnreadMessages events error:', err);
        setEvents([]);
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

  return { events, loading };
}
