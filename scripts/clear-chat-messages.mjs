#!/usr/bin/env node
/**
 * Empties the community chat before a live go: all Lagerfeuer messages and all
 * Kerzenraum rooms (messages, cooldown markers and the event_chats/{id} summary doc,
 * so the candles on the calendar cards disappear). Also removes the data that only
 * points at those messages: chat_reports and users/{uid}/mentions.
 * Kept: chat_bans, presence, the app_settings/chat flag, the Postfach (dm_*).
 *
 * DRY_RUN defaults to true and only counts. Set DRY_RUN=false to delete.
 * Auth: GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON
 * (or FIRESTORE_EMULATOR_HOST for the emulator).
 * Env: PROJECT_ID (default spirieventsvbg).
 */
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.PROJECT_ID || 'spirieventsvbg';
const DRY_RUN = process.env.DRY_RUN !== 'false';

if (getApps().length === 0) {
  const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
    : applicationDefault();
  initializeApp({ credential, projectId: PROJECT_ID });
}

const db = getFirestore();
console.log(`[chat-clear] project=${PROJECT_ID} dryRun=${DRY_RUN}`);

async function clear(label, refs) {
  console.log(`[chat-clear] ${DRY_RUN ? 'would delete' : 'deleting'} ${refs.length} ${label}`);
  if (DRY_RUN) return;
  for (const ref of refs) await db.recursiveDelete(ref);
}

const lagerfeuer = db.doc('chat_rooms/lagerfeuer');
await clear('Lagerfeuer messages', await lagerfeuer.collection('messages').listDocuments());
await clear('Lagerfeuer cooldown markers', await lagerfeuer.collection('members').listDocuments());

// listDocuments() also returns summary-less parents, so no room is missed.
await clear('Kerzenräume (summary + messages + markers)', await db.collection('event_chats').listDocuments());
await clear('chat reports', await db.collection('chat_reports').listDocuments());
await clear(
  'mention notifications',
  (await db.collectionGroup('mentions').get()).docs.map((d) => d.ref),
);

console.log(DRY_RUN ? '[chat-clear] Dry run only. Re-run with DRY_RUN=false to delete.' : '[chat-clear] Done.');
