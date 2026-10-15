#!/usr/bin/env node
// Creates (or resets) the three test accounts of the STAGING project
// tribe-vbg-staging. The project is hard-coded; any other --project is refused.
//
//   node scripts/seed-staging-users.mjs                    staging, random password
//   node scripts/seed-staging-users.mjs --password <pw>    staging, given password (>= 12 chars)
//   node scripts/seed-staging-users.mjs --emulator         local emulators (tests),
//       project namespace tribe-vbg-staging; hosts from FIREBASE_AUTH_EMULATOR_HOST /
//       FIRESTORE_EMULATOR_HOST or 127.0.0.1:9199 / 127.0.0.1:8181
//
// Accounts (all e-mail verified, all with the same password of this run):
//   admin@staging.test      Super-Admin: claim role=Admin + admin_users/{uid} (as promote-admin.mjs)
//   moderator@staging.test  RegionModerator for steiermark + bayern: admin_users/{uid}
//                           (+ admin_audit_log entry), no claim
//   user@staging.test       normal user: users/{uid} + users/{uid}/publicProfile/data in the
//                           sign-up shape (src/hooks/useAuth.js seedProfileDoc), no claim,
//                           no admin_users doc
//
// Idempotent: an existing account gets its password reset, flags/claims set
// and its docs updated (createdAt is kept). The password is printed ONCE to
// stdout and never written to a file.
//
// Credentials for staging: the user's Application Default Credentials
// (gcloud auth application-default login), never scripts/service-account.json.
// REST helpers shared with promote-admin.mjs: scripts/lib/adminRest.mjs.
import { randomBytes } from 'crypto';
import {
  STAGING_SEED_USERS,
  buildUserProfileDocs,
  passwordFromBytes,
  resolveSeedUsersOptions,
} from '../src/utils/stagingSeedUsers.js';
import {
  REGION_MODERATOR_ROLE,
  SUPER_ADMIN_ROLE,
  planModeratorPromotion,
} from '../src/utils/staffRoles.js';
import { createAdminRestClient, toFirestoreFields } from './lib/adminRest.mjs';

const TAG = '[seed-staging-users]';
const ACTOR = 'scripts/seed-staging-users.mjs';

let opts;
try {
  opts = resolveSeedUsersOptions(process.argv.slice(2), { env: process.env });
} catch (err) {
  console.error(`${TAG} ${err.message}`);
  process.exit(1);
}

const client = await createAdminRestClient({
  target: opts.target,
  projectId: opts.projectId,
  emulatorHosts: opts.emulatorHosts,
});
const password = opts.password ?? passwordFromBytes(randomBytes(24));
console.log(
  `${TAG} Ziel: ${opts.target === 'emulator' ? `Emulator ${opts.emulatorHosts.auth} / ${opts.emulatorHosts.firestore}` : 'STAGING'} (Projekt ${client.projectId})`
);

async function ensureAccount(user) {
  const existing = await client.lookupUser(user.email);
  const claims = user.role === SUPER_ADMIN_ROLE ? { role: SUPER_ADMIN_ROLE } : {};
  if (existing) {
    await client.updateUser(existing.uid, {
      password,
      displayName: user.displayName,
      emailVerified: true,
      claims,
    });
    return { uid: existing.uid, isNew: false };
  }
  const uid = await client.createUser({
    email: user.email,
    password,
    displayName: user.displayName,
    emailVerified: true,
  });
  await client.updateUser(uid, { emailVerified: true, claims });
  return { uid, isNew: true };
}

async function seedModerator(user, uid) {
  const currentDoc = await client.readAdminDoc(uid);
  // Claims were just cleared, so only the admin_users doc can refuse.
  const plan = planModeratorPromotion({ currentDoc, claims: {}, regionIds: user.regionIds });
  if (plan.action === 'refuse') throw new Error(`${user.email}: ${plan.reason}`);
  if (plan.action === 'write') {
    await client.writeModeratorDoc(uid, user.email, plan.regionIds, plan.before, ACTOR);
  }
  return plan.action === 'write' ? 'geschrieben' : 'unveraendert';
}

async function seedNormalUser(user, uid, isNew) {
  const { privateDoc, publicDoc } = buildUserProfileDocs(user, { now: new Date(), isNew });
  const write = (name, data) => ({
    update: { name, fields: toFirestoreFields(data) },
    // Merge: only the seeded fields are set, everything else on the doc stays.
    updateMask: { fieldPaths: Object.keys(data) },
  });
  await client.commit([
    write(`users/${uid}`, privateDoc),
    write(`users/${uid}/publicProfile/data`, publicDoc),
    // A normal user has no staff role, even if someone granted one by hand.
    { delete: `admin_users/${uid}` },
  ]);
}

const results = [];
for (const user of STAGING_SEED_USERS) {
  const { uid, isNew } = await ensureAccount(user);
  let detail;
  if (user.role === SUPER_ADMIN_ROLE) {
    await client.writeSuperAdminDoc(uid, user.email);
    detail = 'Super-Admin (claim + admin_users)';
  } else if (user.role === REGION_MODERATOR_ROLE) {
    const state = await seedModerator(user, uid);
    detail = `RegionModerator ${user.regionIds.join(', ')} (admin_users ${state})`;
  } else {
    await seedNormalUser(user, uid, isNew);
    detail = 'User (users + publicProfile)';
  }
  results.push({ email: user.email, uid, isNew, detail });
  console.log(`${TAG} ${user.email} ${isNew ? 'angelegt' : 'aktualisiert'}: ${uid}, ${detail}`);
}

console.log(`\n${TAG} Fertig: ${results.length} Konten (E-Mail bestaetigt).`);
if (opts.password) {
  console.log(`${TAG} Passwort: wie mit --password angegeben.`);
} else {
  console.log(`${TAG} Passwort fuer alle drei Konten (nur jetzt sichtbar, nirgends gespeichert):`);
  console.log(password);
}
