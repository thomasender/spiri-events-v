#!/usr/bin/env node
// One-off script to promote an existing Firebase Auth user to admin.
// Sets both the custom auth claim (Auth Backend API) and the
// admin_users Firestore doc so the user passes either of the two
// checks in firestore.rules.
//
//   node scripts/promote-admin.mjs <email>                       Super-Admin
//   node scripts/promote-admin.mjs <email> --role RegionModerator --regions steiermark,tirol
//   ... --emulator     run against the local emulators (Auth :9199, Firestore :8181)
//
// RegionModerator writes only admin_users/{uid} = { role, regionIds, ... }
// (no custom claim: rules and functions read the doc) plus an
// admin_audit_log entry. It is idempotent (same regions = no write) and
// refuses to touch a Super-Admin. Revoking/changing is done by the
// adminSetRegionModerator callable (admin UI, ticket 19).
//
// Uses REST APIs (with a signed JWT) instead of firebase-admin because
// firebase-admin pulls in jwks-rsa which currently fails under ESM
// (see scripts/export-firestore.mjs for the same workaround).

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createSign } from 'crypto';
import {
  REGION_MODERATOR_ROLE,
  SUPER_ADMIN_ROLE,
  parseModeratorRegions,
  planModeratorPromotion,
} from '../src/utils/staffRoles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CRED_PATH = join(ROOT, 'scripts/service-account.json');

const USAGE =
  'Usage: node scripts/promote-admin.mjs <email> [--role Admin|RegionModerator] [--regions a,b] [--emulator]';

function parseArgs(argv) {
  const out = { email: null, role: SUPER_ADMIN_ROLE, regions: null, emulator: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--role') out.role = argv[++i];
    else if (arg === '--regions') out.regions = argv[++i] ?? '';
    else if (arg === '--emulator') out.emulator = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
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
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(`Error: ${err.message}\n${USAGE}`);
  process.exit(1);
}
const { email } = args;

if (!args.emulator && !existsSync(CRED_PATH)) {
  console.error('Error: scripts/service-account.json not found');
  process.exit(1);
}

const cred = args.emulator ? null : JSON.parse(readFileSync(CRED_PATH, 'utf8'));
const PROJECT_ID = args.emulator ? 'spirieventsvbg' : cred.project_id;
const AUTH_BASE = args.emulator
  ? 'http://127.0.0.1:9199/identitytoolkit.googleapis.com'
  : 'https://identitytoolkit.googleapis.com';
const FIRESTORE_BASE = args.emulator
  ? `http://127.0.0.1:8181/v1/projects/${PROJECT_ID}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function base64urlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken(scopes) {
  // The emulators accept the fixed admin token "owner".
  if (args.emulator) return 'owner';
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64urlEncode(
    JSON.stringify({
      iss: cred.client_email,
      sub: cred.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      scope: scopes,
      iat: now,
      exp: now + 3600,
    })
  );
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(cred.private_key, 'base64');
  const assertion = `${header}.${payload}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`OAuth token exchange failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()).access_token;
}

async function lookupUidByEmail(authToken) {
  // `accounts:lookup` requires a Firebase ID token, not a service-account
  // token. Use `accounts:query` instead — it lists users (paginated, but
  // 200 at a time is enough for admin-promotion scripts) and accepts the
  // service-account Bearer token.
  let nextPageToken;
  do {
    const response = await fetch(`${AUTH_BASE}/v1/projects/${PROJECT_ID}/accounts:query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      // The Auth emulator does not implement `limit` (returns everything).
      body: JSON.stringify(
        args.emulator
          ? { returnUserInfo: true }
          : { returnUserInfo: true, limit: 200, nextPageToken }
      ),
    });
    if (!response.ok) {
      throw new Error(`Auth query failed: ${response.status} ${await response.text()}`);
    }
    const payload = await response.json();
    const user = (payload.userInfo || []).find((u) => u.email === email);
    if (user) {
      if (!user.emailVerified) {
        console.warn(`Warning: ${email} is not email-verified yet.`);
      }
      let claims = {};
      try {
        claims = user.customAttributes ? JSON.parse(user.customAttributes) : {};
      } catch {
        claims = {};
      }
      return { uid: user.localId, claims };
    }
    nextPageToken = payload.nextPageToken;
    if (!nextPageToken) break;
  } while (nextPageToken);
  throw new Error(`User ${email} not found in Firebase Auth`);
}

async function setCustomClaim(authToken, uid, claims) {
  const response = await fetch(`${AUTH_BASE}/v1/projects/${PROJECT_ID}/accounts:update`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(claims) }),
  });
  if (!response.ok) {
    throw new Error(`Set custom claim failed: ${response.status} ${await response.text()}`);
  }
}

async function writeAdminDoc(firestoreToken, uid) {
  const firestoreBase = FIRESTORE_BASE;
  const body = {
    fields: {
      role: { stringValue: 'Admin' },
      email: { stringValue: email },
      updatedAt: { timestampValue: new Date().toISOString() },
    },
  };
  const response = await fetch(`${firestoreBase}/admin_users/${uid}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${firestoreToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Firestore write failed: ${response.status} ${await response.text()}`);
  }
}

async function readAdminDoc(firestoreToken, uid) {
  const response = await fetch(`${FIRESTORE_BASE}/admin_users/${uid}`, {
    headers: { Authorization: `Bearer ${firestoreToken}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Firestore read failed: ${response.status} ${await response.text()}`);
  }
  const { fields = {} } = await response.json();
  return {
    role: fields.role?.stringValue,
    regionIds: fields.regionIds
      ? (fields.regionIds.arrayValue?.values ?? []).map((v) => v.stringValue)
      : undefined,
  };
}

const stringArray = (values) => ({
  arrayValue: { values: values.map((v) => ({ stringValue: v })) },
});

async function writeModeratorDoc(firestoreToken, uid, regionIds, before) {
  const now = new Date().toISOString();
  const doc = {
    fields: {
      role: { stringValue: REGION_MODERATOR_ROLE },
      regionIds: stringArray(regionIds),
      email: { stringValue: email },
      updatedAt: { timestampValue: now },
      updatedBy: { stringValue: 'scripts/promote-admin.mjs' },
    },
  };
  const audit = {
    fields: {
      action: { stringValue: before ? 'updateRegionModerator' : 'grantRegionModerator' },
      actorUid: { stringValue: 'scripts/promote-admin.mjs' },
      targetUid: { stringValue: uid },
      targetEmail: { stringValue: email },
      before: before
        ? {
            mapValue: {
              fields: {
                role: { stringValue: REGION_MODERATOR_ROLE },
                regionIds: stringArray(before),
              },
            },
          }
        : { nullValue: null },
      after: {
        mapValue: {
          fields: {
            role: { stringValue: REGION_MODERATOR_ROLE },
            regionIds: stringArray(regionIds),
          },
        },
      },
      createdAt: { timestampValue: now },
    },
  };
  // One commit: the role doc and its audit entry are written together.
  const response = await fetch(`${FIRESTORE_BASE}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${firestoreToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [
        {
          update: { name: `${FIRESTORE_BASE.replace(/^.*\/v1\//, '')}/admin_users/${uid}`, ...doc },
        },
        {
          update: {
            name: `${FIRESTORE_BASE.replace(/^.*\/v1\//, '')}/admin_audit_log/promote-${uid}-${Date.now()}`,
            ...audit,
          },
          currentDocument: { exists: false },
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Firestore commit failed: ${response.status} ${await response.text()}`);
  }
}

const authToken = await getAccessToken(
  'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform'
);
const firestoreToken = await getAccessToken('https://www.googleapis.com/auth/datastore');

console.log(`Looking up ${email}${args.emulator ? ' (emulator)' : ''}...`);
const { uid, claims } = await lookupUidByEmail(authToken);
console.log(`  uid: ${uid}`);

if (args.role === REGION_MODERATOR_ROLE) {
  const currentDoc = await readAdminDoc(firestoreToken, uid);
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
  await writeModeratorDoc(firestoreToken, uid, plan.regionIds, plan.before);
  console.log(
    `\nDone. ${email} (${uid}) is now RegionModerator for: ${plan.regionIds.join(', ')}` +
      (plan.before ? ` (before: ${plan.before.join(', ') || '-'})` : '')
  );
  console.log('Takes effect immediately (no new sign-in needed).');
  process.exit(0);
}

console.log('Setting custom claim role=Admin...');
await setCustomClaim(authToken, uid, { role: 'Admin' });

console.log('Writing admin_users doc...');
await writeAdminDoc(firestoreToken, uid);

console.log(`\nDone. ${email} (${uid}) is now admin.`);
console.log('The user must sign out and back in for the new custom claim to take effect.');
