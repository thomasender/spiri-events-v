#!/usr/bin/env node
/**
 * Fills `moderation_log` (admin tab "Protokoll") with the history that exists
 * from before the log: every revision in events/{id}/revisions and, where no
 * revision covers them, the who/when fields on the event (approvedBy/At,
 * unpublishedBy/At, trashedBy/At). Logic: buildBackfillEntries in
 * functions/src/moderationLog.ts (tests/lib/moderationLog.spec.ts).
 *
 * Safe to re-run: the doc id is the revision id (the live trigger uses the
 * same), or "<action>-<eventId>" for entries from event fields; existing docs
 * are skipped, never overwritten.
 *
 * Not recoverable (see docs/regions.md, "Moderationsprotokoll"): events that
 * were deleted (also the daily purge of expired events, which removes their
 * revisions), rejections other than the event's current trash state, and the
 * person's role at the time (today's role is used).
 *
 * Dry run by default. Pass --write to write. Needs the compiled functions:
 *   npm --prefix functions run build
 *   node scripts/backfill-moderation-log.mjs            # dry run
 *   node scripts/backfill-moderation-log.mjs --write
 * Authentication: GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON;
 * PROJECT_ID (default spirieventsvbg). Against the emulator set
 * FIRESTORE_EMULATOR_HOST (and FIREBASE_AUTH_EMULATOR_HOST).
 */

import { createRequire } from 'node:module';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const {
  buildBackfillEntries,
  MODERATION_LOG_COLLECTION,
} = require('../functions/lib/moderationLog');

const PROJECT_ID = process.env.PROJECT_ID || 'spirieventsvbg';
const WRITE = process.argv.includes('--write');

if (getApps().length === 0) {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  initializeApp({
    projectId: PROJECT_ID,
    credential: json ? cert(JSON.parse(json)) : applicationDefault(),
  });
}

const db = getFirestore();
const millis = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : null);

const [eventsSnap, staffSnap] = await Promise.all([
  db.collection('events').get(),
  db.collection('admin_users').get(),
]);
const staffDocs = Object.fromEntries(staffSnap.docs.map((d) => [d.id, d.data()]));

// Revisions per event, and every uid that appears, for names and roles.
const perEvent = [];
const uids = new Set(Object.keys(staffDocs));
for (const eventDoc of eventsSnap.docs) {
  const data = eventDoc.data();
  const revSnap = await eventDoc.ref.collection('revisions').get();
  const revisions = revSnap.docs.map((d) => ({
    id: d.id,
    atMs: millis(d.get('at')),
    by: d.get('by') ?? null,
    byName: d.get('byName') ?? null,
    statusFrom: d.get('statusFrom') ?? null,
    statusTo: d.get('statusTo') ?? null,
    changes: d.get('changes') ?? {},
  }));
  for (const r of revisions) if (r.by) uids.add(r.by);
  for (const f of ['approvedBy', 'unpublishedBy', 'trashedBy']) {
    if (typeof data[f] === 'string') uids.add(data[f]);
  }
  perEvent.push({ id: eventDoc.id, data, revisions });
}

const people = {};
const uidList = [...uids];
for (let i = 0; i < uidList.length; i += 100) {
  const chunk = uidList.slice(i, i + 100);
  const result = await getAuth()
    .getUsers(chunk.map((uid) => ({ uid })))
    .catch(() => ({ users: [] }));
  const names = Object.fromEntries(
    result.users.map((u) => [u.uid, u.displayName || u.email || null])
  );
  for (const uid of chunk) people[uid] = { name: names[uid] ?? null, staffDoc: staffDocs[uid] };
}

const entries = perEvent.flatMap((e) => buildBackfillEntries(e.id, e.data, e.revisions, people));
const counts = {};
for (const e of entries) counts[e.action] = (counts[e.action] || 0) + 1;
console.log(`Events: ${perEvent.length}, entries built: ${entries.length}`, counts);

if (!WRITE) {
  console.log('Dry run, nothing written. Pass --write to write the entries.');
  process.exit(0);
}

const col = db.collection(MODERATION_LOG_COLLECTION);
let written = 0;
let skipped = 0;
for (const { id, atMs, ...entry } of entries) {
  try {
    await col.doc(id).create({ ...entry, at: Timestamp.fromMillis(atMs) });
    written += 1;
  } catch (err) {
    if (err?.code === 6 /* ALREADY_EXISTS */) skipped += 1;
    else throw err;
  }
}
console.log(`Written: ${written}, already there: ${skipped}`);
