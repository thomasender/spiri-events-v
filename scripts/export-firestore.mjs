#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createSign, createVerify } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const credPath = join(ROOT, 'scripts/service-account.json');

if (!existsSync(credPath)) {
  console.error('Error: service-account.json not found');
  console.error('Download from: Firebase Console > Project Settings > Service Accounts > Generate new private key');
  console.error('Save as: scripts/service-account.json');
  process.exit(1);
}

const cred = JSON.parse(readFileSync(credPath, 'utf8'));
const PROJECT_ID = cred.project_id;

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  const header = base64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64urlEncode(JSON.stringify({
    iss: cred.client_email,
    sub: cred.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/datastore',
    iat: now,
    exp: expiry,
  }));

  const signingInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  const sig = signer.sign(cred.private_key);
  const signature = sig.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const jwt = `${signingInput}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await response.json();
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
  return data.access_token;
}

function base64urlEncode(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function exportFirestore(accessToken) {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)`;

  console.log('Fetching collections...');

  const collections = ['events', 'users'];
  const data = {};

  for (const coll of collections) {
    try {
      const response = await fetch(`${baseUrl}/documents/${coll}?pageSize=1000`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = await response.json();

      if (result.documents) {
        data[coll] = result.documents.map(doc => {
          const docPath = doc.name.split('/documents/')[1];
          const id = docPath.split('/').slice(1).join('/');
          return { id, ...convertValues(doc.fields) };
        });
        console.log(`  ${coll}: ${data[coll].length} documents`);
      } else if (result.error) {
        console.error(`  ${coll}: API error - ${result.error.message}`);
        data[coll] = [];
      } else {
        data[coll] = [];
        console.log(`  ${coll}: 0 documents`);
      }
    } catch (e) {
      console.error(`  Error fetching ${coll}:`, e.message);
      data[coll] = [];
    }
  }

  return data;
}

function convertValues(fields) {
  if (!fields) return {};
  const result = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = convertValue(value);
  }
  return result;
}

function convertValue(val) {
  if (!val || typeof val !== 'object') return val;

  const { stringValue, integerValue, doubleValue, booleanValue, timestampValue, referenceValue, arrayValue, mapValue } = val;

  if (stringValue !== undefined) return stringValue;
  if (integerValue !== undefined) return parseInt(integerValue, 10);
  if (doubleValue !== undefined) return parseFloat(doubleValue);
  if (booleanValue !== undefined) return booleanValue;
  if (timestampValue !== undefined) return timestampValue;
  if (referenceValue !== undefined) return referenceValue;
  if (arrayValue?.values) return arrayValue.values.map(convertValue);
  if (mapValue?.fields) return convertValues(mapValue.fields);

  return val;
}

async function main() {
  const outDir = join(ROOT, 'data-export');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log(`Exporting Firestore from ${PROJECT_ID}...\n`);

  const accessToken = await getAccessToken();
  const data = await exportFirestore(accessToken);

  const outPath = join(outDir, 'firestore-export');
  mkdirSync(outPath, { recursive: true });

  for (const [coll, docs] of Object.entries(data)) {
    writeFileSync(join(outPath, `${coll}.json`), JSON.stringify(docs, null, 2));
  }

  const manifest = {
    version: 'emulator-data',
    collections: Object.keys(data)
  };
  writeFileSync(join(outPath, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\nExported to ${outPath}/`);
  console.log('Import with: firebase emulators:import ./data-export');
}

main().catch(console.error);
