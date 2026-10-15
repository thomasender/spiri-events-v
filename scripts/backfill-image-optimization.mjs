#!/usr/bin/env node
/**
 * One-off backfill for images uploaded before client-side thumbnails existed.
 *
 *   node scripts/backfill-image-optimization.mjs [projectId]            # dry run
 *   node scripts/backfill-image-optimization.mjs [projectId] --apply    # write
 *
 * Credentials: scripts/service-account.json if present (what the GitHub
 * workflow "Backfill image optimization" writes from the repo secret),
 * otherwise Application Default Credentials (`gcloud auth application-default
 * login`). Normally run via that workflow: Actions tab -> Run workflow.
 * Safe to re-run: every step skips what is already optimised.
 *
 *  1. Events: creates events/{id}/thumb_{name} (720 px WebP) for each cover
 *     and stores its URL in `imageThumbUrl`.
 *  2. Event covers, avatars (users/{uid}/avatar/*) and helper photos
 *     (helpers/photos/*): if larger than the new limits (1600 px / 720 px),
 *     the object is re-encoded IN PLACE, keeping path and download token so
 *     every URL stored in Firestore stays valid.
 *  3. Sets `Cache-Control: public, max-age=31536000, immutable` on all of them.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import admin from 'firebase-admin';
import sharp from 'sharp';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const projectId = args.find((a) => !a.startsWith('--')) || 'spirieventsvbg';

const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const COVER_MAX = 1600;
const AVATAR_MAX = 720;
const THUMB_MAX = 720;

const SERVICE_ACCOUNT_PATH = 'scripts/service-account.json';
admin.initializeApp({
  projectId,
  storageBucket: `${projectId}.firebasestorage.app`,
  ...(existsSync(SERVICE_ACCOUNT_PATH) && {
    credential: admin.credential.cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))),
  }),
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

const stats = { thumbs: 0, resized: 0, cacheHeaders: 0, savedBytes: 0, errors: 0 };

function pathFromUrl(url) {
  const m = typeof url === 'string' && url.match(/\/o\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function downloadUrl(path, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

async function tokenOf(file) {
  const [meta] = await file.getMetadata();
  const existing = meta.metadata?.firebaseStorageDownloadTokens?.split(',')[0];
  return { token: existing || randomUUID(), meta };
}

/** Re-encode in place (same path + token) when larger than maxDimension. */
async function shrinkInPlace(path, maxDimension) {
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) return;
  const { token, meta } = await tokenOf(file);
  const [buf] = await file.download();
  const img = sharp(buf, { failOn: 'none' }).rotate();
  const { width = 0, height = 0 } = await img.metadata();
  const needsResize = Math.max(width, height) > maxDimension;
  if (needsResize) {
    const out = await img
      .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    if (out.length < buf.length) {
      console.log(`  resize ${path}: ${width}x${height}, ${buf.length} -> ${out.length} bytes`);
      stats.resized++;
      stats.savedBytes += buf.length - out.length;
      if (apply) {
        await file.save(out, {
          resumable: false,
          metadata: {
            contentType: 'image/jpeg',
            cacheControl: CACHE_CONTROL,
            metadata: { firebaseStorageDownloadTokens: token },
          },
        });
      }
      return;
    }
  }
  if (meta.cacheControl !== CACHE_CONTROL) {
    stats.cacheHeaders++;
    if (apply) await file.setMetadata({ cacheControl: CACHE_CONTROL });
  }
}

async function createThumbnail(eventId, coverPath) {
  const dir = coverPath.slice(0, coverPath.lastIndexOf('/') + 1);
  const name = coverPath.slice(dir.length);
  const thumbPath = `${dir}thumb_${name}`;
  const [buf] = await bucket.file(coverPath).download();
  const out = await sharp(buf, { failOn: 'none' })
    .rotate()
    .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
  console.log(`  thumb ${thumbPath}: ${buf.length} -> ${out.length} bytes`);
  stats.thumbs++;
  if (!apply) return null;
  const token = randomUUID();
  await bucket.file(thumbPath).save(out, {
    resumable: false,
    metadata: {
      contentType: 'image/webp',
      cacheControl: CACHE_CONTROL,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return downloadUrl(thumbPath, token);
}

async function run(label, fn) {
  try {
    await fn();
  } catch (err) {
    stats.errors++;
    console.warn(`  ! ${label}: ${err.message}`);
  }
}

console.log(`${apply ? 'APPLYING' : 'DRY RUN'} on ${projectId}\n`);

console.log('Event covers…');
const events = await db.collection('events').get();
for (const doc of events.docs) {
  const { imageUrl, imageThumbUrl } = doc.data();
  const path = pathFromUrl(imageUrl);
  if (!path) continue;
  await run(doc.id, async () => {
    await shrinkInPlace(path, COVER_MAX);
    if (!imageThumbUrl) {
      const url = await createThumbnail(doc.id, path);
      if (url) await doc.ref.update({ imageThumbUrl: url });
    }
  });
}

console.log('Avatars…');
const users = await db.collection('users').get();
for (const doc of users.docs) {
  const path = pathFromUrl(doc.data().photoURL);
  if (path) await run(doc.id, () => shrinkInPlace(path, AVATAR_MAX));
}

console.log('Helper photos…');
const [helperFiles] = await bucket.getFiles({ prefix: 'helpers/photos/' });
for (const f of helperFiles) {
  if (/\.(jpe?g|png|webp)$/i.test(f.name)) await run(f.name, () => shrinkInPlace(f.name, AVATAR_MAX));
}

console.log(
  `\nThumbnails: ${stats.thumbs}, resized: ${stats.resized}, cache headers set: ${stats.cacheHeaders}, ` +
    `saved ~${(stats.savedBytes / 1024 / 1024).toFixed(1)} MB, errors: ${stats.errors}`
);
if (!apply) console.log('Dry run – nothing was written. Re-run with --apply.');
