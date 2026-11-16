import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { isEventExpired } from './eventExpiry';
import { deleteEventAssets } from './eventStorageCleanup';
import { shouldPurgeRegistrations } from './eventRegistrationLogic';

if (getApps().length === 0) {
  initializeApp();
}

const REGION = 'europe-west3';

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
    let registrationsPurged = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      // Event registrations (name + contact, docs/event-registration.md) are only
      // kept until the event is over, long before the event itself is purged.
      if (shouldPurgeRegistrations(data, today) && !isEventExpired(data, today)) {
        try {
          for (const name of ['registrations', 'registration_mails']) {
            const col = doc.ref.collection(name);
            if ((await col.limit(1).get()).empty) continue;
            await db.recursiveDelete(col);
            registrationsPurged += 1;
          }
        } catch (err) {
          logger.error('Failed to purge event registrations', {
            id: doc.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      // Trashed events follow the separate trash retention.
      if (data.status === 'trashed') continue;
      if (!isEventExpired(data, today)) continue;
      try {
        await deleteEventAssets(bucket, doc.id);
        await db.recursiveDelete(doc.ref);
        deleted += 1;
      } catch (err) {
        logger.error('Failed to purge expired event', {
          id: doc.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    logger.info('Purged expired events', { deleted, registrationsPurged, scanned: snap.size });
  }
);
