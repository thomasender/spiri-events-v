import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { isEventExpired } from './eventExpiry';

if (getApps().length === 0) {
  initializeApp();
}

const REGION = 'europe-west3';

function storagePathFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const m = url.match(/^https?:\/\/firebasestorage\.googleapis\.com\/v\d+\/b\/[^/]+\/o\/([^?]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

// Vienna calendar day, so "today" matches what organizers see.
function viennaToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}

export const purgeExpiredEvents = onSchedule(
  { region: REGION, schedule: 'every day 03:30', timeZone: 'Europe/Vienna' },
  async () => {
    const db = getFirestore();
    const bucket = getStorage().bucket();
    const today = viennaToday();
    const snap = await db.collection('events').get();
    let deleted = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      // Trashed events follow the separate trash retention.
      if (data.status === 'trashed') continue;
      if (!isEventExpired(data, today)) continue;
      try {
        const path = storagePathFromUrl(data.imageUrl);
        if (path) await bucket.file(path).delete({ ignoreNotFound: true });
        await db.recursiveDelete(doc.ref);
        deleted += 1;
      } catch (err) {
        logger.error('Failed to purge expired event', {
          id: doc.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    logger.info('Purged expired events', { deleted, scanned: snap.size });
  }
);
