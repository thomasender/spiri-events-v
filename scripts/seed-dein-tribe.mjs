#!/usr/bin/env node
// Creates the system account "Dein Tribe" (Trello 6afb1116, docs/pre-entries.md):
// owner of every pre-entered event until its organizer takes it over.
//
//   node scripts/seed-dein-tribe.mjs --project tribe-vbg-staging            dry run (default)
//   node scripts/seed-dein-tribe.mjs --project tribe-vbg-staging --apply    write
//   node scripts/seed-dein-tribe.mjs --emulator [--apply]                   local emulators
//
// What it writes (idempotent, nothing else is touched):
//   - Auth user with the fixed uid SYSTEM_UID, no e-mail, no password, DISABLED
//     (nobody signs in with it; an existing user with that uid is disabled again)
//   - users/{SYSTEM_UID} and users/{SYSTEM_UID}/publicProfile/data: name "Dein Tribe",
//     username "dein-tribe" (reserved in src/utils/username.js), visible profile page,
//     never in the directory (listedInDirectory: false). Merge write: createdAt stays.
//
// Projects: only the allowlist of src/utils/projectTargets.js (staging, production);
// emulator host variables or a different GCLOUD_PROJECT next to --project abort.
// Staging uses the Application Default Credentials, production
// scripts/service-account.json (scripts/lib/adminRest.mjs).
import { assertUnambiguousEnv, realTargetFor } from '../src/utils/projectTargets.js';
import {
  SYSTEM_DISPLAY_NAME,
  SYSTEM_UID,
  buildSystemProfileDocs,
  resolveSeedDeinTribeOptions,
} from '../src/utils/systemAccount.js';
import { createAdminRestClient, toFirestoreFields } from './lib/adminRest.mjs';

const TAG = '[seed-dein-tribe]';

let opts;
try {
  opts = resolveSeedDeinTribeOptions(process.argv.slice(2), {
    env: process.env,
    realTargetFor,
    assertUnambiguousEnv,
  });
} catch (err) {
  console.error(`${TAG} ${err.message}`);
  process.exit(1);
}

const client = await createAdminRestClient({
  target: opts.target,
  projectId: opts.projectId ?? undefined,
  emulatorHosts: opts.emulatorHosts,
});
console.log(
  `${TAG} Ziel: ${opts.target} (Projekt ${client.projectId})${opts.apply ? '' : ' – TROCKENLAUF, schreibt nichts'}`
);

const existing = await client.lookupUid(SYSTEM_UID);
const profile = await client.readDoc(`users/${SYSTEM_UID}`);
const isNew = !profile;
const { privateDoc, publicDoc } = buildSystemProfileDocs({ now: new Date(), isNew });

console.log(
  `${TAG} Auth-Konto ${SYSTEM_UID}: ${existing ? `vorhanden (${existing.disabled ? 'deaktiviert' : 'AKTIV -> wird deaktiviert'})` : 'fehlt -> wird angelegt (deaktiviert)'}`
);
console.log(
  `${TAG} Profil users/${SYSTEM_UID}: ${isNew ? 'neu' : 'vorhanden -> Felder werden aktualisiert'}`
);

if (!opts.apply) {
  console.log(`${TAG} Trockenlauf beendet. Mit --apply schreiben.`);
  process.exit(0);
}

if (!existing) {
  await client.createDisabledUser({ uid: SYSTEM_UID, displayName: SYSTEM_DISPLAY_NAME });
} else if (!existing.disabled) {
  await client.disableUser(SYSTEM_UID, SYSTEM_DISPLAY_NAME);
}

const write = (name, data) => ({
  update: { name, fields: toFirestoreFields(data) },
  // Merge: only the seeded fields are set, everything else on the doc stays.
  updateMask: { fieldPaths: Object.keys(data) },
});
await client.commit([
  write(`users/${SYSTEM_UID}`, privateDoc),
  write(`users/${SYSTEM_UID}/publicProfile/data`, publicDoc),
]);
console.log(`${TAG} Fertig: Konto deaktiviert, Profil /dein-tribe geschrieben.`);
