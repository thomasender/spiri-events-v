import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

export function useTrashedEventsCount(isAdmin = false) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setCount(0);
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
        setCount(snapshot.size);
        setLoading(false);
      },
      (err) => {
        console.error('useTrashedEventsCount error:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user, isAdmin]);

  return { count, loading };
}
