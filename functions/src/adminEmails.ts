import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (getApps().length === 0) {
  initializeApp();
}

const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000;

interface AdminCache {
  emails: string[];
  fetchedAt: number;
}

let cache: AdminCache | null = null;
let inflight: Promise<string[]> | null = null;

async function fetchAdminEmails(): Promise<string[]> {
  const db = getFirestore();
  const snapshot = await db.collection('admin_users').get();
  const uids = snapshot.docs.map((doc) => doc.id).filter((uid) => typeof uid === 'string' && uid);
  if (uids.length === 0) {
    logger.warn('No admin_users documents found; "submitted" emails will have no recipient.');
    return [];
  }

  try {
    const auth = getAuth();
    const result = await auth.getUsers(uids.map((uid) => ({ uid })));
    const emails = result.users
      .map((user) => user.email)
      .filter((email): email is string => typeof email === 'string' && email.length > 0);
    return emails;
  } catch (err) {
    logger.error('Failed to resolve admin emails via firebase-admin', err);
    return [];
  }
}

export async function getAdminEmails(): Promise<string[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < ADMIN_CACHE_TTL_MS) {
    return cache.emails;
  }
  if (inflight) {
    return inflight;
  }
  inflight = fetchAdminEmails()
    .then((emails) => {
      cache = { emails, fetchedAt: Date.now() };
      return emails;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function resetAdminEmailCache(): void {
  cache = null;
}
