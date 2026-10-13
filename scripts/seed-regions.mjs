#!/usr/bin/env node
// Idempotent seed for the `regions` collection. Reconciles to the desired
// state in ONE batch: vorarlberg active, every other region inactive. Existing
// admin edits (name, bezirke, contactEmail, seo, active) are kept; only missing
// fields are filled in.
//
// Emulator (default):  node scripts/seed-regions.mjs
// Production (admin runs this deliberately, see ticket 9):
//                      node scripts/seed-regions.mjs --prod
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { STATIC_REGIONS } from '../src/utils/regions.js';

const PROJECT_ID = 'spirieventsvbg';
const prod = process.argv.includes('--prod');
if (!prod) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8181';
  process.env.GCLOUD_PROJECT = PROJECT_ID;
}

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const refs = STATIC_REGIONS.map((r) => db.collection('regions').doc(r.id));
const existing = await db.getAll(...refs);
const batch = db.batch();
let created = 0;
let completed = 0;

STATIC_REGIONS.forEach((r, i) => {
  const snap = existing[i];
  const desired = {
    name: r.name,
    slug: r.slug,
    order: r.order,
    active: r.active,
    bezirke: r.bezirke,
    contactEmail: '',
    seo: { title: '', description: '' },
    timezone: 'Europe/Vienna',
  };
  if (!snap.exists) {
    batch.set(refs[i], {
      ...desired,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    created++;
    return;
  }
  const data = snap.data();
  const missing = Object.fromEntries(Object.entries(desired).filter(([k]) => !(k in data)));
  if (Object.keys(missing).length) {
    batch.set(refs[i], { ...missing, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    completed++;
  }
});

if (created || completed) await batch.commit();
const unchanged = STATIC_REGIONS.length - created - completed;
console.log(
  `regions: ${created} created, ${completed} completed, ${unchanged} unchanged (${prod ? 'production' : 'emulator'})`
);
