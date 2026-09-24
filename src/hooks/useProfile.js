import { useState, useEffect } from 'react';
import {
  doc,
  onSnapshot,
  setDoc,
  writeBatch,
  serverTimestamp,
  deleteField,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { splitProfileData } from '../utils/profile';
import { findUniqueProfileSlug, slugifyName } from '../lib/slug';
import { normalizeUsername } from '../utils/username';

export const NOTIFICATION_PREFERENCE_KEYS = [
  'notifyOnSubmitted',
  'notifyOnChangesRequested',
  'notifyOnPublished',
  'notifyOnDeleted',
  'notifyNewsletter',
];

const DEFAULT_NOTIFICATION_PREFERENCES = {
  notifyOnSubmitted: true,
  notifyOnChangesRequested: true,
  notifyOnPublished: true,
  notifyOnDeleted: true,
  notifyNewsletter: false,
};

const EMPTY_PROFILE = {
  displayName: '',
  bio: '',
  bioHtml: '',
  website: '',
  contact: '',
  photoURL: null,
  slug: '',
  username: '',
  socialMedia: { facebook: '', instagram: '', sharePublicly: false },
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

function normalizeSocialMedia(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  return {
    facebook: typeof obj.facebook === 'string' ? obj.facebook : '',
    instagram: typeof obj.instagram === 'string' ? obj.instagram : '',
    sharePublicly: obj.sharePublicly === true,
  };
}

function normalize(data) {
  if (!data) return EMPTY_PROFILE;
  return {
    displayName: data.displayName || '',
    bio: data.bio || '',
    bioHtml: data.bioHtml || '',
    website: data.website || '',
    contact: data.contact || '',
    photoURL: data.photoURL || null,
    slug: data.slug || '',
    username: normalizeUsername(data.username || ''),
    socialMedia: normalizeSocialMedia(data.socialMedia),
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
    const currentUsername = normalizeUsername(profile?.username || '');
    const hasUsernameUpdate = Object.prototype.hasOwnProperty.call(updates, 'username');
    const incomingUsername = hasUsernameUpdate
      ? normalizeUsername(updates.username || '')
      : currentUsername;
    const effectiveDisplayName =
      updates.displayName !== undefined ? updates.displayName : profile?.displayName || '';

    let nextSlug = currentSlug;
    if (incomingUsername) {
      // Username is the source of truth for the public path. Re-derive when
      // it changed or when we still need a first slug for this user.
      if (incomingUsername !== currentUsername || !currentSlug) {
        nextSlug = await findUniqueProfileSlug(incomingUsername, uid);
      }
    } else if (!currentSlug && effectiveDisplayName) {
      // First save for a brand-new user without a username: fall back to
      // the displayName so the public URL is non-empty by default.
      nextSlug = await findUniqueProfileSlug(effectiveDisplayName, uid);
    } else if (updates.displayName !== undefined && !currentUsername && !incomingUsername) {
      // Legacy behaviour for users who never set a username: keep the slug
      // in sync with displayName changes so the public URL stays stable.
      const desiredSlug = slugifyName(effectiveDisplayName);
      if (slugifyName(profile?.displayName) !== desiredSlug) {
        nextSlug = await findUniqueProfileSlug(effectiveDisplayName, uid);
      }
    }

    const payload = {
      ...updates,
      username: incomingUsername,
      slug: nextSlug,
      updatedAt,
    };
    if (!exists) {
      payload.createdAt = serverTimestamp();
    }

    // Split the original updates (not the full payload) so callers that only
    // touch private fields don't accidentally write to the public doc.
    // Normalise username here so the public mirror receives the canonical
    // form regardless of the casing/whitespace in `updates`.
    const normalisedUpdates =
      'username' in updates ? { ...updates, username: incomingUsername } : updates;
    const { publicDoc } = splitProfileData(normalisedUpdates);

    // socialMedia is mirrored to the publicProfile doc only when the user has
    // opted in via sharePublicly. Toggling it off after a previous on must
    // actively remove the field so it does not linger for public readers.
    if ('socialMedia' in publicDoc) {
      const wasPubliclyShared = profile?.socialMedia?.sharePublicly === true;
      const willBePubliclyShared =
        updates.socialMedia?.sharePublicly !== undefined
          ? updates.socialMedia.sharePublicly === true
          : wasPubliclyShared;

      if (willBePubliclyShared) {
        const sm =
          publicDoc.socialMedia && typeof publicDoc.socialMedia === 'object'
            ? publicDoc.socialMedia
            : {};
        publicDoc.socialMedia = {
          facebook: typeof sm.facebook === 'string' ? sm.facebook.trim() : '',
          instagram: typeof sm.instagram === 'string' ? sm.instagram.trim() : '',
          sharePublicly: true,
        };
      } else if (wasPubliclyShared) {
        publicDoc.socialMedia = deleteField();
      } else {
        delete publicDoc.socialMedia;
      }
    }

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
