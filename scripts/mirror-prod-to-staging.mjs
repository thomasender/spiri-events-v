#!/usr/bin/env node
// Mirrors the PRODUCTION Firestore (spirieventsvbg, read only) into the STAGING
// project (tribe-vbg-staging) with all personal data sanitized, so the regionId
// migration can be rehearsed on realistic data. Re-runnable.
//
// Dry-run (default):  node scripts/mirror-prod-to-staging.mjs
//     reads everything, sanitizes in memory, prints counts / drops / leak scan,
//     writes nothing.
// Write:              node scripts/mirror-prod-to-staging.mjs --apply
//     replaces the mirrored collections in STAGING, then writes the sanitized docs
//     (same doc ids and subcollection structure).
// Tests:              node scripts/mirror-prod-to-staging.mjs --emulator [host] [--apply]
//     source AND target are the emulator (projects spirieventsvbg / tribe-vbg-staging).
//
// Credentials: Application Default Credentials (gcloud auth application-default
// login); the account needs read access to production and write access to staging.
// Source and target are hard-coded; the write target is checked twice
// (src/utils/stagingMirror.js). Not mirrored: Auth users, Storage files (image
// URLs keep pointing at production's public URLs).
// Logic: src/utils/stagingMirror.js
import { PAGE_SIZE } from '../src/utils/firestoreBackup.js';
import {
  PROD_PROJECT_ID,
  STAGING_PROJECT_ID,
  MIRROR_POLICY,
  applyMirror,
  assertStagingTarget,
  buildMirror,
  formatReport,
  resolveMirrorOptions,
  scanLeaks,
} from '../src/utils/stagingMirror.js';

const TAG = '[mirror-prod-to-staging]';

// Read-only by construction: this object only offers get / list / count. The
// source Firestore instance is never handed to any write code.
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

function makeWriter(db, app) {
  return {
    // The id of the INITIALIZED app, not of our own constant.
    projectId: () => app.options.projectId,
    async deleteCollection(name) {
      await db.recursiveDelete(db.collection(name));
    },
    async deleteDocument(path) {
      await db.recursiveDelete(db.doc(path));
    },
    async commit(ops) {
      const batch = db.batch();
      for (const op of ops) batch.set(db.doc(op.path), op.data); // Timestamps are written as is
      await batch.commit();
    },
  };
}

async function main() {
  let opts;
  try {
    opts = resolveMirrorOptions(process.argv.slice(2), { env: process.env });
  } catch (err) {
    console.error(`${TAG} ${err.message}`);
    process.exit(1);
  }
  const where = opts.emulator
    ? `Emulator ${opts.emulatorHost} (beide Seiten)`
    : `${PROD_PROJECT_ID} (nur lesen) -> ${STAGING_PROJECT_ID}`;
  console.log(`${TAG} Quelle -> Ziel: ${where}`);
  console.log(
    `${TAG} Modus: ${opts.apply ? 'APPLY (ersetzt Staging-Inhalt)' : 'DRY-RUN (nichts wird geschrieben)'}`
  );
  if (opts.emulator) {
    process.env.FIRESTORE_EMULATOR_HOST = opts.emulatorHost;
  }

  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const sourceApp = initializeApp({ projectId: opts.sourceProjectId }, 'mirror-source');
  const targetApp = initializeApp({ projectId: opts.targetProjectId }, 'mirror-target');
  const sourceDb = getFirestore(sourceApp);
  const targetDb = getFirestore(targetApp);

  const result = await buildMirror(makeFetcher(sourceDb), {
    onProgress: (path, n) => console.log(`${TAG}   gelesen ${path}: ${n}`),
  });
  const leaks = scanLeaks(result.docs);
  for (const line of formatReport(result, leaks)) console.log(`${TAG} ${line}`);
  if (leaks.length) {
    console.error(
      `${TAG} ABBRUCH: personenbezogene Daten im Ergebnis, es wird nichts geschrieben.`
    );
    process.exit(1);
  }

  if (!opts.apply) {
    const known = Object.keys(MIRROR_POLICY).length;
    console.log(`${TAG} DRY-RUN: nichts geschrieben (${known} Schema-Pfade in der Allowlist).`);
    console.log(
      `${TAG} Zum Schreiben: node scripts/mirror-prod-to-staging.mjs${opts.emulator ? ` --emulator ${opts.emulatorHost}` : ''} --apply`
    );
    return;
  }

  assertStagingTarget(targetApp.options.projectId);
  const written = await applyMirror(makeWriter(targetDb, targetApp), result.docs, {
    onWipe: (p) => console.log(`${TAG}   Staging geleert: ${p}`),
    onBatch: (n, total) => console.log(`${TAG}   geschrieben ${n}/${total}`),
  });
  console.log(`${TAG} Fertig: ${written} Dokumente nach ${STAGING_PROJECT_ID} geschrieben.`);
}

main().catch((err) => {
  console.error(`${TAG} FEHLER:`, err);
  process.exit(1);
});
