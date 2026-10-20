#!/usr/bin/env node
/**
 * Fills the new `city` (Ort / Gemeinde) field on existing events (ticket
 * IbZJpCC1). Events created before the change only have `bezirk` and a
 * free-text `place`; the card then shows just the Bezirk.
 *
 * The Gemeinde is read out of `place` ("Yoga Studio Dornbirn, Kirchgasse 4a",
 * "Spielerstrasse 27a, 6845 Hohenems", "Mäder"). It is deliberately
 * conservative — an event is only written when
 *   - exactly ONE Gemeinde name appears in `place` (as a whole word), and
 *   - that Gemeinde lies in the event's stored Bezirk (so `bezirk` never
 *     changes and a "Dornbirn" in a studio name cannot override a Götzis one), and
 *   - for names that are also everyday words (Hard, Brand, Au, Egg, ...) the
 *     name is the last part of the address, or follows a postcode.
 * Everything else is listed for manual handling and left untouched (the card
 * keeps showing the Bezirk). Only `city` is written; nothing else changes.
 *
 * Dry run by default. Pass --write to actually update.
 *
 * Authentication: service account JSON, same as migrate-event-slugs.mjs
 * (GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON).
 *
 * Usage:
 *   node scripts/backfill-event-city.mjs            # preview, prints a table
 *   node scripts/backfill-event-city.mjs --write    # write `city`
 *   PROJECT_ID=tribe-vbg-staging node scripts/backfill-event-city.mjs
 */

import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GEMEINDEN } from '../src/utils/gemeinden.js';

const PROJECT_ID = process.env.PROJECT_ID || 'spirieventsvbg';
const WRITE = process.argv.includes('--write');

// Gemeinde names that are also common words / short fragments in addresses.
const COMMON_WORDS = new Set([
  'Au',
  'Brand',
  'Buch',
  'Egg',
  'Hard',
  'Klaus',
  'Lech',
  'Sonntag',
  'Sulz',
  'Weiler',
  'Doren',
  'Reuthe',
]);

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

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LETTER = 'A-Za-zÄÖÜäöüß';

function wholeWord(name) {
  return new RegExp(`(?<![${LETTER}])${escapeRe(name)}(?![${LETTER}])`, 'i');
}

function isAtAddressEnd(place, name) {
  const lastPart = place.split(',').pop().trim();
  return new RegExp(`^(\\d{4}\\s+)?${escapeRe(name)}$`, 'i').test(lastPart);
}

/** @returns {{ city: string } | { skip: string }} */
export function matchCity(event) {
  const place = (event.place || '').trim();
  if (!place) return { skip: 'kein Ort im Textfeld' };
  const hits = GEMEINDEN.filter((g) => wholeWord(g.name).test(place)).filter(
    (g) => !COMMON_WORDS.has(g.name) || isAtAddressEnd(place, g.name)
  );
  // "Langen bei Bregenz" would also report "Bregenz": drop names contained in a longer hit.
  const longest = hits.filter(
    (g) => !hits.some((o) => o !== g && o.name.length > g.name.length && o.name.includes(g.name))
  );
  if (longest.length === 0) return { skip: 'keine Gemeinde im Text gefunden' };
  if (longest.length > 1) {
    return { skip: `mehrdeutig: ${longest.map((g) => g.name).join(' / ')}` };
  }
  const [hit] = longest;
  if (hit.bezirk !== event.bezirk) {
    return { skip: `${hit.name} liegt im Bezirk ${hit.bezirk}, Event hat ${event.bezirk}` };
  }
  return { city: hit.name };
}

async function main() {
  initFirebase();
  const db = getFirestore();
  console.log(`[backfill-event-city] project=${PROJECT_ID} write=${WRITE}`);

  const snapshot = await db.collection('events').get();
  const todo = snapshot.docs.filter((d) => {
    const e = d.data();
    return !e.isOnline && !e.city;
  });
  console.log(`[backfill-event-city] ${snapshot.size} events, ${todo.length} without city.`);

  const matched = [];
  const skipped = [];
  for (const doc of todo) {
    const e = doc.data();
    const result = matchCity(e);
    const row = { id: doc.id, title: e.title, bezirk: e.bezirk, place: e.place || '' };
    if (result.city) matched.push({ ...row, city: result.city, ref: doc.ref });
    else skipped.push({ ...row, reason: result.skip });
  }

  console.log(`\nWird eingetragen (${matched.length}):`);
  for (const m of matched) console.log(`  ${m.id}  ${m.city} (Bez. ${m.bezirk})  <- "${m.place}"`);

  console.log(`\nBleibt unverändert, zeigt weiter den Bezirk (${skipped.length}):`);
  for (const s of skipped) {
    console.log(`  ${s.id}  [${s.bezirk || '-'}] "${s.place}"  -> ${s.reason}  (${s.title})`);
  }

  if (!WRITE) {
    console.log('\nDry run — nichts geschrieben. Mit --write ausführen, um zu speichern.');
    return;
  }
  for (const m of matched) await m.ref.update({ city: m.city });
  console.log(`\n${matched.length} Event(s) aktualisiert.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
