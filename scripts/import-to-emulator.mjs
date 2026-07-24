#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIRESTORE_EMULATOR = 'http://localhost:8181';
const PROJECT_ID = 'spirieventsvbg';

async function importCollection(collection, docs) {
  console.log(`Importing ${collection}: ${docs.length} docs...`);

  for (const doc of docs) {
    const { id, ...data } = doc;
    const url = `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${id}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: convertToFirestoreFormat(data) }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`  Error importing ${id}: ${err}`);
    }
  }
  console.log(`  Done`);
}

function convertToFirestoreFormat(data) {
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = convertValue(value);
  }
  return result;
}

function convertValue(val) {
  if (val === null) return { nullValue: null };
  if (val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: String(val) };
  }
  if (typeof val === 'boolean') return { booleanValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(convertValue) } };
  if (typeof val === 'object') return { mapValue: { fields: convertToFirestoreFormat(val) } };
  return { stringValue: String(val) };
}

async function main() {
  const exportDir = join(ROOT, 'data-export/firestore-export');

  if (!existsSync(join(exportDir, 'events.json'))) {
    console.error('No export found. Run: node scripts/export-firestore.mjs');
    process.exit(1);
  }

  console.log('Loading Firestore data...');
  const events = JSON.parse(readFileSync(join(exportDir, 'events.json'), 'utf8'));
  const users = JSON.parse(readFileSync(join(exportDir, 'users.json'), 'utf8'));

  await importCollection('events', events);
  await importCollection('users', users);

  console.log('\nDone! Data should now be in emulator.');
  console.log('Refresh: http://localhost:4040/firestore');
}

main().catch(console.error);
