import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

const PUBLIC_PROFILE_DOC_ID = 'data';

// Subscribes to `users/{uid}/publicProfile/data` and reports whether the
// organizer has actually created a public profile. Used by the event detail
// page to decide whether the organizer name should link to the public profile
// (LjqWg0mD): we only want the link when a profile doc exists, otherwise the
// link would point at the "Profil nicht verfügbar" fallback page for
// organizers who never set one up.
export function useOrganizerProfileExists(uid) {
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(Boolean(uid));

  useEffect(() => {
    if (!uid || typeof uid !== 'string') {
      setExists(false);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setExists(false);

    const profileRef = doc(db, 'users', uid, 'publicProfile', PUBLIC_PROFILE_DOC_ID);
    const unsubscribe = onSnapshot(
      profileRef,
      (snap) => {
        setExists(snap.exists());
        setLoading(false);
      },
      () => {
        setExists(false);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  return { exists, loading };
}
