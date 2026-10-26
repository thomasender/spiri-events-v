#!/usr/bin/env node
// One-off script to promote an existing Firebase Auth user to admin.
// Sets both the custom auth claim (Auth Backend API) and the
// admin_users Firestore doc so the user passes either of the two
// checks in firestore.rules.
//
//   node scripts/promote-admin.mjs <email>                       Super-Admin
//   node scripts/promote-admin.mjs <email> --role RegionModerator --regions steiermark,tirol
//   ... --emulator     run against the local emulators (Auth :9199, Firestore :8181)
//   ... --project tribe-vbg-staging
//                      run against the staging project with the user's
//                      Application Default Credentials (never the production key)
//   ... --project spirieventsvbg
//                      production, spelled out: the same path as no flag
//                      (scripts/service-account.json, whose project_id must match)
// Without --emulator/--project the target is production via
// scripts/service-account.json, as before. Any other --project is refused
// (src/utils/projectTargets.js).
//
// RegionModerator writes only admin_users/{uid} = { role, regionIds, ... }
// (no custom claim: rules and functions read the doc) plus an
// admin_audit_log entry. It is idempotent (same regions = no write) and
// refuses to touch a Super-Admin. Revoking/changing is done by the
// adminSetRegionModerator callable (admin UI, ticket 19).
//
// Uses REST APIs (scripts/lib/adminRest.mjs) instead of firebase-admin because
// firebase-admin pulls in jwks-rsa which currently fails under ESM
// (see scripts/export-firestore.mjs for the same workaround).

import {
  REGION_MODERATOR_ROLE,
  SUPER_ADMIN_ROLE,
  parseModeratorRegions,
  planModeratorPromotion,
} from '../src/utils/staffRoles.js';
import { resolvePromoteTarget } from '../src/utils/projectTargets.js';
import { createAdminRestClient } from './lib/adminRest.mjs';

const USAGE =
  'Usage: node scripts/promote-admin.mjs <email> [--role Admin|RegionModerator] [--regions a,b] [--emulator | --project <id>]';

function parseArgs(argv) {
  const out = {
    email: null,
    role: SUPER_ADMIN_ROLE,
    regions: null,
    emulator: false,
    project: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--role') out.role = argv[++i];
    else if (arg === '--regions') out.regions = argv[++i] ?? '';
    else if (arg === '--emulator') out.emulator = true;
    else if (arg === '--project') {
      out.project = argv[++i];
      if (!out.project || out.project.startsWith('--')) throw new Error('--project needs a value');
    } else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else if (!out.email) out.email = arg;
    else throw new Error(`Unexpected argument ${arg}`);
  }
  if (!out.email) throw new Error('email is required');
  if (![SUPER_ADMIN_ROLE, REGION_MODERATOR_ROLE].includes(out.role)) {
    throw new Error(`--role must be ${SUPER_ADMIN_ROLE} or ${REGION_MODERATOR_ROLE}`);
  }
  if (out.role === REGION_MODERATOR_ROLE) out.regionIds = parseModeratorRegions(out.regions);
  else if (out.regions !== null)
    throw new Error('--regions only applies to --role RegionModerator');
  return out;
}

let args;
let target;
try {
  args = parseArgs(process.argv.slice(2));
  target = resolvePromoteTarget({ emulator: args.emulator, project: args.project }, process.env);
} catch (err) {
  console.error(`Error: ${err.message}\n${USAGE}`);
  process.exit(1);
}
const { email } = args;

let client;
try {
  client = await createAdminRestClient({
    target: target.target,
    // Production without --project keeps the old behaviour: the key decides.
    projectId: args.project ?? (target.target === 'emulator' ? target.projectId : undefined),
  });
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

const where =
  target.target === 'emulator' ? ' (emulator)' : target.target === 'staging' ? ' (STAGING)' : '';
console.log(`Looking up ${email}${where}...`);
const found = await client.lookupUser(email);
if (!found) throw new Error(`User ${email} not found in Firebase Auth`);
if (!found.emailVerified) console.warn(`Warning: ${email} is not email-verified yet.`);
const { uid, claims } = found;
console.log(`  uid: ${uid}`);

if (args.role === REGION_MODERATOR_ROLE) {
  const currentDoc = await client.readAdminDoc(uid);
  const plan = planModeratorPromotion({ currentDoc, claims, regionIds: args.regionIds });
  if (plan.action === 'refuse') {
    console.error(`\nRefused: ${plan.reason}. Nothing was changed.`);
    process.exit(1);
  }
  if (plan.action === 'unchanged') {
    console.log(
      `\nUnchanged. ${email} (${uid}) is already RegionModerator for: ${plan.regionIds.join(', ')}`
    );
    process.exit(0);
  }
  console.log(`Writing admin_users doc (role=${REGION_MODERATOR_ROLE}) + audit entry...`);
  await client.writeModeratorDoc(
    uid,
    email,
    plan.regionIds,
    plan.before,
    'scripts/promote-admin.mjs'
  );
  console.log(
    `\nDone. ${email} (${uid}) is now RegionModerator for: ${plan.regionIds.join(', ')}` +
      (plan.before ? ` (before: ${plan.before.join(', ') || '-'})` : '')
  );
  console.log('Takes effect immediately (no new sign-in needed).');
  process.exit(0);
}

console.log('Setting custom claim role=Admin...');
await client.setCustomClaim(uid, { role: SUPER_ADMIN_ROLE });

console.log('Writing admin_users doc...');
await client.writeSuperAdminDoc(uid, email);

console.log(`\nDone. ${email} (${uid}) is now admin.`);
console.log('The user must sign out and back in for the new custom claim to take effect.');
