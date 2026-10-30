#!/usr/bin/env node
// One-off STAGING tool (Trello QG0GR5lv): after the switch to the CSV region register, re-place
// events by their Ort and clean profile / moderator fields. DRY RUN by default; `--apply` writes.
//
//   node scripts/realign-event-regions.mjs --project tribe-vbg-staging           dry run
//   node scripts/realign-event-regions.mjs --project tribe-vbg-staging --apply
//
// Only `tribe-vbg-staging` is accepted (ADC only, same guards as scripts/migrate-region-ids.mjs
// and scripts/cleanup-region-docs.mjs). Production, the emulator and every other project are
// refused. Staging data is disposable: unresolvable events are DELETED (event doc plus its
// `messages` subcollection).
//
// 1. Events whose `regionId` is not a register region, or whose Bezirk / Landkreis is not a
//    district of their region (legacy "Grenznahe" and the empty Bezirk of online events and of
//    Vorarlberg events are ignored): the `city` is resolved to a place of the place list with
//    the same logic as the event form (src/utils/placeDistrict.js + src/data/placeIndex.json);
//    resolved -> city / bezirk / regionId / lat / lng are set, otherwise the event is deleted.
//    Events of Vorarlberg (or without regionId) with a valid Bezirk are never touched.
// 2. `users/{uid}` and `users/{uid}/publicProfile/data`: `directoryRegionIds` / `directoryRegions`
//    pointing at former regions / districts lose those entries (an empty list is deleted).
// 3. `admin_users/*`: `regionIds` without retired ids; nothing valid left -> ['steiermark'].
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  STAGING_PROJECT_ID,
  assertInitializedProject,
  assertStagingCredentials,
  resolveSeedRegionsTarget,
} from '../src/utils/projectTargets.js';
import { preparePlaceIndex } from '../src/utils/placeSearch.js';
import { STATIC_REGIONS } from '../src/utils/regions.js';
import {
  planAdminRegionIds,
  planEventRealign,
  planProfileFields,
} from '../src/utils/eventRealign.js';

const TAG = 'realign-event-regions:';
const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
let target;
try {
  target = resolveSeedRegionsTarget(
    argv.filter((a) => a !== '--apply'),
    process.env
  );
} catch (err) {
  console.error(`${TAG} ${err.message}`);
  process.exit(1);
}
if (target.target !== 'staging' || target.projectId !== STAGING_PROJECT_ID) {
  console.error(
    `${TAG} nur --project ${STAGING_PROJECT_ID} ist erlaubt (Produktion und Emulator abgelehnt).`
  );
  process.exit(1);
}
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || null;
let credentialsJson = null;
if (credentialsPath) {
  try {
    credentialsJson = JSON.parse(readFileSync(credentialsPath, 'utf8'));
  } catch {
    credentialsJson = null;
  }
}
try {
  assertStagingCredentials({ credentialsPath, credentialsJson });
} catch (err) {
  console.error(`${TAG} ${err.message}`);
  process.exit(1);
}

const app = initializeApp({ projectId: STAGING_PROJECT_ID });
assertInitializedProject(app.options.projectId, STAGING_PROJECT_ID);
const db = getFirestore(app);
console.log(`${TAG} ${apply ? 'APPLY' : 'DRY RUN'} on staging (${STAGING_PROJECT_ID})`);

const index = preparePlaceIndex(
  JSON.parse(readFileSync(new URL('../src/data/placeIndex.json', import.meta.url), 'utf8'))
);
const regions = STATIC_REGIONS;

// 1. Events.
const eventSnap = await db.collection('events').get();
const rows = planEventRealign(
  eventSnap.docs.map((d) => ({ id: d.id, data: d.data() })),
  index,
  regions
);
const fmt = (o) => `${o.city || '-'} / ${o.bezirk || '-'} / ${o.regionId || '-'}`;
console.log(`events: ${eventSnap.size} docs, ${rows.length} to change`);
for (const r of rows) {
  const next = r.action === 'delete' ? 'DELETE' : fmt(r.next);
  console.log(`  ${r.id} | ${r.title.slice(0, 40)} | ${fmt(r.old)} -> ${next}`);
}

// 2. Profiles (users/{uid} and users/{uid}/publicProfile/data).
const profileDocs = [
  ...(await db.collection('users').get()).docs,
  ...(await db.collectionGroup('publicProfile').get()).docs,
];
const profileWrites = [];
for (const doc of profileDocs) {
  const plan = planProfileFields(doc.data(), regions);
  if (Object.keys(plan.set).length || plan.remove.length)
    profileWrites.push({ ref: doc.ref, plan });
}
console.log(`profiles: ${profileDocs.length} docs, ${profileWrites.length} to change`);
for (const { ref, plan } of profileWrites) {
  console.log(
    `  ${ref.path}: set ${JSON.stringify(plan.set)} delete ${JSON.stringify(plan.remove)}`
  );
}

// 3. Moderators.
const adminSnap = await db.collection('admin_users').get();
const adminWrites = [];
for (const doc of adminSnap.docs) {
  const regionIds = planAdminRegionIds(doc.data(), regions);
  if (regionIds) adminWrites.push({ ref: doc.ref, old: doc.data().regionIds, regionIds });
}
console.log(`admin_users: ${adminSnap.size} docs, ${adminWrites.length} to change`);
for (const w of adminWrites) {
  console.log(`  ${w.ref.path}: ${JSON.stringify(w.old)} -> ${JSON.stringify(w.regionIds)}`);
}

if (!apply) {
  console.log(`${TAG} Nothing was written (use --apply).`);
  process.exit(0);
}

for (const r of rows) {
  const ref = db.collection('events').doc(r.id);
  if (r.action === 'update') {
    await ref.update({
      city: r.next.city,
      bezirk: r.next.bezirk,
      regionId: r.next.regionId,
      lat: r.next.lat,
      lng: r.next.lng,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    await db.recursiveDelete(ref); // event doc and its `messages` subcollection
  }
}
for (const { ref, plan } of profileWrites) {
  await ref.update({
    ...plan.set,
    ...Object.fromEntries(plan.remove.map((f) => [f, FieldValue.delete()])),
  });
}
for (const w of adminWrites) await w.ref.update({ regionIds: w.regionIds });
console.log(
  `${TAG} done: ${rows.filter((r) => r.action === 'update').length} updated, ${rows.filter((r) => r.action === 'delete').length} deleted events, ${profileWrites.length} profiles, ${adminWrites.length} moderators.`
);
process.exit(0);
