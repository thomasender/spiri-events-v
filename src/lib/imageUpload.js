/**
 * Image upload service using Firebase Storage
 * Images are stored at: events/{eventId}/{timestamp}_{filename}
 * Compressed client-side before upload for fast transfers. Event covers get a
 * small WebP thumbnail (events/{eventId}/thumb_{timestamp}_{filename}) for tiles.
 */

import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

const LANDSCAPE_RATIO = 16 / 9;
const PORTRAIT_RATIO = 9 / 16;
const ASPECT_RATIO_TOLERANCE = 0.1;

// Full-size images (event cover, description images, screenshots). 1600 px is
// enough for a full-width hero on a 3x phone and for retina desktop layouts.
const MAX_DIMENSION = 1600;
const TARGET_MAX_BYTES = 1.5 * 1024 * 1024;
const INITIAL_QUALITY = 0.85;
const MIN_QUALITY = 0.5;
const QUALITY_STEP = 0.05;

// Avatars are shown at <= ~240 px (3x => 720). Anything larger is wasted bytes.
const AVATAR_MAX_DIMENSION = 720;
const AVATAR_MAX_BYTES = 250 * 1024;

// Thumbnails for the list/calendar/directory tiles (tile ~350 px wide at 2x).
const THUMB_MAX_DIMENSION = 720;
const THUMB_MAX_BYTES = 90 * 1024;
const THUMB_PREFIX = 'thumb_';

// Uploaded objects get a unique timestamped name and are never overwritten, so
// browsers and the CDN may keep them for a year.
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export const MAX_INPUT_SIZE_BYTES = 15 * 1024 * 1024;
export const TARGET_COMPRESSED_BYTES = TARGET_MAX_BYTES;

export async function getImageDimensions(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = URL.createObjectURL(file);
  });
}

export function validateAspectRatio(width, height) {
  return true;
}

export function getAspectRatioRecommendation(width, height) {
  if (width === 0 || height === 0) return { isRecommended: true, ratio: null };
  const ratio = width / height;
  const landscapeMin = LANDSCAPE_RATIO * (1 - ASPECT_RATIO_TOLERANCE);
  const landscapeMax = LANDSCAPE_RATIO * (1 + ASPECT_RATIO_TOLERANCE);
  const portraitMin = PORTRAIT_RATIO * (1 - ASPECT_RATIO_TOLERANCE);
  const portraitMax = PORTRAIT_RATIO * (1 + ASPECT_RATIO_TOLERANCE);
  const isLandscape = ratio >= landscapeMin && ratio <= landscapeMax;
  const isPortrait = ratio >= portraitMin && ratio <= portraitMax;
  return { isRecommended: isLandscape || isPortrait, ratio: width / height };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bild konnte nicht geladen werden'));
    };
    img.src = url;
  });
}

function fitWithin(width, height, maxDimension) {
  if (width <= maxDimension && height <= maxDimension) return { width, height };
  if (width > height) {
    return { width: maxDimension, height: Math.round((height / width) * maxDimension) };
  }
  return { width: Math.round((width / height) * maxDimension), height: maxDimension };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Draw the image scaled to fit `maxDimension` and encode it, lowering the
 * quality until it is at most `maxBytes` (or `minQuality` is reached).
 * Falls back to JPEG when the browser cannot encode `type` (Safari has no
 * WebP encoder and silently returns PNG instead).
 */
async function renderToBlob(img, { maxDimension, maxBytes, type = 'image/jpeg', startQuality }) {
  const { width, height } = fitWithin(img.width, img.height, maxDimension);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // JPEG/WebP-with-alpha would otherwise turn transparent PNG areas black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let quality = startQuality ?? INITIAL_QUALITY;
  let blob = await canvasToBlob(canvas, type, quality);
  if (!blob || blob.type !== type) {
    type = 'image/jpeg';
    blob = await canvasToBlob(canvas, type, quality);
  }
  while (blob && blob.size > maxBytes && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP);
    blob = await canvasToBlob(canvas, type, quality);
  }
  if (!blob) throw new Error('Bild konnte nicht komprimiert werden');
  return blob;
}

/**
 * Compress an image client-side to a target size while preserving maximum quality
 * @param {File|Blob} file - The image file
 * @param {Object} [options]
 * @param {number} [options.maxDimension] - Longest edge in px
 * @param {number} [options.maxBytes] - Size budget in bytes
 * @returns {Promise<Blob>} - Compressed JPEG blob
 */
export async function compressImage(
  file,
  { maxDimension = MAX_DIMENSION, maxBytes = TARGET_MAX_BYTES } = {}
) {
  const img = await loadImage(file);
  return renderToBlob(img, { maxDimension, maxBytes });
}

const AVATAR_OPTIONS = { maxDimension: AVATAR_MAX_DIMENSION, maxBytes: AVATAR_MAX_BYTES };

/**
 * Extract the storage path from a Firebase Storage download URL.
 * Returns null if URL is not a Firebase Storage URL.
 * @param {string} url
 * @returns {string|null}
 */
export function getStoragePathFromUrl(url) {
  if (!url) return null;
  const match = url.match(
    /^https?:\/\/firebasestorage\.googleapis\.com\/v\d+\/b\/[^/]+\/o\/([^?]+)/
  );
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Delete an image from Firebase Storage by its download URL.
 * Silently no-ops if the URL is not a Firebase Storage URL or the file does not exist.
 * @param {string} downloadUrl
 * @returns {Promise<void>}
 */
export async function deleteImageByUrl(downloadUrl) {
  const path = getStoragePathFromUrl(downloadUrl);
  if (!path) return;
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (err) {
    if (err?.code !== 'storage/object-not-found') {
      console.warn('Failed to delete image from storage:', err);
    }
  }
}

function sanitizeFilename(name) {
  return (name || 'image')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

/**
 * Upload an image file to Firebase Storage.
 * Compresses the image client-side before upload.
 * @param {File} file - The image file to upload
 * @param {Object} [options]
 * @param {string} [options.eventId] - Event ID to scope the upload path
 * @param {(progress: number) => void} [options.onProgress] - Progress callback (0-100)
 * @returns {Promise<string>} - Download URL of the uploaded image
 */
export async function uploadImage(file, options = {}) {
  const { eventId = 'temp', onProgress } = options;

  const compressedBlob = await compressImage(file);
  const safeName = sanitizeFilename(file.name);
  const filename = `${Date.now()}_${safeName}`;
  const storageRef = ref(storage, `events/${eventId}/${filename}`);

  return uploadCompressedBlob(compressedBlob, storageRef, onProgress);
}

/**
 * Upload an event cover image plus a small thumbnail for list tiles.
 * The thumbnail sits next to the original as events/{eventId}/thumb_{filename}
 * (same storage rule as the original). A failing thumbnail never fails the
 * upload: `thumbUrl` is then null and tiles fall back to the full image.
 * @param {File} file - The image file to upload
 * @param {Object} [options]
 * @param {string} [options.eventId] - Event ID to scope the upload path
 * @param {(progress: number) => void} [options.onProgress] - Progress callback (0-100)
 * @returns {Promise<{url: string, thumbUrl: string|null}>}
 */
export async function uploadEventCover(file, options = {}) {
  const { eventId = 'temp', onProgress } = options;

  const img = await loadImage(file);
  const compressedBlob = await renderToBlob(img, {
    maxDimension: MAX_DIMENSION,
    maxBytes: TARGET_MAX_BYTES,
  });
  const filename = `${Date.now()}_${sanitizeFilename(file.name)}`;
  const url = await uploadCompressedBlob(
    compressedBlob,
    ref(storage, `events/${eventId}/${filename}`),
    onProgress
  );

  let thumbUrl = null;
  try {
    const thumbBlob = await renderToBlob(img, {
      maxDimension: THUMB_MAX_DIMENSION,
      maxBytes: THUMB_MAX_BYTES,
      type: 'image/webp',
      startQuality: 0.8,
    });
    thumbUrl = await uploadCompressedBlob(
      thumbBlob,
      ref(storage, `events/${eventId}/${THUMB_PREFIX}${filename}`)
    );
  } catch (err) {
    console.warn('Thumbnail upload failed, tiles will use the full image:', err);
  }
  return { url, thumbUrl };
}

/**
 * Upload a profile photo to Firebase Storage under users/{uid}/avatar/.
 * Compresses the image client-side before upload.
 * @param {File} file - The image file to upload
 * @param {string} uid - The user ID that owns the profile
 * @param {Object} [options]
 * @param {(progress: number) => void} [options.onProgress] - Progress callback (0-100)
 * @returns {Promise<string>} - Download URL of the uploaded image
 */
export async function uploadProfileImage(file, uid, options = {}) {
  if (!uid) throw new Error('User ID is required for profile image upload');
  const { onProgress } = options;

  const compressedBlob = await compressImage(file, AVATAR_OPTIONS);
  const safeName = sanitizeFilename(file.name);
  const filename = `${Date.now()}_${safeName}`;
  const photoRef = ref(storage, `users/${uid}/avatar/${filename}`);

  return uploadCompressedBlob(compressedBlob, photoRef, onProgress);
}

/**
 * Upload a helper portrait to Firebase Storage under helpers/photos/.
 * Compresses the image client-side before upload.
 * @param {File} file - The image file to upload
 * @param {Object} [options]
 * @param {(progress: number) => void} [options.onProgress] - Progress callback (0-100)
 * @returns {Promise<string>} - Download URL of the uploaded image
 */
export async function uploadHelperImage(file, options = {}) {
  const { onProgress } = options;

  const compressedBlob = await compressImage(file, AVATAR_OPTIONS);
  const safeName = sanitizeFilename(file.name);
  const filename = `${Date.now()}_${safeName}`;
  const helperImageRef = ref(storage, `helpers/photos/${filename}`);

  return uploadCompressedBlob(compressedBlob, helperImageRef, onProgress);
}

/**
 * Upload a feedback screenshot to Firebase Storage under feedback/{feedbackId}/.
 * Compresses the image client-side before upload.
 * @param {File} file - The screenshot file to upload
 * @param {string} feedbackId - The feedback ID used to scope the storage path
 * @param {Object} [options]
 * @param {(progress: number) => void} [options.onProgress] - Progress callback (0-100)
 * @returns {Promise<string>} - Download URL of the uploaded screenshot
 */
export async function uploadFeedbackScreenshot(file, feedbackId, options = {}) {
  if (!feedbackId) throw new Error('Feedback ID is required for screenshot upload');
  const { onProgress } = options;

  const compressedBlob = await compressImage(file);
  const safeName = sanitizeFilename(file.name);
  const filename = `${Date.now()}_${safeName}`;
  const screenshotRef = ref(storage, `feedback/${feedbackId}/${filename}`);

  return uploadCompressedBlob(compressedBlob, screenshotRef, onProgress);
}

/**
 * Upload an image embedded inside an event description (richtext).
 * Stored under event-descriptions/{eventId}/ so it can be served from the same
 * public-readable bucket as the title image, and orphaned uploads from
 * unpublished drafts accumulate harmlessly in the 'temp' prefix.
 * Compresses the image client-side before upload.
 * @param {File} file - The image file to upload
 * @param {string} [eventId] - Event ID; defaults to 'temp' for unsaved drafts
 * @param {Object} [options]
 * @param {(progress: number) => void} [options.onProgress] - Progress callback (0-100)
 * @returns {Promise<string>} - Download URL of the uploaded image
 */
export async function uploadDescriptionImage(file, eventId = 'temp', options = {}) {
  const { onProgress } = options;

  const compressedBlob = await compressImage(file);
  const safeName = sanitizeFilename(file.name);
  const filename = `${Date.now()}_${safeName}`;
  const descriptionRef = ref(storage, `event-descriptions/${eventId}/${filename}`);

  return uploadCompressedBlob(compressedBlob, descriptionRef, onProgress);
}

/**
 * Upload an image embedded inside a profile bio (richtext).
 * Stored under users/{uid}/bio/ so it lives alongside the user's avatar
 * (also under users/{uid}/) but is clearly scoped to bio content. Falls back
 * to a 'temp' prefix for users not yet signed in — orphaned uploads there
 * accumulate harmlessly and the bucket is GC'd separately.
 * Compresses the image client-side before upload.
 * @param {File} file - The image file to upload
 * @param {string} [uid] - User ID; defaults to 'temp' for unsaved profile drafts
 * @param {Object} [options]
 * @param {(progress: number) => void} [options.onProgress] - Progress callback (0-100)
 * @returns {Promise<string>} - Download URL of the uploaded image
 */
export async function uploadProfileDescriptionImage(file, uid = 'temp', options = {}) {
  const { onProgress } = options;

  const compressedBlob = await compressImage(file);
  const safeName = sanitizeFilename(file.name);
  const filename = `${Date.now()}_${safeName}`;
  const bioImageRef = ref(storage, `users/${uid}/bio/${filename}`);

  return uploadCompressedBlob(compressedBlob, bioImageRef, onProgress);
}

function uploadCompressedBlob(blob, storageRef, onProgress) {
  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, blob, {
      contentType: blob.type || 'image/jpeg',
      cacheControl: IMMUTABLE_CACHE_CONTROL,
    });

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes > 0) {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(pct);
        }
      },
      (error) => reject(error),
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          if (onProgress) onProgress(100);
          resolve(downloadUrl);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}
