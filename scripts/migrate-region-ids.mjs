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
//     needs a production backup from today (node scripts/export-firestore.mjs
//     --project spirieventsvbg, checked via backups/*/manifest.json exportedAt) or --force.
//     Credentials: Application Default Credentials / GOOGLE_APPLICATION_CREDENTIALS.
// Staging (rehearsal):          node scripts/migrate-region-ids.mjs --project tribe-vbg-staging [--apply]
//     tribe-vbg-staging is disposable: no backup needed (a note is printed).
//     Credentials: the user's ADC only. A GOOGLE_APPLICATION_CREDENTIALS that
//     points at the production key (scripts/service-account.json) or at any
//     non-staging service account aborts.
// Only these two project ids are accepted. Anything else is refused, and so is
// FIRESTORE_EMULATOR_HOST or a different GCLOUD_PROJECT next to --project.
// Snapshot files only (no Firestore):
//                               node scripts/migrate-region-ids.mjs --snapshot [--snapshot-dir <dir>] [--apply]
//     adds the fields to <dir>/events.json and <dir>/users.json
//     (default dir: data-export/firestore-export).
//
// --revert: undoes the migration (Firestore only, not with --snapshot).
//     node scripts/migrate-region-ids.mjs --revert [--project <id>] [--apply]
//   Same targets, same dry-run default, same guards (production needs --apply
//   plus a backup of today or --force; staging needs neither). It undoes ONLY
//   what the migration wrote: `regionId` is deleted from an event only when it
//   is exactly 'vorarlberg', `directoryRegionIds` from users/{uid} and
//   users/{uid}/publicProfile/data only when it is exactly ['vorarlberg'].
//   Any other value (set by users or moderators after launch) is left untouched
//   and listed as "abweichend". Counts printed: reverted / skipped because
//   different / already without field. Idempotent: a second run reverts 0.
//   Limits: the migration's value cannot be told apart from the same value
//   chosen by a person later (e.g. a new Vorarlberg event), so such docs lose
//   the field too. The app reads a missing field as Vorarlberg, so they still
//   show up in the same place. A field that was null or '' before the
//   migration comes back as missing, not as null/''.
//
// Writes use update() with a lastUpdateTime precondition, in batches of <= 400:
// no other field (updatedAt included) is touched, and a doc changed by
// someone else in the meantime makes the batch fail instead of being
// overwritten. The script stops at the first error; re-running is safe.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { MANIFEST_NAME, latestProductionExportedAt } from '../src/utils/firestoreBackup.js';
import {
  MAX_BATCH_SIZE,
  PROD_PROJECT_ID,
  STAGING_PROJECT_ID,
  chunk,
  migrateSnapshotDocs,
  planMigration,
  planRevert,
  resolveOptions,
} from '../src/utils/regionMigration.js';
import { assertInitializedProject, assertStagingCredentials } from '../src/utils/projectTargets.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT_DIR = join(ROOT, 'data-export', 'firestore-export');
const BACKUP_DIR = join(ROOT, 'backups');
const TAG = '[migrate-region-ids]';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Newest complete PRODUCTION backup under backups/*/manifest.json (written by
// scripts/export-firestore.mjs only after every collection was read and counted).
function readBackupExportedAt() {
  if (!existsSync(BACKUP_DIR)) return null;
  const manifests = [];
  for (const entry of readdirSync(BACKUP_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      manifests.push(readJson(join(BACKUP_DIR, entry.name, MANIFEST_NAME)));
    } catch {
      // unreadable / partial backup dir: ignore
    }
  }
  return latestProductionExportedAt(manifests);
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
  Dasselbe gilt fuer --revert (entfernt nur ein Feld, status bleibt).
`;

function printBanner(opts) {
  const where =
    opts.target === 'production'
      ? `PRODUKTION (Projekt ${PROD_PROJECT_ID})`
      : opts.target === 'staging'
        ? `STAGING (Projekt ${STAGING_PROJECT_ID}, Application Default Credentials)`
        : opts.target === 'emulator'
          ? `Emulator ${opts.emulatorHost} (Projekt ${PROD_PROJECT_ID})`
          : `Snapshot-Dateien in ${opts.snapshotDir}`;
  console.log(`${TAG} Ziel: ${where}`);
  console.log(
    `${TAG} Aktion: ${opts.revert ? 'REVERT (entfernt nur die Werte der Migration)' : 'Migration'}`
  );
  console.log(
    `${TAG} Modus: ${opts.dryRun ? 'DRY-RUN (nichts wird geschrieben, --apply zum Schreiben)' : 'APPLY (schreibt)'}`
  );
  if (opts.target === 'staging') {
    console.log(
      `${TAG} Backup: Staging ist wegwerfbar, kein Backup noetig ` +
        '(neu befuellen: node scripts/mirror-prod-to-staging.mjs --apply).'
    );
  } else if (opts.target !== 'snapshot') {
    console.log(
      `${TAG} Backup: vor dem Schreiben auf Produktion einen Export von heute anlegen ` +
        '(node scripts/export-firestore.mjs --project spirieventsvbg).'
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

function readCredentialsFile(path) {
  try {
    return readJson(path);
  } catch {
    return null;
  }
}

async function initDb(opts) {
  if (opts.target === 'emulator') {
    process.env.FIRESTORE_EMULATOR_HOST = opts.emulatorHost;
    process.env.GCLOUD_PROJECT = PROD_PROJECT_ID;
  }
  if (opts.target === 'staging') {
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || null;
    assertStagingCredentials({
      credentialsPath,
      credentialsJson: credentialsPath ? readCredentialsFile(credentialsPath) : null,
    });
  }
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  // No explicit credential: the Admin SDK uses ADC (for staging: the user's gcloud ADC).
  const app = initializeApp({ projectId: opts.projectId });
  assertInitializedProject(app.options.projectId, opts.projectId);
  return { db: getFirestore(app), app, FieldValue };
}

/**
 * Commits `items` in batches with a lastUpdateTime precondition per doc.
 * `toUpdate(item)` returns the update. Exits at the first failing batch.
 */
async function writeBatches({ db, app, opts, docs, items, toUpdate, verb }) {
  const snapByPath = new Map(docs.map((d) => [d.path, d.snap]));
  let done = 0;
  const batches = chunk(items, MAX_BATCH_SIZE);
  for (const [i, group] of batches.entries()) {
    assertInitializedProject(app.options.projectId, opts.projectId);
    const batch = db.batch();
    for (const item of group) {
      const snap = snapByPath.get(item.path);
      batch.update(snap.ref, toUpdate(item), { lastUpdateTime: snap.updateTime });
    }
    try {
      await batch.commit();
    } catch (err) {
      console.error(`${TAG} FEHLER in Batch ${i + 1}/${batches.length}: ${err.message}`);
      console.error(`${TAG} Abbruch. ${verb} ${done} | Fehler ${group.length}`);
      console.error(`${TAG} Erneut ausfuehren ist sicher (aendert nur passende Felder).`);
      process.exit(1);
    }
    done += group.length;
    console.log(`${TAG} Batch ${i + 1}/${batches.length}: ${done}/${items.length} ${verb}`);
  }
  return done;
}

async function runMigration(opts) {
  const { db, app } = await initDb(opts);

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

  const migrated = await writeBatches({
    db,
    app,
    opts,
    docs,
    items: plan.updates,
    toUpdate: (u) => u.update,
    verb: 'migriert',
  });

  const after = planMigration(await loadDocs(db));
  console.log(
    `${TAG} Fertig. gesamt ${plan.total} | bereits gesetzt ${plan.already} | migriert ${migrated} | Fehler 0 | ` +
      `noch offen nach Kontroll-Lesen: ${after.updates.length}`
  );
  if (opts.target === 'production') {
    console.log(
      `${TAG} Danach Snapshot-Dateien nachziehen: node scripts/migrate-region-ids.mjs --snapshot --apply`
    );
  }
}

function printRevertPlan(plan) {
  const byType = (type) => plan.reverts.filter((r) => r.type === type).length;
  console.log(
    `${TAG} Dokumente gesamt: ${plan.total} | zurueckzusetzen (reverted): ${plan.reverts.length} ` +
      `(Events ${byType('event')}, Profile ${byType('profile')}) | ` +
      `abweichend, bleibt (skipped): ${plan.different.length} | ` +
      `bereits ohne Feld (already without field): ${plan.missing}`
  );
  for (const d of plan.different.slice(0, 50)) {
    console.log(`${TAG}   abweichend, bleibt unveraendert: ${d.path} = ${JSON.stringify(d.value)}`);
  }
  if (plan.different.length > 50) {
    console.log(`${TAG}   ... und ${plan.different.length - 50} weitere abweichende`);
  }
}

async function runRevert(opts) {
  const { db, app, FieldValue } = await initDb(opts);

  const docs = await loadDocs(db);
  const plan = planRevert(docs);
  printRevertPlan(plan);

  if (opts.dryRun) {
    for (const r of plan.reverts.slice(0, 20))
      console.log(`${TAG}   wuerde entfernen: ${r.path} ${r.field}`);
    if (plan.reverts.length > 20)
      console.log(`${TAG}   ... und ${plan.reverts.length - 20} weitere`);
    console.log(`${TAG} DRY-RUN: nichts geschrieben.`);
    return;
  }
  if (plan.reverts.length === 0) {
    console.log(`${TAG} Nichts zu tun.`);
    return;
  }

  const reverted = await writeBatches({
    db,
    app,
    opts,
    docs,
    items: plan.reverts,
    toUpdate: (r) => ({ [r.field]: FieldValue.delete() }),
    verb: 'zurueckgesetzt',
  });

  const after = planRevert(await loadDocs(db));
  console.log(
    `${TAG} Fertig. reverted ${reverted} | skipped (abweichend) ${plan.different.length} | ` +
      `already without field ${plan.missing} | Fehler 0 | ` +
      `noch zurueckzusetzen nach Kontroll-Lesen: ${after.reverts.length}`
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
  if (opts.revert) await runRevert(opts);
  else await runMigration(opts);
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
