process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.GCLOUD_PROJECT = 'spirieventsvbg';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'spirieventsvbg' });
const db = getFirestore();

const action = process.argv[2];

const IMAGE_URL =
  'https://firebasestorage.googleapis.com/v0/b/spirieventsvbg.appspot.com/o/events%2Ftest-event-today%2Foriginal-event-picture.jpg?alt=media';

if (action === 'set') {
  await db
    .collection('events')
    .doc('test-event-today')
    .set({ imageUrl: IMAGE_URL }, { merge: true });
  console.log(`Set imageUrl on test-event-today`);
} else if (action === 'clear') {
  await db.collection('events').doc('test-event-today').set({ imageUrl: null }, { merge: true });
  console.log(`Cleared imageUrl on test-event-today`);
} else {
  console.error(`Unknown action: ${action}`);
  process.exit(1);
}

process.exit(0);
