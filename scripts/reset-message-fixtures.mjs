#!/usr/bin/env node
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.GCLOUD_PROJECT = 'spirieventsvbg';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ projectId: 'spirieventsvbg' });
const db = getFirestore();

const MESSAGE_EVENT_ID = 'test-event-with-messages';

async function findAdminUid() {
  const adminDoc = await db.collection('admin_users').limit(1).get();
  if (adminDoc.empty) return null;
  return adminDoc.docs[0].id;
}

async function findUserUid() {
  const usersSnap = await db.collection('users').get();
  for (const d of usersSnap.docs) {
    const data = d.data();
    if (data.contact === 'user@test.local') return d.id;
  }
  return null;
}

const adminUid = await findAdminUid();
const userUid = await findUserUid();

if (!adminUid || !userUid) {
  console.error('Required test users not found. Run scripts/seed-test-events.mjs first.');
  process.exit(1);
}

const eventRef = db.collection('events').doc(MESSAGE_EVENT_ID);
const existingMessages = await eventRef.collection('messages').get();
await Promise.all(existingMessages.docs.map((docSnap) => docSnap.ref.delete()));

const today = new Date();
const futureDate = new Date(today);
futureDate.setDate(futureDate.getDate() + 8);
const date = futureDate.toISOString().split('T')[0];

const slug = `test-event-with-messages-test-place-${date.replace(/-/g, '')}`;

await eventRef.set({
  id: MESSAGE_EVENT_ID,
  title: 'Test Event With Messages',
  date,
  endDate: null,
  time: '14:00',
  endTime: '15:30',
  place: 'Test Place',
  description: 'Pending event owned by a regular user with seeded admin messages.',
  category: 'Sonstiges',
  bezirk: 'Bludenz',
  organizer: { firstName: 'Test', lastName: 'User', email: 'user@test.local', photoURL: null },
  kontakt: '0676 5556677',
  status: 'pending',
  slug,
  createdBy: userUid,
  createdAt: Timestamp.now(),
});

const messagesRef = eventRef.collection('messages');
const now = Timestamp.now();

await messagesRef.doc('seed-admin-msg-1').set({
  text: 'Bitte überarbeite den Ort etwas genauer.',
  authorUid: adminUid,
  authorRole: 'Admin',
  authorName: 'Test Admin',
  createdAt: now,
  readByRecipient: false,
});

await messagesRef.doc('seed-admin-msg-2').set({
  text: 'Auch die Bezirksangabe fehlt noch.',
  authorUid: adminUid,
  authorRole: 'Admin',
  authorName: 'Test Admin',
  createdAt: Timestamp.fromMillis(now.toMillis() + 1000),
  readByRecipient: false,
});

await messagesRef.doc('seed-user-msg-1').set({
  text: 'Danke für den Hinweis, ich passe es an.',
  authorUid: userUid,
  authorRole: 'User',
  authorName: 'Test User',
  createdAt: Timestamp.fromMillis(now.toMillis() + 2000),
  readByRecipient: false,
});

console.log(`Seeded ${MESSAGE_EVENT_ID} with 3 messages (2 unread for ${userUid}).`);