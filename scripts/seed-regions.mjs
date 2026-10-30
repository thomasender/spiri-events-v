#!/usr/bin/env node
// Idempotent seed for the `regions` collection from the register in code (the four country
// CSVs in scripts/data/regions/ -> src/data/regionData.js -> STATIC_REGIONS: 133 regions of
// Austria, Germany, Switzerland and Liechtenstein). Reconciles in ONE batch (plan:
// planRegionSeed in src/utils/regionDocs.js):
//   - a register region without doc gets one (inactive, Vorarlberg active; only switches,
//     no name / slug / districts: those come from the register),
//   - an existing doc only gets its MISSING switch fields; admin edits (active, contact,
//     seo, texts, about, instagram, timezone) are never changed,
//   - docs of regions that are no longer in the register (old German Bundesländer and
//     cultural regions, merged cantons, `oesterreich`, ...) are set `active: false` and
//     reported, NEVER deleted,
//   - a former id that is a region again (`allgaeu`, `berlin`, `ruhrgebiet`, ... from
//     deutschland.csv) keeps its doc and its `active`; active non-Vorarlberg docs are listed.
// Stale fields of old docs (name, bezirke, ...) are left alone here; see
// scripts/cleanup-region-docs.mjs.
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
import { assertInitializedProject, resolveSeedRegionsTarget } from '../src/utils/projectTargets.js';
import { planRegionSeed } from '../src/utils/regionDocs.js';

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

const snap = await db.collection('regions').get();
const plan = planRegionSeed(snap.docs.map((d) => ({ id: d.id, data: d.data() })));

const batch = db.batch();
const ref = (id) => db.collection('regions').doc(id);
for (const { id, data } of plan.create) {
  batch.set(ref(id), {
    ...data,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
for (const { id, data } of plan.complete) {
  batch.set(ref(id), { ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
for (const id of plan.deactivate) {
  batch.update(ref(id), { active: false, updatedAt: FieldValue.serverTimestamp() });
}

const writes = plan.create.length + plan.complete.length + plan.deactivate.length;
if (writes) await batch.commit();
const unchanged = snap.size - plan.complete.length - plan.retired.length;
console.log(
  `regions: ${plan.create.length} created, ${plan.complete.length} completed, ${unchanged} unchanged, ` +
    `${plan.deactivate.length} switched off (${target.target}, ${target.projectId})`
);
if (plan.live.length) {
  console.log(`ACTIVE region docs besides vorarlberg (check this is intended): ${plan.live.join(', ')}`);
}
if (plan.retired.length) {
  console.log(
    `docs of former regions (kept, inactive; delete them by hand if wanted): ${plan.retired.join(', ')}`
  );
}
