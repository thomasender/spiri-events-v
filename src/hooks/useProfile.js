import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { splitProfileData } from '../utils/profile';
import { findUniqueProfileSlug, slugifyName } from '../lib/slug';

export const NOTIFICATION_PREFERENCE_KEYS = [
  'notifyOnSubmitted',
  'notifyOnChangesRequested',
  'notifyOnPublished',
  'notifyOnDeleted',
];

const DEFAULT_NOTIFICATION_PREFERENCES = {
  notifyOnSubmitted: true,
  notifyOnChangesRequested: true,
  notifyOnPublished: true,
  notifyOnDeleted: true,
};

const EMPTY_PROFILE = {
  displayName: '',
  bio: '',
  website: '',
  contact: '',
  photoURL: null,
  slug: '',
  createdAt: null,
  updatedAt: null,
};

function normalizePreferences(data) {
  const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  for (const key of NOTIFICATION_PREFERENCE_KEYS) {
    if (typeof data[key] === 'boolean') {
      prefs[key] = data[key];
    }
  }
  return prefs;
}

function normalize(data) {
  if (!data) return EMPTY_PROFILE;
  return {
    displayName: data.displayName || '',
    bio: data.bio || '',
    website: data.website || '',
    contact: data.contact || '',
    photoURL: data.photoURL || null,
    slug: data.slug || '',
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export function useProfile(uid) {
  const [profile, setProfile] = useState(null);
  const [notificationPreferences, setNotificationPreferences] = useState(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    setProfile(null);
    setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
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
          setNotificationPreferences(normalizePreferences(snap.data()));
          setExists(true);
        } else {
          setProfile(EMPTY_PROFILE);
          setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
          setExists(false);
        }
        setLoading(false);
      },
      (err) => {
        console.error('useProfile error:', err);
        setProfile(EMPTY_PROFILE);
        setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
        setExists(false);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  const save = async (updates) => {
    if (!uid) throw new Error('Cannot save profile without a uid');
    const profileRef = doc(db, 'users', uid);
    const publicProfileRef = doc(db, 'users', uid, 'publicProfile', 'data');
    const updatedAt = serverTimestamp();

    const currentSlug = profile?.slug || '';
    let nextSlug = currentSlug;
    if (updates.displayName !== undefined) {
      const desiredSlug = slugifyName(updates.displayName);
      if (!currentSlug || slugifyName(profile?.displayName) !== desiredSlug) {
        nextSlug = await findUniqueProfileSlug(updates.displayName, uid);
      }
    }

    const payload = {
      ...updates,
      slug: nextSlug,
      updatedAt,
    };
    if (!exists) {
      payload.createdAt = serverTimestamp();
    }
    const { publicDoc } = splitProfileData(updates);
    const batch = writeBatch(db);
    batch.set(profileRef, payload, { merge: true });
    if (Object.keys(publicDoc).length > 0 || nextSlug !== currentSlug) {
      const publicPayload = {
        ...publicDoc,
        slug: nextSlug,
        updatedAt,
      };
      batch.set(publicProfileRef, publicPayload, { merge: true });
    }
    await batch.commit();
    return nextSlug;
  };

  return {
    profile,
    notificationPreferences,
    loading,
    exists,
    save,
  };
}
