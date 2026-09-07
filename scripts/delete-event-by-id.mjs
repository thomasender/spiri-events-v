process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.GCLOUD_PROJECT = 'spirieventsvbg';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, deleteDoc, doc } from 'firebase-admin/firestore';

initializeApp({ projectId: 'spirieventsvbg' });

const id = process.argv[2];
if (!id) {
  console.error('Usage: node delete-event-by-id.mjs <event-id>');
  process.exit(1);
}

try {
  await deleteDoc(doc(getFirestore(), 'events', id));
  console.log(`Deleted ${id}`);
} catch (err) {
  console.error(`Failed to delete ${id}:`, err.message);
  process.exit(1);
}
