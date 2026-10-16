#!/usr/bin/env node
/**
 * Deletes storage files under events/{id}/ and event-descriptions/{id}/ whose
 * event document no longer exists (left behind by earlier purges). Files still referenced by an event document
 * and files younger than 2 days are kept.
 *
 * DRY_RUN defaults to true and only lists. Set DRY_RUN=false to delete.
 * Auth: GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON.
 * Env: PROJECT_ID (default spirieventsvbg), STORAGE_BUCKET.
 */
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const PROJECT_ID = process.env.PROJECT_ID || 'spirieventsvbg';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`;
const DRY_RUN = process.env.DRY_RUN !== 'false';
const ROOTS = ['events', 'event-descriptions'];

if (getApps().length === 0) {
  const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
    : applicationDefault();
  initializeApp({ credential, projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET });
}

const db = getFirestore();
const bucket = getStorage().bucket();
const eventDocs = (await db.collection('events').get()).docs;
const ids = new Set(eventDocs.map((d) => d.id));
// Description images of unsaved events live under event-descriptions/temp/ and
// stay referenced from the published description, so anything whose name shows
// up in an event document is kept. Fresh uploads may belong to an open draft.
const haystack = eventDocs.map((d) => JSON.stringify(d.data())).join('\n');
const MIN_AGE_MS = 2 * 24 * 60 * 60 * 1000;
console.log(`[orphans] project=${PROJECT_ID} dryRun=${DRY_RUN} events=${ids.size}`);

let orphans = 0;
for (const root of ROOTS) {
  const [files] = await bucket.getFiles({ prefix: `${root}/` });
  for (const file of files) {
    const id = file.name.split('/')[1];
    if (!id || ids.has(id)) continue;
    // Names are `{13-digit timestamp}_{original name}`; the timestamp is unique and
    // survives URL encoding, so it is the safest thing to look for.
    const stamp = file.name.split('/').pop().split('_')[0];
    if (haystack.includes(stamp)) continue;
    const created = Number(file.metadata.timeCreated ? Date.parse(file.metadata.timeCreated) : 0);
    if (Date.now() - created < MIN_AGE_MS) continue;
    orphans += 1;
    console.log(`[orphans] ${DRY_RUN ? 'would delete' : 'deleting'} ${file.name}`);
    if (!DRY_RUN) await file.delete({ ignoreNotFound: true });
  }
}
console.log(`[orphans] Done. ${orphans} orphaned file(s).`);
