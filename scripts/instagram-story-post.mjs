// LIVE test post of the "Heute in <Bezirk>" story to the real Instagram account.
// Reads events from production, uploads the image to Storage, posts via Graph API.
// Nothing is written to instagram_posts and no admin mail is sent (local test).
//
//   npm --prefix functions run build
//   IG_ACCESS_TOKEN=... IG_USER_ID=... node scripts/instagram-story-post.mjs <Bezirk> [YYYY-MM-DD]
//
// The token only comes from the environment and is never printed.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const require = createRequire(import.meta.url);
const { expandOccurrencesInWindow } = require('../functions/lib/instagram/instagramOccurrences');
const { normalizeInstagramHandle } = require('../functions/lib/instagram/instagramContent');
const { runDailyStory } = require('../functions/lib/instagram/instagramStory');
const {
  renderStoryImage,
  uploadInstagramImage,
} = require('../functions/lib/instagram/instagramImage');

const [bezirk, dayArg] = process.argv.slice(2);
const { IG_ACCESS_TOKEN: accessToken, IG_USER_ID: userId } = process.env;
if (!bezirk || !accessToken || !userId) {
  console.error(
    'Usage: IG_ACCESS_TOKEN=... IG_USER_ID=... node scripts/instagram-story-post.mjs <Bezirk> [YYYY-MM-DD]'
  );
  process.exit(1);
}

const sa = JSON.parse(readFileSync('scripts/service-account.json', 'utf8'));
initializeApp({
  credential: cert(sa),
  projectId: 'spirieventsvbg',
  storageBucket: 'spirieventsvbg.firebasestorage.app',
});
const db = getFirestore();
const bucket = getStorage().bucket();

// Pretend it is noon on the given day so "heute" resolves to that day.
const now = () => new Date(`${dayArg ?? new Date().toISOString().slice(0, 10)}T10:00:00Z`);
const posts = new Map();

const outcome = await runDailyStory(
  {
    fetch,
    accessToken,
    userId,
    now,
    isEnabled: async () => (await db.doc('app_settings/instagram').get()).get('enabled') === true,
    async listEvents(window) {
      const snap = await db.collection('events').where('status', '==', 'approved').get();
      return snap.docs.flatMap((d) => expandOccurrencesInWindow({ ...d.data(), id: d.id }, window));
    },
    async getOrganizerHandle(ev) {
      const override = normalizeInstagramHandle(ev.instagramHandleOverride);
      if (override) return override;
      if (typeof ev.createdBy !== 'string' || !ev.createdBy) return null;
      const snap = await db.doc(`users/${ev.createdBy}`).get();
      return normalizeInstagramHandle(snap.get('socialMedia.instagram'));
    },
    async createPost(id, record) {
      if (posts.has(id)) return false;
      posts.set(id, record);
      return true;
    },
    async updatePost(id, patch) {
      posts.set(id, { ...posts.get(id), ...patch });
    },
    async generateStoryImage(name, model) {
      return uploadInstagramImage(bucket, `test_${name}`, await renderStoryImage(model));
    },
    notifyAdmins: async (subject, text) => console.error('FEHLER:', subject, '\n', text),
    log: (message, data) => console.log(message, data ?? ''),
  },
  bezirk
);
console.log(JSON.stringify(outcome, null, 2));
for (const [id, rec] of posts) {
  console.log(id, rec.status, rec.permalink ?? '', rec.error ?? '');
}
