#!/usr/bin/env node
// Ensures the shared curator account that owns curated (imported) events
// (docs/event-import.md): a Firebase Auth user, its profile docs in the
// sign-up shape and `app_settings/import.curatorUid`.
//
//   node scripts/ensure-curator-account.mjs                 dry run on tribe-vbg-staging
//   node scripts/ensure-curator-account.mjs --apply         write to tribe-vbg-staging
//   ... --email <address>     other account address (default curator@thetribe.at)
//   ... --project <id>        only tribe-vbg-staging; spirieventsvbg (production)
//                             additionally needs --allow-prod. Any other id is refused.
//
// The account: e-mail verified, display name "tribe Redaktion", no password
// (nobody signs in with it; a password can be set later via "Passwort
// vergessen"), no staff role. Idempotent: an existing account is reused and
// only its display name / verification flag and the docs are updated
// (createdAt is kept). Prints the UID.
//
// Credentials: staging uses the user's Application Default Credentials
// (gcloud auth application-default login), production
// scripts/service-account.json (scripts/lib/adminRest.mjs, REST instead of
// firebase-admin for the ESM reason given there). Even the dry run reads
// Auth to show what would change.
import {
  CURATOR_DISPLAY_NAME,
  CURATOR_SLUG,
  IMPORT_SETTINGS_DOC,
  buildImportSettingsDoc,
  resolveCuratorAccountOptions,
} from '../src/utils/eventImport.js';
import { buildUserProfileDocs } from '../src/utils/stagingSeedUsers.js';
import { createAdminRestClient, toFirestoreFields } from './lib/adminRest.mjs';

const TAG = '[ensure-curator-account]';
const USAGE =
  'Usage: node scripts/ensure-curator-account.mjs [--apply] [--email <address>] [--project tribe-vbg-staging | --project spirieventsvbg --allow-prod]';

let opts;
try {
  opts = resolveCuratorAccountOptions(process.argv.slice(2));
} catch (err) {
  console.error(`${TAG} ${err.message}\n${USAGE}`);
  process.exit(1);
}

const client = await createAdminRestClient({ target: opts.target, projectId: opts.projectId });
console.log(
  `${TAG} Ziel: ${opts.target === 'production' ? 'PRODUKTION' : 'STAGING'} (Projekt ${client.projectId})` +
    (opts.apply ? '' : ' - Probelauf, nichts wird geschrieben (--apply zum Schreiben)')
);

const existing = await client.lookupUser(opts.email);
if (existing && Object.keys(existing.claims || {}).length > 0) {
  console.error(
    `${TAG} ${opts.email} (${existing.uid}) hat Custom Claims (${JSON.stringify(existing.claims)}): ` +
      'ein Kurator-Konto darf keine Staff-Rolle haben. Abbruch, nichts geändert.'
  );
  process.exit(1);
}
const staffDoc = existing ? await client.readAdminDoc(existing.uid) : null;
if (staffDoc) {
  console.error(
    `${TAG} ${opts.email} (${existing.uid}) hat ein admin_users-Dokument: ` +
      'ein Kurator-Konto darf keine Staff-Rolle haben. Abbruch, nichts geändert.'
  );
  process.exit(1);
}

if (!opts.apply) {
  console.log(
    existing
      ? `${TAG} Konto existiert: ${opts.email} -> UID ${existing.uid}. Würde Anzeigename/Bestätigung, Profil und ${IMPORT_SETTINGS_DOC} aktualisieren.`
      : `${TAG} Konto fehlt: würde ${opts.email} ("${CURATOR_DISPLAY_NAME}") anlegen, Profil und ${IMPORT_SETTINGS_DOC} schreiben.`
  );
  process.exit(0);
}

let uid = existing?.uid;
if (uid) {
  await client.updateUser(uid, { displayName: CURATOR_DISPLAY_NAME, emailVerified: true });
} else {
  uid = await client.createUser({
    email: opts.email,
    displayName: CURATOR_DISPLAY_NAME,
    emailVerified: true,
  });
  await client.updateUser(uid, { emailVerified: true });
}

const now = new Date();
const { privateDoc, publicDoc } = buildUserProfileDocs(
  { email: opts.email, displayName: CURATOR_DISPLAY_NAME, slug: CURATOR_SLUG },
  { now, isNew: !existing }
);
const settings = buildImportSettingsDoc(uid, { now });
const write = (name, data) => ({
  update: { name, fields: toFirestoreFields(data) },
  // Merge: only these fields are set, everything else on the doc stays.
  updateMask: { fieldPaths: Object.keys(data) },
});
await client.commit([
  write(`users/${uid}`, privateDoc),
  write(`users/${uid}/publicProfile/data`, publicDoc),
  write(IMPORT_SETTINGS_DOC, settings),
]);

console.log(`${TAG} ${opts.email} ${existing ? 'aktualisiert' : 'angelegt'}.`);
console.log(`${TAG} UID: ${uid}`);
console.log(`${TAG} ${IMPORT_SETTINGS_DOC}.curatorUid = ${uid}`);
