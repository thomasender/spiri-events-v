import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

export function useUnreadMessageCount() {
  const { user, role } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setCount(0);
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

    const unsubscribers = [];

    const eventsUnsub = onSnapshot(
      eventsQuery,
      (snapshot) => {
        unsubscribers.forEach((u) => u());
        unsubscribers.length = 0;

        const eventIds = snapshot.docs.map((docSnap) => docSnap.id);

        if (eventIds.length === 0) {
          setCount(0);
          setLoading(false);
          return;
        }

        let perEventCounts = {};
        let completed = 0;
        const total = eventIds.length;

        const recomputeTotal = () => {
          completed += 1;
          if (completed >= total) {
            const totalCount = Object.values(perEventCounts).reduce((sum, c) => sum + c, 0);
            setCount(totalCount);
            setLoading(false);
          }
        };

        eventIds.forEach((eventId) => {
          const messagesRef = collection(db, 'events', eventId, 'messages');
          const msgUnsub = onSnapshot(
            messagesRef,
            (msgSnapshot) => {
              let unread = 0;
              msgSnapshot.docs.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.authorUid !== user.uid && data.readByRecipient !== true) {
                  unread += 1;
                }
              });
              perEventCounts[eventId] = unread;
              const totalCount = Object.values(perEventCounts).reduce((sum, c) => sum + c, 0);
              setCount(totalCount);
            },
            () => {
              perEventCounts[eventId] = 0;
              recomputeTotal();
            }
          );
          unsubscribers.push(msgUnsub);
          recomputeTotal();
        });
      },
      (err) => {
        console.warn('useUnreadMessageCount events error:', err);
        setCount(0);
        setLoading(false);
      }
    );

    unsubscribers.push(eventsUnsub);

    return () => {
      unsubscribers.forEach((u) => {
        try {
          u();
        } catch {
          // ignore
        }
      });
    };
  }, [user, role]);

  return { count, loading };
}
