#!/usr/bin/env node
/**
 * Permanently deletes events that have been in the trash for more than 30 days.
 *
 * For each event with status='trashed' and trashedAt older than the retention
 * window, this script:
 *   1. Deletes all files under events/{id}/ in Firebase Storage
 *   2. Deletes all documents in events/{id}/messages/ (subcollection)
 *   3. Deletes the parent events/{id} document
 *
 * Designed to be run from GitHub Actions via .github/workflows/purge-trashed-events.yml
 * (or locally against the Firestore emulator for testing).
 *
 * Authentication: requires a service account JSON. Set GOOGLE_APPLICATION_CREDENTIALS
 * to the service account file path, or set FIREBASE_SERVICE_ACCOUNT_JSON to the raw
 * JSON contents (the workflow does the latter).
 *
 * Configuration via env vars:
 *   PROJECT_ID          Firebase project id (default: spirieventsvbg)
 *   STORAGE_BUCKET      Storage bucket name (default: <project-id>.appspot.com)
 *   TRASH_RETENTION_DAYS  Days before trash becomes eligible for purge (default: 30)
 *   DRY_RUN             If "true", only logs what would be deleted
 *   FIRESTORE_EMULATOR_HOST  Set automatically when running against the emulator
 */

import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const PROJECT_ID = process.env.PROJECT_ID || 'spirieventsvbg';
const STORAGE_BUCKET =
  process.env.STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`;
const RETENTION_DAYS = Number.parseInt(process.env.TRASH_RETENTION_DAYS || '30', 10);
const DRY_RUN = process.env.DRY_RUN === 'true';

function initFirebase() {
  if (getApps().length > 0) return;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({
      credential: cert(credentials),
      projectId: PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({
      credential: applicationDefault(),
      projectId: PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
    });
  } else {
    initializeApp({
      projectId: PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
    });
  }
}

async function listFiles(bucket, prefix) {
  const [files] = await bucket.getFiles({ prefix, maxResults: 1000 });
  return files;
}

async function deleteMessages(db, eventId) {
  const messagesRef = db.collection('events').doc(eventId).collection('messages');
  const snapshot = await messagesRef.listDocuments();
  if (snapshot.length === 0) return 0;
  await Promise.all(snapshot.map((ref) => ref.delete()));
  return snapshot.length;
}

async function purgeEvent(db, bucket, eventId) {
  if (!DRY_RUN) {
    const files = await listFiles(bucket, `events/${eventId}/`);
    await Promise.all(files.map((file) => file.delete()));
    await deleteMessages(db, eventId);
    await db.collection('events').doc(eventId).delete();
  }
  return true;
}

async function main() {
  initFirebase();

  const db = getFirestore();
  const bucket = getStorage().bucket();

  const cutoff = Timestamp.fromMillis(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  console.log(
    `[purge-trashed-events] project=${PROJECT_ID} retention=${RETENTION_DAYS}d dryRun=${DRY_RUN} cutoff=${cutoff.toDate().toISOString()}`
  );

  const snapshot = await db
    .collection('events')
    .where('status', '==', 'trashed')
    .where('trashedAt', '<=', cutoff)
    .get();

  if (snapshot.empty) {
    console.log('[purge-trashed-events] No trashed events older than retention window. Done.');
    return;
  }

  console.log(`[purge-trashed-events] Found ${snapshot.size} event(s) to purge.`);

  let purged = 0;
  for (const doc of snapshot.docs) {
    const eventId = doc.id;
    const title = doc.data().title || '(untitled)';
    try {
      await purgeEvent(db, bucket, eventId);
      console.log(`[purge-trashed-events]   - purged ${eventId} (${title})`);
      purged += 1;
    } catch (err) {
      console.error(`[purge-trashed-events]   ! failed ${eventId} (${title}):`, err.message);
    }
  }

  console.log(`[purge-trashed-events] Done. Purged ${purged}/${snapshot.size} event(s).`);
}

main().catch((err) => {
  console.error('[purge-trashed-events] Fatal:', err);
  process.exit(1);
});
