import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (getApps().length === 0) {
  initializeApp();
}

const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000;

export interface AdminAccount {
  uid: string;
  email: string;
}

interface AdminCache {
  accounts: AdminAccount[];
  fetchedAt: number;
}

let cache: AdminCache | null = null;
let inflight: Promise<AdminAccount[]> | null = null;

async function fetchAdminAccounts(): Promise<AdminAccount[]> {
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
    const accounts: AdminAccount[] = [];
    for (const user of result.users) {
      if (typeof user.email === 'string' && user.email.length > 0) {
        accounts.push({ uid: user.uid, email: user.email });
      }
    }
    return accounts;
  } catch (err) {
    logger.error('Failed to resolve admin emails via firebase-admin', err);
    return [];
  }
}

async function loadAdminAccounts(): Promise<AdminAccount[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < ADMIN_CACHE_TTL_MS) {
    return cache.accounts;
  }
  if (inflight) {
    return inflight;
  }
  inflight = fetchAdminAccounts()
    .then((accounts) => {
      cache = { accounts, fetchedAt: Date.now() };
      return accounts;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function getAdminAccounts(): Promise<AdminAccount[]> {
  return loadAdminAccounts();
}

export async function getAdminEmails(): Promise<string[]> {
  const accounts = await loadAdminAccounts();
  return accounts.map((account) => account.email);
}

export function resetAdminEmailCache(): void {
  cache = null;
}
