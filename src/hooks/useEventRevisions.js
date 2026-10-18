import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

/** Admin-only change history of an event (written by a Cloud Function). */
export function useEventRevisions(eventId, enabled = true) {
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setRevisions([]);
    if (!eventId || !enabled) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const q = query(collection(db, 'events', eventId, 'revisions'), orderBy('at', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setRevisions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [eventId, enabled]);

  return { revisions, loading };
}
