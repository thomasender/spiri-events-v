#!/usr/bin/env node
/**
 * Gives every event document that has NO `slug` yet one in the current format
 * (see `generateEventSlug` in src/lib/slug-helpers.js). Runs on every deploy.
 *
 * Existing slugs are never rewritten (Trello djZ97twM): event URLs are shared
 * on Instagram and elsewhere, and a changed slug breaks those links. When the
 * URL format changes, only events created afterwards get the new format.
 *
 * History: nsTPz8wF / z9LqixJO used this script to rewrite all slugs once to
 * the title+category+in+bezirk format with umlaut digraphs.
 *
 * Authentication: requires a service account JSON. Set
 * GOOGLE_APPLICATION_CREDENTIALS to the service account file path, or set
 * FIREBASE_SERVICE_ACCOUNT_JSON to the raw JSON contents.
 *
 * Configuration via env vars:
 *   PROJECT_ID       Firebase project id (default: spirieventsvbg)
 *   DRY_RUN          If "true", only logs what would be changed
 *   FIRESTORE_EMULATOR_HOST  Set automatically when running against the emulator
 *
 * Usage:
 *   DRY_RUN=true node scripts/migrate-event-slugs.mjs   # preview only
 *   node scripts/migrate-event-slugs.mjs                # real write
 */

import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { planMissingEventSlugs } from '../src/lib/slug-helpers.js';

const PROJECT_ID = process.env.PROJECT_ID || 'spirieventsvbg';
const DRY_RUN = process.env.DRY_RUN === 'true';

function initFirebase() {
  if (getApps().length > 0) return;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({ credential: cert(credentials), projectId: PROJECT_ID });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  } else {
    initializeApp({ projectId: PROJECT_ID });
  }
}

async function main() {
  initFirebase();
  const db = getFirestore();

  console.log(`[migrate-event-slugs] project=${PROJECT_ID} dryRun=${DRY_RUN} starting…`);

  const snapshot = await db.collection('events').get();
  console.log(`[migrate-event-slugs] Found ${snapshot.size} event(s).`);

  const updates = planMissingEventSlugs(
    snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }))
  ).map(({ id, slug }) => ({
    id,
    title: snapshot.docs.find((d) => d.id === id)?.data().title || '',
    oldSlug: '',
    newSlug: slug,
  }));

  if (updates.length === 0) {
    console.log('[migrate-event-slugs] No changes needed. Every event already has a slug.');
    return;
  }

  console.log(`[migrate-event-slugs] ${updates.length} event(s) would change:`);
  for (const u of updates) {
    console.log(`  - ${u.id}  ${u.title}`);
    console.log(`      ${u.oldSlug || '(empty)'}`);
    console.log(`    → ${u.newSlug}`);
  }

  if (DRY_RUN) {
    console.log('[migrate-event-slugs] DRY_RUN=true — no writes performed.');
    return;
  }

  let written = 0;
  for (const u of updates) {
    await db.collection('events').doc(u.id).update({ slug: u.newSlug });
    written += 1;
  }
  console.log(`[migrate-event-slugs] Wrote ${written}/${updates.length} update(s).`);
  console.log('[migrate-event-slugs] Done.');
}

main().catch((err) => {
  console.error('[migrate-event-slugs] Fatal:', err);
  process.exit(1);
});
