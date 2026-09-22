#!/usr/bin/env node
/**
 * Re-generates the `slug` field on every event document using the new format
 * `{titleSlug}-{categorySlug}-in-{bezirkSlug}-{yyyymmdd}` and the umlaut-aware
 * `slugify()` (ä→ae, ü→ue, ö→oe, ß→ss, &→und).
 *
 * Two Trello tickets drove this:
 *   - nsTPz8wF: change event URL to title+category+in+bezirk
 *   - z9LqixJO: existing events still use stale slugs that pre-date the
 *     umlaut digraph handling (e.g. "Männeryoga" → "mnneryoga")
 *
 * The script is idempotent: it only writes when the new slug differs from the
 * current value. Existing unique collisions get a `-2`, `-3`, … counter suffix,
 * same rule `findUniqueSlug` uses at write-time.
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
import { generateEventSlug } from '../src/lib/slug-helpers.js';

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

function normalizeCategory(event) {
  if (event.category) return event.category;
  if (Array.isArray(event.categories) && event.categories.length > 0) {
    return event.categories[0];
  }
  return 'Sonstiges';
}

function normalizeBezirk(event) {
  return event.isOnline ? '' : event.bezirk || '';
}

function makeUnique(baseSlug, reserved) {
  if (!reserved.has(baseSlug)) return baseSlug;
  let counter = 2;
  while (reserved.has(`${baseSlug}-${counter}`)) {
    counter += 1;
  }
  return `${baseSlug}-${counter}`;
}

async function main() {
  initFirebase();
  const db = getFirestore();

  console.log(
    `[migrate-event-slugs] project=${PROJECT_ID} dryRun=${DRY_RUN} starting…`
  );

  const snapshot = await db.collection('events').get();
  console.log(`[migrate-event-slugs] Found ${snapshot.size} event(s).`);

  const reservedSlugs = new Map();
  for (const doc of snapshot.docs) {
    reservedSlugs.set(doc.id, doc.data().slug || '');
  }

  const proposed = new Map();
  const updates = [];
  const unchanged = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const title = data.title || '';
    const category = normalizeCategory(data);
    const bezirk = normalizeBezirk(data);
    const date = data.date || '';

    const base = generateEventSlug(title, category, bezirk, date);
    if (!base) {
      unchanged.push({ id: doc.id, reason: 'empty base slug' });
      continue;
    }

    const reserved = new Set(
      Array.from(reservedSlugs.values()).concat(Array.from(proposed.values()))
    );
    reserved.delete(reservedSlugs.get(doc.id));

    const newSlug = makeUnique(base, reserved);
    proposed.set(doc.id, newSlug);

    const oldSlug = reservedSlugs.get(doc.id);
    if (newSlug === oldSlug) {
      unchanged.push({ id: doc.id, slug: newSlug });
    } else {
      updates.push({ id: doc.id, title, oldSlug, newSlug });
    }
  }

  if (updates.length === 0) {
    console.log('[migrate-event-slugs] No changes needed. All slugs already up-to-date.');
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
  console.log(`[migrate-event-slugs] Unchanged: ${unchanged.length}`);
  console.log('[migrate-event-slugs] Done.');
}

main().catch((err) => {
  console.error('[migrate-event-slugs] Fatal:', err);
  process.exit(1);
});