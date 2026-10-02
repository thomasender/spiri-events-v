#!/usr/bin/env node
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.GCLOUD_PROJECT = 'spirieventsvbg';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ projectId: 'spirieventsvbg' });
const db = getFirestore();

async function findAdminUid() {
  const adminDoc = await db.collection('admin_users').limit(1).get();
  if (adminDoc.empty) return null;
  return adminDoc.docs[0].id;
}

const id = process.argv[2];
if (!id) {
  console.error('Usage: node create-throwaway-approved-event.mjs <event-id>');
  process.exit(1);
}

const adminUid = await findAdminUid();
if (!adminUid) {
  console.error('Admin fixture not found. Run scripts/seed-test-events.mjs first.');
  process.exit(1);
}

const today = new Date();
today.setDate(today.getDate() + 8);
const date = today.toISOString().split('T')[0];

// One-off approved event with `approvedAt` = now, so it shows up in the
// "Genehmigt in den letzten 7 Tagen" section of the Review tab during tests.
// Each test owns its own throwaway id and deletes it in the finally block,
// so we don't fight other specs for it.
await db
  .collection('events')
  .doc(id)
  .set({
    title: `Throwaway Approved ${id}`,
    slug: id,
    date,
    endDate: null,
    time: '09:00',
    endTime: '10:00',
    place: 'Throwaway Approved Place',
    description: 'Disposable approved event created for a single destructive test.',
    category: 'Sonstiges',
    bezirk: 'Bregenz',
    organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'admin@test.com', photoURL: null },
    kontakt: 'anna@example.com',
    status: 'approved',
    createdBy: adminUid,
    createdAt: Timestamp.now(),
    approvedBy: adminUid,
    approvedAt: Timestamp.now(),
  });

console.log(`Created throwaway approved event ${id}`);