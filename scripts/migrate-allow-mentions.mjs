#!/usr/bin/env node
// "Andere dürfen mich erwähnen" is on by default. Sets `allowMentions: true` (and the
// folded `mentionName` on the public profile) for every user whose profile has no
// `allowMentions` yet. An explicit `false` (the person switched it off) is never touched,
// and if either doc of a user says false the user is skipped completely.
// Idempotent: a second run changes 0 docs.
//
// Dry-run (default):  node scripts/migrate-allow-mentions.mjs --project spirieventsvbg
// Write:              node scripts/migrate-allow-mentions.mjs --project spirieventsvbg --apply
//   Production needs a production export from today (node scripts/export-firestore.mjs
//   --project spirieventsvbg) or --force. Credentials: Application Default Credentials.
// Staging: --project tribe-vbg-staging (ADC only, no backup needed).
import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { MANIFEST_NAME, latestProductionExportedAt } from '../src/utils/firestoreBackup.js';
import { foldName } from '../src/utils/mentions.js';
import { DISPLAY_NAME_MAX } from '../src/utils/profile.js';
import {
  PROD_PROJECT_ID,
  assertInitializedProject,
  assertStagingCredentials,
  assertUnambiguousEnv,
  realTargetFor,
} from '../src/utils/projectTargets.js';
import { MAX_BATCH_SIZE, chunk } from '../src/utils/regionMigration.js';

const TAG = '[migrate-allow-mentions]';
const BACKUP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'backups');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const force = args.includes('--force');
const projectId = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !projectId) {
  console.error(`${TAG} --project <spirieventsvbg|tribe-vbg-staging> ist Pflicht`);
  process.exit(1);
}
const target = realTargetFor(projectId);
assertUnambiguousEnv(projectId, process.env);

function backupFromToday() {
  if (!existsSync(BACKUP_DIR)) return false;
  const manifests = [];
  for (const e of readdirSync(BACKUP_DIR, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    try {
      manifests.push(JSON.parse(readFileSync(join(BACKUP_DIR, e.name, MANIFEST_NAME), 'utf8')));
    } catch {
      // partial backup dir: ignore
    }
  }
  const at = latestProductionExportedAt(manifests);
  return !!at && new Date(at).toDateString() === new Date().toDateString();
}

if (target === 'production' && apply && !force && !backupFromToday()) {
  console.error(
    `${TAG} Kein Produktions-Export von heute. Erst export-firestore.mjs, oder --force.`
  );
  process.exit(1);
}
if (target === 'staging') {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS || null;
  assertStagingCredentials({
    credentialsPath: path,
    credentialsJson: path ? JSON.parse(readFileSync(path, 'utf8')) : null,
  });
}

const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const app = initializeApp({ projectId });
assertInitializedProject(app.options.projectId, projectId);
const db = getFirestore(app);

console.log(
  `${TAG} Ziel: ${target === 'production' ? `PRODUKTION (${PROD_PROJECT_ID})` : projectId}`
);
console.log(`${TAG} Modus: ${apply ? 'APPLY (schreibt)' : 'DRY-RUN (--apply zum Schreiben)'}`);

const [users, publics] = await Promise.all([
  db.collection('users').get(),
  db.collectionGroup('publicProfile').get(),
]);
const publicByUid = new Map(
  publics.docs
    .filter((s) => s.ref.parent.parent?.parent?.id === 'users')
    .map((s) => [s.ref.parent.parent.id, s])
);

const updates = [];
let alreadySet = 0;
let optedOut = 0;
for (const user of users.docs) {
  const pub = publicByUid.get(user.id);
  const docs = [user, pub].filter(Boolean);
  if (docs.some((d) => d.get('allowMentions') === false)) {
    optedOut++;
    continue;
  }
  const displayName = (pub?.get('displayName') || user.get('displayName') || '').toString();
  for (const snap of docs) {
    if (snap.get('allowMentions') !== undefined) {
      alreadySet++;
      continue;
    }
    const update = { allowMentions: true };
    if (snap === pub && displayName.trim()) {
      update.mentionName = foldName(displayName).slice(0, DISPLAY_NAME_MAX);
    }
    updates.push({ snap, update });
  }
}
console.log(
  `${TAG} User: ${users.size} | bewusst aus (false, bleibt): ${optedOut} | ` +
    `Docs schon gesetzt: ${alreadySet} | zu aendern: ${updates.length}`
);
for (const u of updates.slice(0, 5))
  console.log(`${TAG}   z.B. ${u.snap.ref.path} ${JSON.stringify(u.update)}`);

if (!apply) {
  console.log(`${TAG} DRY-RUN: nichts geschrieben.`);
  process.exit(0);
}
let done = 0;
for (const group of chunk(updates, MAX_BATCH_SIZE)) {
  assertInitializedProject(app.options.projectId, projectId);
  const batch = db.batch();
  for (const { snap, update } of group)
    batch.update(snap.ref, update, { lastUpdateTime: snap.updateTime });
  await batch.commit();
  done += group.length;
  console.log(`${TAG} ${done}/${updates.length} geschrieben`);
}
console.log(`${TAG} Fertig.`);
