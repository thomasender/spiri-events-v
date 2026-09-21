import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

const EMPTY_PROFILE = {
  displayName: '',
  bio: '',
  website: '',
  photoURL: null,
  updatedAt: null,
};

function normalize(data) {
  if (!data) return EMPTY_PROFILE;
  return {
    displayName: data.displayName || '',
    bio: data.bio || '',
    website: data.website || '',
    photoURL: data.photoURL || null,
    updatedAt: data.updatedAt || null,
  };
}

export function usePublicProfile(uid) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    setProfile(null);
    setLoading(true);
    setExists(false);

    if (!uid) {
      setLoading(false);
      return undefined;
    }

    const ref = doc(db, 'users', uid, 'publicProfile', 'data');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setProfile(normalize(snap.data()));
          setExists(true);
        } else {
          setProfile(EMPTY_PROFILE);
          setExists(false);
        }
        setLoading(false);
      },
      () => {
        setProfile(EMPTY_PROFILE);
        setExists(false);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  return { profile, loading, exists };
}
