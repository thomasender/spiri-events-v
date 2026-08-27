process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.GCLOUD_PROJECT = 'spirieventsvbg';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'spirieventsvbg' });
const db = getFirestore();

// test-event-with-messages (seeded by reset-message-fixtures.mjs) is a permanent,
// widely-shared 'pending' fixture with messages attached. Tests that assert the
// admin Nachrichten tab is *empty* need it to have zero messages first; any spec
// that needs the messages back re-seeds them itself in its own beforeEach.
const eventRef = db.collection('events').doc('test-event-with-messages');
const messages = await eventRef.collection('messages').get();
await Promise.all(messages.docs.map((docSnap) => docSnap.ref.delete()));

console.log(`Cleared ${messages.size} message(s) from test-event-with-messages`);
