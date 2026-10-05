#!/usr/bin/env node
// One-off: adds the categories the directory needs (Coaching, Körperarbeit,
// Ernährung, Therapie) to the production `categories` registry. The in-app
// seed only runs on an empty registry, so existing deployments need this.
//
// Idempotent: categories that already exist (matched by name, case-insensitive)
// are left alone. New ones are inserted before "Sonstiges", which is moved to
// the end. Admins can still reorder/rename everything in the admin UI.
//
// Usage: node scripts/add-directory-categories.mjs [--dry-run]
// Needs scripts/service-account.json (same setup as scripts/promote-admin.mjs).

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createSign } from 'crypto';
import { slugify } from '../src/lib/slug-helpers.js';

const DRY_RUN = process.argv.includes('--dry-run');
const NEW_CATEGORIES = [
  { name: 'Coaching', color: '#4a7572' },
  { name: 'Körperarbeit', color: '#8c5a6e' },
  { name: 'Ernährung', color: '#6f8f4e' },
  { name: 'Therapie', color: '#5b7389' },
];
const STEP = 100;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CRED_PATH = join(ROOT, 'scripts/service-account.json');
if (!existsSync(CRED_PATH)) {
  console.error('Error: scripts/service-account.json not found');
  process.exit(1);
}
const cred = JSON.parse(readFileSync(CRED_PATH, 'utf8'));
const BASE = `https://firestore.googleapis.com/v1/projects/${cred.project_id}/databases/(default)/documents`;

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      iss: cred.client_email,
      sub: cred.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/datastore',
      iat: now,
      exp: now + 3600,
    })
  );
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(cred.private_key, 'base64');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${payload}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`OAuth failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function api(token, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok)
    throw new Error(`${init.method || 'GET'} ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const token = await getAccessToken();
const { documents = [] } = await api(token, '/categories?pageSize=300');
const existing = documents.map((d) => ({
  id: d.name.split('/').pop(),
  name: d.fields?.name?.stringValue || '',
  order: Number(d.fields?.order?.integerValue ?? -1),
}));

const sonstiges = existing.find((c) => c.name.toLowerCase() === 'sonstiges');
const maxOrder = Math.max(-STEP, ...existing.filter((c) => c !== sonstiges).map((c) => c.order));
const toCreate = NEW_CATEGORIES.filter(
  (c) => !existing.some((e) => e.name.toLowerCase() === c.name.toLowerCase())
);

let order = maxOrder + STEP;
for (const cat of toCreate) {
  const id = slugify(cat.name);
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}create ${id} (order ${order})`);
  if (!DRY_RUN) {
    const now = new Date().toISOString();
    await api(token, `/categories/${id}?currentDocument.exists=false`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          name: { stringValue: cat.name },
          color: { stringValue: cat.color },
          order: { integerValue: String(order) },
          createdBy: { stringValue: 'system' },
          createdAt: { timestampValue: now },
          updatedAt: { timestampValue: now },
        },
      }),
    });
  }
  order += STEP;
}

if (sonstiges && toCreate.length > 0) {
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}move Sonstiges to order ${order}`);
  if (!DRY_RUN) {
    await api(
      token,
      `/categories/${sonstiges.id}?updateMask.fieldPaths=order&updateMask.fieldPaths=updatedAt`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          fields: {
            order: { integerValue: String(order) },
            updatedAt: { timestampValue: new Date().toISOString() },
          },
        }),
      }
    );
  }
}
console.log(toCreate.length === 0 ? 'Nothing to do.' : 'Done.');
