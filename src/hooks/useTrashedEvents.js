import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

export function useTrashedEvents(isAdmin = false) {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      setLoading(false);
      return undefined;
    }

    let q;
    if (isAdmin) {
      q = query(collection(db, 'events'), where('status', '==', 'trashed'));
    } else {
      q = query(
        collection(db, 'events'),
        where('status', '==', 'trashed'),
        where('createdBy', '==', user.uid)
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        list.sort((a, b) => {
          const aTime = a.trashedAt?.toMillis ? a.trashedAt.toMillis() : 0;
          const bTime = b.trashedAt?.toMillis ? b.trashedAt.toMillis() : 0;
          return bTime - aTime;
        });
        setEvents(list);
        setLoading(false);
      },
      (err) => {
        console.error('useTrashedEvents error:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user, isAdmin]);

  return { events, loading };
}
