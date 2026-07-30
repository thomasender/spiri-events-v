import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

const EMPTY_PROFILE = {
  displayName: '',
  bio: '',
  website: '',
  contact: '',
  photoURL: null,
  createdAt: null,
  updatedAt: null,
};

function normalize(data) {
  if (!data) return EMPTY_PROFILE;
  return {
    displayName: data.displayName || '',
    bio: data.bio || '',
    website: data.website || '',
    contact: data.contact || '',
    photoURL: data.photoURL || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export function useProfile(uid) {
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

    const profileRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(
      profileRef,
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
      (err) => {
        console.error('useProfile error:', err);
        setProfile(EMPTY_PROFILE);
        setExists(false);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  const save = async (updates) => {
    if (!uid) throw new Error('Cannot save profile without a uid');
    const profileRef = doc(db, 'users', uid);
    const payload = {
      ...updates,
      updatedAt: serverTimestamp(),
    };
    if (!exists) {
      payload.createdAt = serverTimestamp();
    }
    await setDoc(profileRef, payload, { merge: true });
  };

  return { profile, loading, exists, save };
}
