#!/usr/bin/env node
// Trustworthy Firestore BACKUP (read-only). Used before the regionId migration.
//
// Emulator (default):    node scripts/export-firestore.mjs
// Production (explicit): node scripts/export-firestore.mjs --project spirieventsvbg
//     Credentials: Application Default Credentials / GOOGLE_APPLICATION_CREDENTIALS
//     (same as scripts/migrate-region-ids.mjs). Reads only, never writes to Firestore.
// Restore check:         node scripts/export-firestore.mjs --verify backups/firestore-<date>
//
// Output: backups/firestore-<YYYY-MM-DD>/ (git-ignored; production) or
// backups/firestore-emulator-<date>/ (emulator): one typed-JSON file per
// collection (users.publicProfile.json, events.messages.json, ...) plus
// manifest.json. The manifest (with `exportedAt`) is written only when every
// collection, subcollection included, was read completely and matches a
// separate server-side count; otherwise the script exits 1 and leaves no
// manifest. It NEVER touches data-export/ (the committed prerender snapshot).
// Logic: src/utils/firestoreBackup.js
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  BACKUP_ROOT_DIR,
  MANIFEST_NAME,
  REQUIRED_PRODUCTION_COLLECTIONS,
  PAGE_SIZE,
  assertSafeOutDir,
  backupDirName,
  resolveExportOptions,
  runBackup,
  verifyBackup,
  writeBackup,
} from '../src/utils/firestoreBackup.js';
import { PROD_PROJECT_ID } from '../src/utils/regionMigration.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = '[export-firestore]';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function makeFetcher(db) {
  return {
    async listRootCollections() {
      return (await db.listCollections()).map((c) => c.id);
    },
    async listPage(collPath, token) {
      let q = db.collection(collPath).orderBy('__name__').limit(PAGE_SIZE);
      if (token) q = q.startAfter(db.doc(token));
      const snap = await q.get();
      const docs = snap.docs.map((d) => ({ path: d.ref.path, data: d.data() }));
      const nextPageToken = snap.docs.length === PAGE_SIZE ? snap.docs.at(-1).ref.path : null;
      return { docs, nextPageToken };
    },
    async listDocumentPaths(collPath) {
      return (await db.collection(collPath).listDocuments()).map((r) => r.path);
    },
    async listSubcollections(docPath) {
      return (await db.doc(docPath).listCollections()).map((c) => c.id);
    },
    async countDocs(collPath) {
      return (await db.collection(collPath).count().get()).data().count;
    },
  };
}

function runVerify(dir) {
  const abs = resolve(ROOT, dir);
  const { ok, problems, manifest } = verifyBackup(
    (name) => readFileSync(join(abs, name), 'utf8'),
    sha256
  );
  if (!ok) {
    for (const p of problems) console.error(`${TAG} PROBLEM: ${p}`);
    console.error(`${TAG} Backup ${dir} ist NICHT in Ordnung.`);
    process.exit(1);
  }
  console.log(`${TAG} Backup ${dir} ok (exportedAt ${manifest.exportedAt}, ${manifest.target}).`);
  for (const [k, n] of Object.entries(manifest.counts)) console.log(`${TAG}   ${k}: ${n}`);
}

async function main() {
  let opts;
  try {
    opts = resolveExportOptions(process.argv.slice(2), { env: process.env });
  } catch (err) {
    console.error(`${TAG} ${err.message}`);
    process.exit(1);
  }
  if (opts.target === 'verify') return runVerify(opts.verify);

  const now = new Date();
  const outDir = opts.outDir ?? `${BACKUP_ROOT_DIR}/${backupDirName(opts.target, now)}`;
  const absOut = resolve(ROOT, outDir);
  assertSafeOutDir(relative(ROOT, absOut));

  if (opts.target === 'emulator') {
    process.env.FIRESTORE_EMULATOR_HOST = opts.emulatorHost;
    process.env.GCLOUD_PROJECT = PROD_PROJECT_ID;
  }
  const where =
    opts.target === 'production'
      ? `PRODUKTION (${PROD_PROJECT_ID}), nur lesen`
      : `Emulator ${opts.emulatorHost}`;
  console.log(`${TAG} Ziel: ${where}`);
  console.log(`${TAG} Ausgabe: ${outDir}`);

  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ projectId: PROD_PROJECT_ID });
  const db = getFirestore();

  const { groups, summary } = await runBackup(makeFetcher(db), {
    requiredCollections: opts.target === 'production' ? REQUIRED_PRODUCTION_COLLECTIONS : [],
    onProgress: (path, n) => console.log(`${TAG}   ${path}: ${n}`),
  });

  const io = {
    mkdir: (p) => mkdirSync(p, { recursive: true }),
    writeFile: (p, body) => writeFileSync(p, body),
    rm: (p) => rmSync(p, { recursive: true, force: true }),
    rename: renameSync,
    sha256,
  };
  mkdirSync(dirname(absOut), { recursive: true });
  const manifest = await writeBackup(io, absOut, {
    groups,
    summary,
    target: opts.target,
    projectId: PROD_PROJECT_ID,
    now,
  });
  console.log(`${TAG} Fertig. Gruppen:`);
  for (const [k, n] of Object.entries(manifest.counts)) console.log(`${TAG}   ${k}: ${n}`);
  console.log(`${TAG} exportedAt ${manifest.exportedAt} -> ${outDir}/${MANIFEST_NAME}`);
}

main().catch((err) => {
  console.error(`${TAG} FEHLER, kein Backup (kein exportedAt):`, err);
  process.exit(1);
});
