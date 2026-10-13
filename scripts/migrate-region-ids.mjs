#!/usr/bin/env node
// Ticket 8: fills in `regionId: 'vorarlberg'` on every event and
// `directoryRegionIds: ['vorarlberg']` on every profile (users/{uid} and
// users/{uid}/publicProfile/data) that has none. Idempotent: only missing
// fields are set; a second run reports 0 updates.
//
// Emulator, dry-run (default):  node scripts/migrate-region-ids.mjs
// Emulator, write:              node scripts/migrate-region-ids.mjs --apply
// Production, dry-run:          node scripts/migrate-region-ids.mjs --project spirieventsvbg
// Production, write (ticket 9): node scripts/migrate-region-ids.mjs --project spirieventsvbg --apply
//     needs a Firestore export from today (node scripts/export-firestore.mjs,
//     checked via data-export/firestore-export/manifest.json exportedAt) or --force.
//     Credentials: Application Default Credentials / GOOGLE_APPLICATION_CREDENTIALS.
// Snapshot files only (no Firestore):
//                               node scripts/migrate-region-ids.mjs --snapshot [--snapshot-dir <dir>] [--apply]
//     adds the fields to <dir>/events.json and <dir>/users.json
//     (default dir: data-export/firestore-export).
//
// Writes use update() with a lastUpdateTime precondition, in batches of <= 400:
// no other field (updatedAt included) is touched, and a doc changed by
// someone else in the meantime makes the batch fail instead of being
// overwritten. The script stops at the first error; re-running is safe.
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  MAX_BATCH_SIZE,
  PROD_PROJECT_ID,
  chunk,
  migrateSnapshotDocs,
  planMigration,
  resolveOptions,
} from '../src/utils/regionMigration.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT_DIR = join(ROOT, 'data-export', 'firestore-export');
const TAG = '[migrate-region-ids]';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readBackupExportedAt() {
  const manifest = join(EXPORT_DIR, 'manifest.json');
  if (!existsSync(manifest)) return null;
  try {
    return readJson(manifest).exportedAt ?? null;
  } catch {
    return null;
  }
}

const TRIGGER_NOTE = `
Hinweis zu Cloud Functions (geprueft im Code, functions/src):
  - onEventWriteTriggerBuild feuert bei jedem Schreiben auf ein Event, das vorher
    oder nachher 'approved' ist. Die Migration loest damit einen GitHub-Build aus
    (5-Min-Debounce ueber app_settings/last_build). Weil viele Trigger in einem
    Batch parallel starten, bevor buildAt gestempelt ist, koennen auch mehrere
    repository_dispatch-Aufrufe durchgehen; der Workflow (concurrency
    hosting-deploy, cancel-in-progress) bricht die aelteren ab, am Ende laeuft
    effektiv ein Build. Harmlos: der Build rendert dieselben Seiten.
  - onEventApprovedPostToInstagram reagiert nur auf den Wechsel nach 'approved'
    (isApprovalTransition). Die Migration aendert status nicht, also kein Post.
  - onEventStatusChanged (Mails) reagiert nur auf Statuswechsel: keine Mails.
  - onEventCreated / onEventCreatedEnsureUniqueSlug: nur bei Neuanlage.
  - Profile (users/...) haben keine Trigger.
  - Admin SDK umgeht Firestore Rules; updatedAt wird nicht veraendert.
`;

function printBanner(opts) {
  const where =
    opts.target === 'production'
      ? `PRODUKTION (Projekt ${PROD_PROJECT_ID})`
      : opts.target === 'emulator'
        ? `Emulator ${opts.emulatorHost} (Projekt ${PROD_PROJECT_ID})`
        : `Snapshot-Dateien in ${opts.snapshotDir}`;
  console.log(`${TAG} Ziel: ${where}`);
  console.log(
    `${TAG} Modus: ${opts.dryRun ? 'DRY-RUN (nichts wird geschrieben, --apply zum Schreiben)' : 'APPLY (schreibt)'}`
  );
  if (opts.target !== 'snapshot') {
    console.log(
      `${TAG} Backup: vor dem Schreiben auf Produktion einen Export von heute anlegen ` +
        '(node scripts/export-firestore.mjs).'
    );
  }
  if (opts.target === 'production') {
    console.log(
      `${TAG} Export von heute: ${opts.backupOk ? 'ja' : opts.force ? 'NEIN (--force gesetzt)' : 'nein (fuer --apply noetig)'}`
    );
  }
}

function runSnapshot(opts) {
  const files = [
    { name: 'events.json', type: 'event' },
    { name: 'users.json', type: 'profile' },
  ];
  for (const { name, type } of files) {
    const path = join(opts.snapshotDir, name);
    if (!existsSync(path)) {
      console.log(`${TAG} ${name}: nicht vorhanden, uebersprungen`);
      continue;
    }
    const docs = readJson(path);
    const { docs: next, changed } = migrateSnapshotDocs(docs, type);
    console.log(`${TAG} ${name}: ${docs.length} gesamt, ${changed} ergaenzt`);
    if (!opts.dryRun && changed > 0) writeFileSync(path, JSON.stringify(next, null, 2) + '\n');
  }
  if (opts.dryRun) console.log(`${TAG} DRY-RUN: keine Datei geschrieben.`);
}

async function loadDocs(db) {
  const [events, users, publicProfiles] = await Promise.all([
    db.collection('events').get(),
    db.collection('users').get(),
    db.collectionGroup('publicProfile').get(),
  ]);
  const toDoc = (type) => (snap) => ({ type, path: snap.ref.path, data: snap.data(), snap });
  return [
    ...events.docs.map(toDoc('event')),
    ...users.docs.map(toDoc('profile')),
    // Only users/{uid}/publicProfile/{doc}; never creates missing ones.
    ...publicProfiles.docs
      .filter((s) => s.ref.parent.parent?.parent?.id === 'users')
      .map(toDoc('profile')),
  ];
}

function printPlan(plan) {
  const byType = (type) => plan.updates.filter((u) => u.type === type).length;
  console.log(
    `${TAG} Dokumente gesamt: ${plan.total} | bereits gesetzt: ${plan.already} | ` +
      `zu migrieren: ${plan.updates.length} (Events ${byType('event')}, Profile ${byType('profile')}) | ` +
      `ungueltig (uebersprungen): ${plan.invalid.length}`
  );
  for (const inv of plan.invalid) {
    console.log(
      `${TAG}   ungueltiger Wert, bitte manuell pruefen: ${inv.path} = ${JSON.stringify(inv.value)}`
    );
  }
}

async function runFirestore(opts) {
  if (opts.target === 'emulator') {
    process.env.FIRESTORE_EMULATOR_HOST = opts.emulatorHost;
    process.env.GCLOUD_PROJECT = PROD_PROJECT_ID;
  }
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ projectId: PROD_PROJECT_ID });
  const db = getFirestore();

  const docs = await loadDocs(db);
  const plan = planMigration(docs);
  printPlan(plan);

  if (opts.dryRun) {
    for (const u of plan.updates.slice(0, 20))
      console.log(`${TAG}   wuerde setzen: ${u.path} ${JSON.stringify(u.update)}`);
    if (plan.updates.length > 20)
      console.log(`${TAG}   ... und ${plan.updates.length - 20} weitere`);
    console.log(`${TAG} DRY-RUN: nichts geschrieben.`);
    return;
  }
  if (plan.updates.length === 0) {
    console.log(`${TAG} Nichts zu tun.`);
    return;
  }

  const snapByPath = new Map(docs.map((d) => [d.path, d.snap]));
  let migrated = 0;
  const batches = chunk(plan.updates, MAX_BATCH_SIZE);
  for (const [i, group] of batches.entries()) {
    const batch = db.batch();
    for (const u of group) {
      const snap = snapByPath.get(u.path);
      batch.update(snap.ref, u.update, { lastUpdateTime: snap.updateTime });
    }
    try {
      await batch.commit();
    } catch (err) {
      console.error(`${TAG} FEHLER in Batch ${i + 1}/${batches.length}: ${err.message}`);
      console.error(
        `${TAG} Abbruch. gesamt ${plan.total} | bereits gesetzt ${plan.already} | migriert ${migrated} | Fehler ${group.length}`
      );
      console.error(`${TAG} Erneut ausfuehren ist sicher (setzt nur fehlende Felder).`);
      process.exit(1);
    }
    migrated += group.length;
    console.log(
      `${TAG} Batch ${i + 1}/${batches.length}: ${migrated}/${plan.updates.length} migriert`
    );
  }

  const after = planMigration(await loadDocs(db));
  console.log(
    `${TAG} Fertig. gesamt ${plan.total} | bereits gesetzt ${plan.already} | migriert ${migrated} | Fehler 0 | ` +
      `noch offen nach Kontroll-Lesen: ${after.updates.length}`
  );
  console.log(
    `${TAG} Danach Snapshot-Dateien nachziehen: node scripts/migrate-region-ids.mjs --snapshot --apply`
  );
}

async function main() {
  let opts;
  try {
    opts = resolveOptions(process.argv.slice(2), {
      env: process.env,
      backupExportedAt: readBackupExportedAt(),
    });
  } catch (err) {
    console.error(`${TAG} ${err.message}`);
    process.exit(1);
  }
  if (opts.target === 'snapshot') opts.snapshotDir = resolve(opts.snapshotDir ?? EXPORT_DIR);

  printBanner(opts);
  if (opts.target === 'snapshot') {
    runSnapshot(opts);
    return;
  }
  console.log(TRIGGER_NOTE);
  await runFirestore(opts);
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
