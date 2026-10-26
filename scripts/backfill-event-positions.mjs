#!/usr/bin/env node
/**
 * Fills `lat` / `lng` on existing events so the radius filter of "Wo bist du?" can place
 * them. New and edited events get the fields from the event form (src/lib/eventPosition.js);
 * this script covers everything written before. The position is derived from the event's
 * Ort (`city`) and Bezirk with the bundled place list (src/data/placeIndex.json), i.e. with
 * Gemeinde accuracy. Online events are skipped. Only `lat` / `lng` are written, and only when
 * they are missing (or with --all, recomputed).
 *
 * Dry run by default. Pass --write to actually update.
 *
 * Authentication: service account JSON, same as backfill-event-city.mjs
 * (GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON).
 *
 * Usage:
 *   node scripts/backfill-event-positions.mjs             # preview, prints a table
 *   node scripts/backfill-event-positions.mjs --write     # write lat / lng
 *   PROJECT_ID=tribe-vbg-staging node scripts/backfill-event-positions.mjs --write
 */
import fs from 'node:fs';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { eventPosition, preparePlaceIndex } from '../src/utils/placeSearch.js';
import { mergeRegions } from '../src/utils/regions.js';

const PROJECT_ID = process.env.PROJECT_ID || 'spirieventsvbg';
const WRITE = process.argv.includes('--write');
const ALL = process.argv.includes('--all');

function initFirebase() {
  if (getApps().length > 0) return;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
      projectId: PROJECT_ID,
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  } else {
    initializeApp({ projectId: PROJECT_ID });
  }
}

async function main() {
  initFirebase();
  const db = getFirestore();
  console.log(`[backfill-event-positions] project=${PROJECT_ID} write=${WRITE} all=${ALL}`);

  const raw = JSON.parse(
    fs.readFileSync(new URL('../src/data/placeIndex.json', import.meta.url), 'utf8')
  );
  const index = preparePlaceIndex(raw);
  const regionDocs = await db.collection('regions').get();
  const regions = mergeRegions(regionDocs.docs.map((d) => ({ id: d.id, ...d.data() })));

  const snapshot = await db.collection('events').get();
  const todo = snapshot.docs.filter((d) => {
    const e = d.data();
    return !e.isOnline && (ALL || e.lat == null || e.lng == null);
  });
  console.log(`[backfill-event-positions] ${snapshot.size} events, ${todo.length} to place.`);

  const placed = [];
  const skipped = [];
  for (const doc of todo) {
    const e = doc.data();
    const pos = eventPosition({ ...e, regionId: e.regionId || 'vorarlberg' }, index, regions);
    const row = { id: doc.id, title: e.title, city: e.city || '', bezirk: e.bezirk || '' };
    if (pos) placed.push({ ...row, pos, ref: doc.ref });
    else skipped.push(row);
  }

  console.log(`\nWird eingetragen (${placed.length}):`);
  for (const p of placed) {
    console.log(`  ${p.id}  ${p.city || '-'} (${p.bezirk || '-'}) -> ${p.pos.lat}, ${p.pos.lng}`);
  }
  console.log(
    `\nBleibt ohne Position, zeigt weiter nur in der eigenen Region (${skipped.length}):`
  );
  for (const s of skipped) console.log(`  ${s.id}  [${s.bezirk || '-'}] "${s.city}"  (${s.title})`);

  if (!WRITE) {
    console.log('\nDry run — nichts geschrieben. Mit --write ausführen, um zu speichern.');
    return;
  }
  for (const p of placed) await p.ref.update({ lat: p.pos.lat, lng: p.pos.lng });
  console.log(`\n${placed.length} Event(s) aktualisiert.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
