#!/usr/bin/env node
// One-off cleanup after the switch to the CSV region register (Trello QG0GR5lv): regions and
// districts are defined only by scripts/data/regions/*.csv; the old German Bundesländer /
// cultural regions not in deutschland.csv and the merged Swiss cantons are no longer regions
// (ids that are regions again, e.g. `allgaeu`, count as regions). DRY RUN by default;
// `--apply` writes.
//
//   1. REPORTS (never changes) events / profiles / moderators / helpers / donors whose
//      `regionId`, `directoryRegionIds` or `regionIds` point to an id that is no longer a
//      region (e.g. `bayern`, `luzern`). Fix those by hand (or re-save them in the app).
//   2. Deletes stale fields of the `regions/{id}` docs of register regions: name, slug,
//      bezirke, mappingUpdatedAt, custom, country, inPhrase, forPhrase, demonym,
//      subdivisionLabel (STALE_REGION_FIELDS in src/utils/regionDocs.js; nothing reads them,
//      firestore.rules no longer requires name / slug).
//   3. Sets docs of former regions `active: false` (never deletes them).
//   4. Deletes `app_settings/customRegions` (custom regions no longer exist).
//
// Targets (same allowlist and guards as scripts/seed-regions.mjs, src/utils/projectTargets.js):
//   node scripts/cleanup-region-docs.mjs                                  emulator, dry run
//   node scripts/cleanup-region-docs.mjs --project tribe-vbg-staging      staging, dry run
//   node scripts/cleanup-region-docs.mjs --project tribe-vbg-staging --apply
// `--apply` on production (`--prod` / `--project spirieventsvbg`) is refused for now: run it on
// staging first, check the result, then lift the guard in a reviewed change.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  PROD_PROJECT_ID,
  assertInitializedProject,
  resolveSeedRegionsTarget,
} from '../src/utils/projectTargets.js';
import { planRegionSeed, staleRegionFields, unknownRegionIds } from '../src/utils/regionDocs.js';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
let target;
try {
  target = resolveSeedRegionsTarget(
    argv.filter((a) => a !== '--apply'),
    process.env
  );
} catch (err) {
  console.error(`cleanup-region-docs: ${err.message}`);
  process.exit(1);
}
if (apply && target.projectId === PROD_PROJECT_ID && target.target !== 'emulator') {
  console.error('cleanup-region-docs: --apply on production is not enabled yet (staging first).');
  process.exit(1);
}
if (target.target === 'emulator') {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8181';
  process.env.GCLOUD_PROJECT = target.projectId;
}

const app = initializeApp({ projectId: target.projectId });
assertInitializedProject(app.options.projectId, target.projectId);
const db = getFirestore(app);
const mode = apply ? 'APPLY' : 'DRY RUN';
console.log(`cleanup-region-docs: ${mode} on ${target.target} (${target.projectId})`);

// 1. Report docs that point to former regions.
const SCANS = [
  ['events', () => db.collection('events').get(), ['regionId']],
  ['users', () => db.collection('users').get(), ['directoryRegionIds']],
  ['publicProfile', () => db.collectionGroup('publicProfile').get(), ['directoryRegionIds']],
  ['admin_users', () => db.collection('admin_users').get(), ['regionIds']],
  ['helpers', () => db.collection('helpers').get(), ['regionId']],
  ['donors', () => db.collection('donors').get(), ['regionId']],
];
let reported = 0;
for (const [label, load, fields] of SCANS) {
  const snap = await load();
  const hits = [];
  for (const doc of snap.docs) {
    for (const field of fields) {
      const unknown = unknownRegionIds(doc.data(), field);
      if (unknown.length) hits.push(`${doc.ref.path} ${field}=${JSON.stringify(unknown)}`);
    }
  }
  reported += hits.length;
  console.log(`${label}: ${snap.size} docs, ${hits.length} with a former region id`);
  for (const line of hits) console.log(`  ${line}`);
}

// 2. + 3. Region docs.
const regionSnap = await db.collection('regions').get();
const docs = regionSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
const plan = planRegionSeed(docs);
const retired = new Set(plan.retired);
const stale = docs
  .filter((d) => !retired.has(d.id))
  .map((d) => ({ id: d.id, fields: staleRegionFields(d.data) }))
  .filter((d) => d.fields.length);
for (const { id, fields } of stale) console.log(`regions/${id}: delete ${fields.join(', ')}`);
for (const id of plan.deactivate) console.log(`regions/${id}: former region, set active: false`);
if (plan.retired.length) console.log(`former region docs (kept): ${plan.retired.join(', ')}`);
if (plan.live.length) console.log(`ACTIVE region docs besides vorarlberg: ${plan.live.join(', ')}`);
const missing = plan.create.map((c) => c.id);
if (missing.length) {
  console.log(`register regions without doc (run scripts/seed-regions.mjs): ${missing.join(', ')}`);
}

// 4. Custom regions setting.
const customRef = db.collection('app_settings').doc('customRegions');
const custom = await customRef.get();
if (custom.exists) console.log('app_settings/customRegions: delete');

const writes = stale.length + plan.deactivate.length + (custom.exists ? 1 : 0);
if (!apply) {
  console.log(
    `${reported} doc(s) with former region ids (report only). ${writes} write(s) planned. Nothing was written (use --apply).`
  );
  process.exit(0);
}
const batch = db.batch();
for (const { id, fields } of stale) {
  batch.update(db.collection('regions').doc(id), {
    ...Object.fromEntries(fields.map((f) => [f, FieldValue.delete()])),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
for (const id of plan.deactivate) {
  batch.update(db.collection('regions').doc(id), {
    active: false,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
if (custom.exists) batch.delete(customRef);
if (writes) await batch.commit();
console.log(`${writes} write(s) done. ${reported} doc(s) with former region ids still need a look.`);
process.exit(0);
