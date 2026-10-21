import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { compareEventsByDateTime } from '../utils/eventSort';

// Admin-only: every event a member created, whatever its status (drafts,
// pending, trashed). firestore.rules lets admins read all of `events`.
export function useMemberEvents(uid) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState(null);

  useEffect(() => {
    setEvents([]);
    setError(null);
    setLoading(Boolean(uid));
    if (!uid) return undefined;

    const q = query(collection(db, 'events'), where('createdBy', '==', uid));
    return onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort(compareEventsByDateTime);
        setEvents(list);
        setLoading(false);
      },
      (err) => {
        console.error('useMemberEvents error:', err);
        setError(err);
        setLoading(false);
      }
    );
  }, [uid]);

  return { events, loading, error };
}
