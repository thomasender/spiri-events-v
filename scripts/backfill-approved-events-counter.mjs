#!/usr/bin/env node
/**
 * Seeds `app_settings/approvedEventsCounter` with the number of events that are
 * approved right now, so the counter (kept up to date by the Cloud Function
 * `onEventApprovedCount`) starts with the history since go-live. Events that
 * were approved and later deleted are not in Firestore any more and cannot be
 * counted.
 *
 * Dry run by default. Pass --write to actually set the value. Run it ONCE,
 * after the function is deployed (it overwrites `count`).
 *
 * Authentication: service account JSON, same as backfill-event-city.mjs
 * (GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON).
 *
 * Usage:
 *   node scripts/backfill-approved-events-counter.mjs
 *   node scripts/backfill-approved-events-counter.mjs --write
 */

import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.PROJECT_ID || 'spirieventsvbg';
const WRITE = process.argv.includes('--write');

if (getApps().length === 0) {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  initializeApp({
    projectId: PROJECT_ID,
    credential: json ? cert(JSON.parse(json)) : applicationDefault(),
  });
}

const db = getFirestore();
const agg = await db.collection('events').where('status', '==', 'approved').count().get();
const count = agg.data().count;
console.log(`Approved events right now: ${count}`);

if (!WRITE) {
  console.log('Dry run, nothing written. Pass --write to set the counter.');
} else {
  await db
    .collection('app_settings')
    .doc('approvedEventsCounter')
    .set({ count, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  console.log('Counter set.');
}
