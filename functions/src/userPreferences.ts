import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_SITE_ORIGIN, resolveSiteOrigin } from './siteOrigin';

if (getApps().length === 0) {
  initializeApp();
}

export type PreferenceKey =
  | 'notifyOnSubmitted'
  | 'notifyOnChangesRequested'
  | 'notifyOnPublished'
  | 'notifyOnDeleted'
  | 'notifyNewsletter'
  | 'notifyOnContactMessage'
  | 'notifyOnFavoriteCancelled'
  | 'notifyOnDirectMessage'
  | 'notifyOnEventChat';

export type NotificationPreferenceMap = Record<PreferenceKey, boolean>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceMap = {
  notifyOnSubmitted: true,
  notifyOnChangesRequested: true,
  notifyOnPublished: true,
  notifyOnDeleted: true,
  notifyNewsletter: false,
  notifyOnContactMessage: true,
  notifyOnFavoriteCancelled: true,
  // Chat mails (docs/messenger.md, docs/chat.md): on unless switched off in the profile.
  notifyOnDirectMessage: true,
  notifyOnEventChat: true,
};

function readBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function normalizePreferences(
  data: FirebaseFirestore.DocumentData | undefined
): NotificationPreferenceMap {
  const prefs: NotificationPreferenceMap = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  if (!data) return prefs;
  for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES) as PreferenceKey[]) {
    const value = readBool(data[key]);
    if (value !== null) prefs[key] = value;
  }
  return prefs;
}

export async function getUserNotificationPreferences(
  uid: string | null | undefined
): Promise<NotificationPreferenceMap> {
  if (!uid) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  try {
    const db = getFirestore();
    const snap = await db.collection('users').doc(uid).get();
    return normalizePreferences(snap.data());
  } catch (err) {
    logger.warn('Failed to read user notification preferences; using defaults', { uid, err });
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

export async function getUsersNotificationPreferences(
  uids: string[]
): Promise<Map<string, NotificationPreferenceMap>> {
  const map = new Map<string, NotificationPreferenceMap>();
  const unique = Array.from(new Set(uids.filter((uid): uid is string => Boolean(uid))));
  if (unique.length === 0) return map;
  try {
    const db = getFirestore();
    const refs = unique.map((uid) => db.collection('users').doc(uid));
    const snaps = await db.getAll(...refs);
    for (let i = 0; i < unique.length; i += 1) {
      const uid = unique[i];
      const snap = snaps[i];
      map.set(uid, normalizePreferences(snap.data()));
    }
  } catch (err) {
    logger.warn('Failed batch-read of user notification preferences; using defaults', { err });
    for (const uid of unique) {
      map.set(uid, { ...DEFAULT_NOTIFICATION_PREFERENCES });
    }
  }
  return map;
}

/**
 * Domain each user registered on (`users/{uid}.siteOrigin`), for the links in
 * their mails. Users without one (accounts from before the domain change) and
 * unreadable docs get the default.
 */
export async function getUsersSiteOrigins(uids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(uids.filter((uid): uid is string => Boolean(uid))));
  if (unique.length === 0) return map;
  try {
    const db = getFirestore();
    const snaps = await db.getAll(...unique.map((uid) => db.collection('users').doc(uid)));
    unique.forEach((uid, i) => map.set(uid, resolveSiteOrigin(snaps[i].data()?.siteOrigin)));
  } catch (err) {
    logger.warn('Failed batch-read of user site origins; using default', { err });
    for (const uid of unique) map.set(uid, DEFAULT_SITE_ORIGIN);
  }
  return map;
}

export async function getUserSiteOrigin(uid: string | null | undefined): Promise<string> {
  if (!uid) return DEFAULT_SITE_ORIGIN;
  return (await getUsersSiteOrigins([uid])).get(uid) ?? DEFAULT_SITE_ORIGIN;
}
