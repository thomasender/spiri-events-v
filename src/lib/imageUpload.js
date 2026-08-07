/**
 * Image upload service using Firebase Storage
 * Images are stored at: events/{eventId}/{timestamp}_{filename}
 * Compressed client-side before upload for fast transfers
 */

import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

const LANDSCAPE_RATIO = 16 / 9;
const PORTRAIT_RATIO = 9 / 16;
const ASPECT_RATIO_TOLERANCE = 0.1;

const MAX_DIMENSION = 2000;
const TARGET_MAX_BYTES = 1.5 * 1024 * 1024;
const INITIAL_QUALITY = 0.85;
const MIN_QUALITY = 0.5;
const QUALITY_STEP = 0.05;

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

/**
 * Compress an image client-side to a target size while preserving maximum quality
 * @param {File|Blob} file - The image file
 * @returns {Promise<Blob>} - Compressed image blob
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    img.onload = () => {
      let { width, height } = img;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height / width) * MAX_DIMENSION);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width / height) * MAX_DIMENSION);
          height = MAX_DIMENSION;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      let quality = INITIAL_QUALITY;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);

      while (dataUrlToBlobSize(dataUrl) > TARGET_MAX_BYTES && quality > MIN_QUALITY) {
        quality -= QUALITY_STEP;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }

      const blob = dataUrlToBlob(dataUrl);
      URL.revokeObjectURL(img.src);
      resolve(blob);
    };
    img.src = URL.createObjectURL(file);
  });
}

function dataUrlToBlobSize(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
}

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',');
  const mimeMatch = meta.match(/data:(.*?);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeType });
}

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

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, compressedBlob, {
      contentType: 'image/jpeg',
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

  const compressedBlob = await compressImage(file);
  const safeName = sanitizeFilename(file.name);
  const filename = `${Date.now()}_${safeName}`;
  const photoRef = ref(storage, `users/${uid}/avatar/${filename}`);

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(photoRef, compressedBlob, {
      contentType: 'image/jpeg',
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

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(screenshotRef, compressedBlob, {
      contentType: 'image/jpeg',
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
