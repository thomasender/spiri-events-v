#!/usr/bin/env node
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.GCLOUD_PROJECT = 'spirieventsvbg';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ projectId: 'spirieventsvbg' });
const db = getFirestore();

const feedbackSnap = await db.collection('feedback').get();
await Promise.all(feedbackSnap.docs.map((docSnap) => docSnap.ref.delete()));

const now = Date.now();

await db
  .collection('feedback')
  .doc('seed-feedback-1')
  .set({
    description: 'Die Filterung der Bezirke ist etwas verwirrend, könnte man besser beschriften.',
    name: 'Peter Mathis',
    email: 'peter@example.com',
    pageUrl: 'https://events.thetribe.at/',
    pageTitle: 'Tribe Vorarlberg',
    userAgent: 'Mozilla/5.0 integration test',
    userId: null,
    screenshotUrl: null,
    status: 'new',
    createdAt: Timestamp.fromMillis(now - 60_000),
  });

await db
  .collection('feedback')
  .doc('seed-feedback-2')
  .set({
    description: 'Super Plattform, weiter so!',
    name: '',
    email: '',
    pageUrl: 'https://events.thetribe.at/event/yoga-heute-yogastudio-dornbirn-20260807',
    pageTitle: 'Yoga heute',
    userAgent: 'Mozilla/5.0 integration test',
    userId: null,
    screenshotUrl: null,
    status: 'new',
    createdAt: Timestamp.fromMillis(now),
  });

await db
  .collection('feedback')
  .doc('seed-feedback-3')
  .set({
    description: 'Bezirks-Filter wirft einen 404, wenn ich Bregenz wähle.',
    name: 'Anna',
    email: 'anna@example.com',
    pageUrl: 'https://events.thetribe.at/?foo=bar#section',
    pageTitle: '',
    userAgent: 'Mozilla/5.0 integration test',
    userId: null,
    screenshotUrl: 'https://example.invalid/seed-feedback-screenshot.png',
    status: 'new',
    createdAt: Timestamp.fromMillis(now - 30_000),
  });

console.log('Seeded 3 feedback documents (all with status=new).');
