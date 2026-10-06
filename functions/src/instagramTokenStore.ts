import type { Firestore } from 'firebase-admin/firestore';
import type { StoredToken } from './instagram/instagramToken';

function toDate(value: unknown): Date | null {
  return value && typeof (value as { toDate?: unknown }).toDate === 'function'
    ? (value as { toDate(): Date }).toDate()
    : null;
}

/** Reads instagram_private/token (Admin SDK only; clients have no access). */
export async function readStoredInstagramToken(db: Firestore): Promise<StoredToken | null> {
  const snap = await db.doc('instagram_private/token').get();
  if (!snap.exists) return null;
  const accessToken = snap.get('accessToken');
  const expiresAt = toDate(snap.get('expiresAt'));
  if (typeof accessToken !== 'string' || !accessToken || !expiresAt) return null;
  return { accessToken, expiresAt, refreshedAt: toDate(snap.get('refreshedAt')) };
}
