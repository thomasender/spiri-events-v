#!/usr/bin/env node
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.GCLOUD_PROJECT = 'spirieventsvbg';

initializeApp({ projectId: 'spirieventsvbg' });
const db = getFirestore();

const action = process.argv[2];
const title = process.argv[3];

if (!action || !title) {
  console.error('Usage: node scripts/verify-copyright-confirmation.mjs <inspect|cleanup> <title>');
  process.exit(1);
}

async function inspect(title) {
  const snapshot = await db.collection('events').where('title', '==', title).get();
  const matches = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => {
      const aTs = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const bTs = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return aTs - bTs;
    });

  if (matches.length === 0) {
    console.log(JSON.stringify({ found: false }));
    return;
  }

  const newest = matches[matches.length - 1];
  console.log(
    JSON.stringify({
      found: true,
      id: newest.id,
      rightsConfirmed: newest.rightsConfirmed === true,
      hasRightsConfirmedAt: Boolean(newest.rightsConfirmedAt),
    })
  );
}

async function cleanup(title) {
  const snapshot = await db.collection('events').where('title', '==', title).get();
  for (const doc of snapshot.docs) {
    await doc.ref.delete();
    console.log(`Deleted event ${doc.id} (${title})`);
  }
  if (snapshot.empty) {
    console.log(`No events found with title ${title}`);
  }
}

if (action === 'inspect') {
  await inspect(title);
} else if (action === 'cleanup') {
  await cleanup(title);
} else {
  console.error(`Unknown action: ${action}`);
  process.exit(1);
}

process.exit(0);
