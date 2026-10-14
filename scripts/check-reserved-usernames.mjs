#!/usr/bin/env node
// READ-ONLY: lists existing usernames that are now reserved (see
// src/utils/username.js), with UID, name and event count. Writes nothing.
//
// Emulator (default):  node scripts/check-reserved-usernames.mjs
// Production:          node scripts/check-reserved-usernames.mjs --prod
//                      (needs scripts/service-account.json)
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { isReservedUsername } from '../src/utils/username.js';
import { COMBINED_VIEW_SLUGS, REGION_SLUGS } from '../src/utils/regions.js';

const PROJECT_ID = 'spirieventsvbg';
if (process.argv.includes('--prod')) {
  const sa = JSON.parse(readFileSync('scripts/service-account.json', 'utf8'));
  initializeApp({ credential: cert(sa), projectId: PROJECT_ID });
} else {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8181';
  process.env.GCLOUD_PROJECT = PROJECT_ID;
  initializeApp({ projectId: PROJECT_ID });
}
const db = getFirestore();

// Region addresses and combined views (`/oesterreich`, `/deutschland`, `/schweiz`,
// `/alle-tribes`) are reserved by isReservedUsername; listed here so the check
// visibly covers them.
console.log(`Region slugs: ${REGION_SLUGS.join(', ')}`);
console.log(`Combined views: ${COMBINED_VIEW_SLUGS.join(', ')}`);

// uid -> { username, name, sources }
const hits = new Map();
function consider(uid, data, source) {
  const username = data?.username;
  if (!username || !isReservedUsername(username)) return;
  const prev = hits.get(uid) || { username, name: '', sources: [] };
  prev.name ||= data.displayName || data.name || '';
  prev.sources.push(source);
  hits.set(uid, prev);
}

for (const doc of (await db.collection('users').get()).docs) {
  consider(doc.id, doc.data(), 'users');
}
for (const doc of (await db.collectionGroup('publicProfile').get()).docs) {
  const uid = doc.ref.parent.parent?.id;
  if (uid) consider(uid, doc.data(), 'publicProfile');
}

const rows = [];
for (const [uid, h] of hits) {
  const events = await db.collection('events').where('createdBy', '==', uid).count().get();
  rows.push({
    username: h.username,
    uid,
    name: h.name,
    events: events.data().count,
    found_in: h.sources.join('+'),
  });
}
rows.sort((a, b) => a.username.localeCompare(b.username));

if (rows.length === 0) console.log('No existing usernames are affected.');
else console.table(rows);
console.log(`${rows.length} affected user(s). Nothing was written.`);
process.exit(0);
