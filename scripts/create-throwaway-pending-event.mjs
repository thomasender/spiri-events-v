process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.GCLOUD_PROJECT = 'spirieventsvbg';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ projectId: 'spirieventsvbg' });
const db = getFirestore();

async function getUserUid() {
  const usersSnap = await db.collection('users').get();
  for (const d of usersSnap.docs) {
    const data = d.data();
    if (data.contact === 'user@test.local') return d.id;
  }
  return null;
}

const id = process.argv[2];
if (!id) {
  console.error('Usage: node create-throwaway-pending-event.mjs <event-id>');
  process.exit(1);
}

const userUid = await getUserUid();
if (!userUid) {
  console.error('User fixture not found. Run scripts/seed-test-events.mjs first.');
  process.exit(1);
}

const today = new Date();
today.setDate(today.getDate() + 8);
const date = today.toISOString().split('T')[0];

// One-off pending event, private to a single test (destructive delete-flow
// tests should create/own their own throwaway fixture instead of permanently
// deleting a shared one that other specs also depend on).
await db
  .collection('events')
  .doc(id)
  .set({
    title: `Throwaway Pending ${id}`,
    slug: id,
    date,
    endDate: null,
    time: '14:00',
    endTime: '15:00',
    place: 'Throwaway Place',
    description: 'Disposable pending event created for a single destructive test.',
    category: 'Sonstiges',
    bezirk: 'Bludenz',
    organizer: { firstName: 'Test', lastName: 'User', email: 'user@test.local', photoURL: null },
    kontakt: '0676 5550000',
    status: 'pending',
    createdBy: userUid,
    createdAt: Timestamp.now(),
  });

console.log(`Created throwaway pending event ${id}`);
