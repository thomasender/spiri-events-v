#!/usr/bin/env node
// One-off script to promote an existing Firebase Auth user to admin.
// Sets both the custom auth claim (Auth Backend API) and the
// admin_users Firestore doc so the user passes either of the two
// checks in firestore.rules.
//
// Uses REST APIs (with a signed JWT) instead of firebase-admin because
// firebase-admin pulls in jwks-rsa which currently fails under ESM
// (see scripts/export-firestore.mjs for the same workaround).

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createSign } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CRED_PATH = join(ROOT, 'scripts/service-account.json');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/promote-admin.mjs <email>');
  process.exit(1);
}

if (!existsSync(CRED_PATH)) {
  console.error('Error: scripts/service-account.json not found');
  process.exit(1);
}

const cred = JSON.parse(readFileSync(CRED_PATH, 'utf8'));
const PROJECT_ID = cred.project_id;

function base64urlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken(scopes) {
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
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnUserInfo: true, limit: 200, nextPageToken }),
      }
    );
    if (!response.ok) {
      throw new Error(`Auth query failed: ${response.status} ${await response.text()}`);
    }
    const payload = await response.json();
    const user = (payload.userInfo || []).find((u) => u.email === email);
    if (user) {
      if (!user.emailVerified) {
        console.warn(`Warning: ${email} is not email-verified yet.`);
      }
      return user.localId;
    }
    nextPageToken = payload.nextPageToken;
    if (!nextPageToken) break;
  } while (nextPageToken);
  throw new Error(`User ${email} not found in Firebase Auth`);
}

async function setCustomClaim(authToken, uid, claims) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(claims) }),
    }
  );
  if (!response.ok) {
    throw new Error(`Set custom claim failed: ${response.status} ${await response.text()}`);
  }
}

async function writeAdminDoc(firestoreToken, uid) {
  const firestoreBase = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
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

const authToken = await getAccessToken(
  'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform'
);
const firestoreToken = await getAccessToken('https://www.googleapis.com/auth/datastore');

console.log(`Looking up ${email}...`);
const uid = await lookupUidByEmail(authToken);
console.log(`  uid: ${uid}`);

console.log('Setting custom claim role=Admin...');
await setCustomClaim(authToken, uid, { role: 'Admin' });

console.log('Writing admin_users doc...');
await writeAdminDoc(firestoreToken, uid);

console.log(`\nDone. ${email} (${uid}) is now admin.`);
console.log('The user must sign out and back in for the new custom claim to take effect.');