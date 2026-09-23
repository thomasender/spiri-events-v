import { useEffect, useState } from 'react';
import { collectionGroup, onSnapshot, query, where, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';

const EMPTY_PROFILE = {
  displayName: '',
  bio: '',
  bioHtml: '',
  website: '',
  photoURL: null,
  slug: '',
  socialMedia: { facebook: '', instagram: '', sharePublicly: false },
  updatedAt: null,
};

function normalize(data) {
  if (!data) return EMPTY_PROFILE;
  const sm = data.socialMedia && typeof data.socialMedia === 'object' ? data.socialMedia : {};
  return {
    displayName: data.displayName || '',
    bio: data.bio || '',
    bioHtml: data.bioHtml || '',
    website: data.website || '',
    photoURL: data.photoURL || null,
    slug: data.slug || '',
    socialMedia: {
      facebook: typeof sm.facebook === 'string' ? sm.facebook : '',
      instagram: typeof sm.instagram === 'string' ? sm.instagram : '',
      sharePublicly: sm.sharePublicly === true,
    },
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
