import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

const PUBLIC_PROFILE_DOC_ID = 'data';

// Subscribes to `users/{uid}/publicProfile/data` and returns the organizer's
// public profile data. Used by the event detail page to gate the
// organizer-name-to-profile-link (TYz5kp0d): profiles are strictly tied to
// the user account, not to the organizer display name, so we look the profile
// up by the event's `createdBy` uid and only show the link when the displayed
// organizer name actually matches the profile's displayName.
export function useOrganizerProfile(uid) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(uid));

  useEffect(() => {
    if (!uid || typeof uid !== 'string') {
      setProfile(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setProfile(null);

    const profileRef = doc(db, 'users', uid, 'publicProfile', PUBLIC_PROFILE_DOC_ID);
    const unsubscribe = onSnapshot(
      profileRef,
      (snap) => {
        setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      () => {
        setProfile(null);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  return { profile, exists: profile !== null, loading };
}
