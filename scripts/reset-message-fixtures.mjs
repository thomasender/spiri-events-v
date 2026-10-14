#!/usr/bin/env node
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.GCLOUD_PROJECT = 'spirieventsvbg';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { generateEventSlug } from '../src/lib/slug-helpers.js';

initializeApp({ projectId: 'spirieventsvbg' });
const db = getFirestore();

const MESSAGE_EVENT_ID = 'test-event-with-messages';

async function findAdminUid() {
  const adminDoc = await db.collection('admin_users').where('role', '==', 'Admin').limit(1).get();
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

// One batch for the whole reset: several specs run this while the app may be
// listening to the same event, and a doc-by-doc reset let them see the event
// without messages, or with only some of them, in between.
const batch = db.batch();
const eventRef = db.collection('events').doc(MESSAGE_EVENT_ID);
const messagesRef = eventRef.collection('messages');
const SEEDED_IDS = new Set(['seed-admin-msg-1', 'seed-admin-msg-2', 'seed-user-msg-1']);
const existingMessages = await messagesRef.get();
existingMessages.docs
  .filter((docSnap) => !SEEDED_IDS.has(docSnap.id))
  .forEach((docSnap) => batch.delete(docSnap.ref));

const today = new Date();
const futureDate = new Date(today);
futureDate.setDate(futureDate.getDate() + 8);
const date = futureDate.toISOString().split('T')[0];

const slug = generateEventSlug('Test Event With Messages', 'Sonstiges', 'Bludenz', date);

batch.set(eventRef, {
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

const now = Timestamp.now();

batch.set(messagesRef.doc('seed-admin-msg-1'), {
  text: 'Bitte überarbeite den Ort etwas genauer.',
  authorUid: adminUid,
  authorRole: 'Admin',
  authorName: 'Test Admin',
  createdAt: now,
  readByRecipient: false,
});

batch.set(messagesRef.doc('seed-admin-msg-2'), {
  text: 'Auch die Bezirksangabe fehlt noch.',
  authorUid: adminUid,
  authorRole: 'Admin',
  authorName: 'Test Admin',
  createdAt: Timestamp.fromMillis(now.toMillis() + 1000),
  readByRecipient: false,
});

batch.set(messagesRef.doc('seed-user-msg-1'), {
  text: 'Danke für den Hinweis, ich passe es an.',
  authorUid: userUid,
  authorRole: 'User',
  authorName: 'Test User',
  createdAt: Timestamp.fromMillis(now.toMillis() + 2000),
  readByRecipient: false,
});

await batch.commit();
console.log(`Seeded ${MESSAGE_EVENT_ID} with 3 messages (2 unread for ${userUid}).`);
