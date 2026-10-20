#!/usr/bin/env node
// Idempotent seed for the `regions` collection (all 111 regions of Austria,
// Germany and Switzerland, from STATIC_REGIONS: 51 Bundeslaender / Kantone plus 60
// cultural regions of Germany that start without Landkreise). Reconciles to the desired state in ONE batch:
// vorarlberg active, every other region inactive. Existing
// admin edits (name, bezirke, contactEmail, seo, active) are kept; only missing
// fields (and an empty `bezirke` list) are filled in from the register. Leftover
// docs of retired regions are removed: `regions/oesterreich` (from before
// "Österreich" became a combined view) and `regions/allgaeu` (the Allgäu pilot,
// replaced by Bayern).
//
// Emulator (default):  node scripts/seed-regions.mjs
// Production (admin runs this deliberately, see ticket 9):
//                      node scripts/seed-regions.mjs --prod
//                      (same as --project spirieventsvbg)
// Staging (rehearsal): node scripts/seed-regions.mjs --project tribe-vbg-staging
//                      (Application Default Credentials of the user)
// Any other project id is refused (src/utils/projectTargets.js).
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { STATIC_REGIONS } from '../src/utils/regions.js';
import { assertInitializedProject, resolveSeedRegionsTarget } from '../src/utils/projectTargets.js';

let target;
try {
  target = resolveSeedRegionsTarget(process.argv.slice(2), process.env);
} catch (err) {
  console.error(`seed-regions: ${err.message}`);
  process.exit(1);
}
if (target.target === 'emulator') {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8181';
  process.env.GCLOUD_PROJECT = target.projectId;
}

const app = initializeApp({ projectId: target.projectId });
assertInitializedProject(app.options.projectId, target.projectId);
const db = getFirestore(app);

const refs = STATIC_REGIONS.map((r) => db.collection('regions').doc(r.id));
const staleRefs = ['oesterreich', 'allgaeu'].map((id) => db.collection('regions').doc(id));
const [staleOesterreich, staleAllgaeu, ...existing] = await db.getAll(...staleRefs, ...refs);
const stale = [staleOesterreich, staleAllgaeu].filter((d) => d.exists);
const batch = db.batch();
let created = 0;
let completed = 0;
const removed = stale.length;
for (const doc of stale) batch.delete(doc.ref);

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
    // Europe/Vienna, Europe/Berlin or Europe/Zurich (same offset all year).
    timezone: r.timezone,
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
  // Docs seeded before the register had Bezirke for this region carry `bezirke: []`.
  // (An empty list written by the mapping tool, `mappingUpdatedAt`, is deliberate: keep it.)
  if (
    Array.isArray(data.bezirke) &&
    data.bezirke.length === 0 &&
    r.bezirke.length > 0 &&
    !data.mappingUpdatedAt
  ) {
    missing.bezirke = r.bezirke;
  }
  if (Object.keys(missing).length) {
    batch.set(refs[i], { ...missing, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    completed++;
  }
});

if (created || completed || removed) await batch.commit();
const unchanged = STATIC_REGIONS.length - created - completed;
console.log(
  `regions: ${created} created, ${completed} completed, ${unchanged} unchanged, ${removed} removed (${target.target}, ${target.projectId})`
);
