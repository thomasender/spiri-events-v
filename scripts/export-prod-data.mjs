#!/usr/bin/env node
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const outDir = join(ROOT, 'data-export');

const projectId = process.argv[2] || 'spirieventsvbg';

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

console.log(`Exporting from ${projectId}...\n`);

console.log('Exporting Auth...');
try {
  execSync(`firebase auth:export ./data-export/auth-export.json --project ${projectId} --clear-text`, { stdio: 'inherit' });
  console.log('✔ Auth exported\n');
} catch (e) {
  console.log('✗ Auth export failed\n');
}

console.log('Firestore export: Use Firebase Console or gcloud CLI:');
console.log('  gcloud firestore export gs://YOUR_BUCKET/firestore-export --project=' + projectId);
console.log('  Then download from Cloud Storage and place in data-export/ as firestore_export/');
console.log('');

console.log('To import into emulator:');
console.log('  1. Start emulators: firebase emulators:start');
console.log('  2. Import data: firebase emulators:import ./data-export');
console.log('');
