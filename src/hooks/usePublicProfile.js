import { useEffect, useState } from 'react';
import { collectionGroup, onSnapshot, query, where, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';

const EMPTY_PROFILE = {
  displayName: '',
  bio: '',
  website: '',
  photoURL: null,
  slug: '',
  updatedAt: null,
};

function normalize(data) {
  if (!data) return EMPTY_PROFILE;
  return {
    displayName: data.displayName || '',
    bio: data.bio || '',
    website: data.website || '',
    photoURL: data.photoURL || null,
    slug: data.slug || '',
    updatedAt: data.updatedAt || null,
  };
}

export function usePublicProfile(slug) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);
  const [uid, setUid] = useState(null);

  useEffect(() => {
    setProfile(null);
    setLoading(true);
    setExists(false);
    setUid(null);

    if (!slug) {
      setLoading(false);
      return undefined;
    }

    const q = query(collectionGroup(db, 'publicProfile'), where('slug', '==', slug), limit(1));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          setProfile(EMPTY_PROFILE);
          setExists(false);
          setUid(null);
        } else {
          const docSnap = snapshot.docs[0];
          setProfile(normalize(docSnap.data()));
          setExists(true);
          setUid(docSnap.ref.parent.parent?.id || null);
        }
        setLoading(false);
      },
      () => {
        setProfile(EMPTY_PROFILE);
        setExists(false);
        setUid(null);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [slug]);

  return { profile, loading, exists, uid };
}
