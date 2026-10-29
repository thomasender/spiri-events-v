#!/usr/bin/env node
// Sets (or clears) the club-member badge flag `clubMember` on the public profile
// of the given usernames. Same effect as the checkbox in Verwaltung > Mitglieder
// (callable adminUpdateMember), for when you want to flip it from a terminal.
// Dry run by default: lists what it would change and writes nothing.
//
// Emulator (default):  node scripts/set-club-member.mjs noemi jana
// Production:          node scripts/set-club-member.mjs --prod noemi jana          # dry run
//                      node scripts/set-club-member.mjs --prod --apply noemi jana  # write
//                      add --off to remove the badge instead
//                      (prod needs scripts/service-account.json)
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'spirieventsvbg';
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const usernames = args
  .filter(a => !a.startsWith('--'))
  .map(a => a.replace(/^\//, '').toLowerCase());

if (usernames.length === 0) {
  console.error('Usage: node scripts/set-club-member.mjs [--prod] [--apply] [--off] <username>...');
  process.exit(1);
}

if (flag('--prod')) {
  const sa = JSON.parse(readFileSync('scripts/service-account.json', 'utf8'));
  initializeApp({ credential: cert(sa), projectId: PROJECT_ID });
} else {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8181';
  process.env.GCLOUD_PROJECT = PROJECT_ID;
  initializeApp({ projectId: PROJECT_ID });
}
const db = getFirestore();
const value = !flag('--off');
const apply = flag('--apply');

const profiles = (await db.collectionGroup('publicProfile').get()).docs;
let missing = 0;
for (const username of usernames) {
  const hits = profiles.filter(d => String(d.data().username ?? '').toLowerCase() === username);
  if (hits.length === 0) {
    console.log(`/${username}: no public profile found`);
    missing++;
    continue;
  }
  for (const doc of hits) {
    const d = doc.data();
    const label = `/${username} (${d.displayName || d.name || 'no name'}, ${doc.ref.path})`;
    console.log(`${label}: clubMember ${d.clubMember === true} -> ${value}${apply ? '' : '  [dry run]'}`);
    if (apply) await doc.ref.set({ clubMember: value }, { merge: true });
  }
}
if (!apply) console.log('\nDry run, nothing written. Add --apply to write.');
process.exit(missing > 0 && apply ? 1 : 0);
