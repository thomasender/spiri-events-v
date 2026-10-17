// Renders today's "Heute in <Bezirk>" story(ies) to local JPEGs. READ-ONLY: reads
// production events (scripts/service-account.json), posts and writes nothing.
//
//   npm --prefix functions run build
//   node scripts/instagram-story-preview.mjs [Bezirk] [outDir] [YYYY-MM-DD]   (default: Feldkirch, ./tmp-story, today)
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { expandOccurrencesInWindow } = require('../functions/lib/instagram/instagramOccurrences');
const {
  groupStories,
  buildStoryModel,
  storyPostId,
} = require('../functions/lib/instagram/instagramStory');
const { renderStoryImage } = require('../functions/lib/instagram/instagramImage');
const { viennaToday } = require('../functions/lib/instagram/instagramPublish');

const [bezirk = 'Feldkirch', outDir = 'tmp-story', dayArg] = process.argv.slice(2);
const sa = JSON.parse(readFileSync('scripts/service-account.json', 'utf8'));
initializeApp({ credential: cert(sa), projectId: 'spirieventsvbg' });
const db = getFirestore();

const day = dayArg ?? viennaToday(new Date());
const snap = await db.collection('events').where('status', '==', 'approved').get();
const events = snap.docs.flatMap((d) =>
  expandOccurrencesInWindow({ ...d.data(), id: d.id }, { start: day, end: day })
);
console.log(`${day}: ${events.length} approved occurrence(s) today, all Bezirke`);
for (const e of events) {
  console.log(
    `  ${e.time ?? '--:--'}  ${e.title}  [${e.bezirk}]  (consent: ${e.instagramConsent === true})`
  );
}

const groups = groupStories(events, day, bezirk);
if (groups.length === 0) {
  console.log(`Keine Story für ${bezirk}: keine Events mit Instagram-Einwilligung heute.`);
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });
for (const group of groups) {
  const file = `${outDir}/${storyPostId(bezirk, day, group.part)}.jpg`;
  writeFileSync(file, await renderStoryImage(buildStoryModel(group, day)));
  console.log('geschrieben:', file);
}
