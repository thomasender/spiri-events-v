import { DEFAULT_FOCAL_POINT, normalizeFocalPoint } from '../lib/eventImage';

export const INSTAGRAM_CROP_ASPECT = 4 / 5;
export const MIN_INSTAGRAM_ZOOM = 1;
export const MAX_INSTAGRAM_ZOOM = 3;

/** Marker for "the event's cover photo", whose final URL exists only after upload. */
export const COVER_SOURCE = 'cover';

function isWebUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/** All distinct http(s) image URLs embedded in the rich-text description, in order. */
export function extractDescriptionImageUrls(html) {
  if (typeof html !== 'string' || !html.includes('<img')) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const urls = [...doc.querySelectorAll('img[src]')]
    .map((img) => img.getAttribute('src').trim())
    .filter(isWebUrl);
  return [...new Set(urls)];
}

/**
 * Images the organizer can pick for the Instagram post: the cover photo first
 * (previewed from its local blob URL), then the description images.
 */
export function buildInstagramImageCandidates({ coverPreview, description }) {
  const candidates = [];
  if (coverPreview) {
    candidates.push({ source: COVER_SOURCE, previewUrl: coverPreview, label: 'Titelbild' });
  }
  extractDescriptionImageUrls(description).forEach((url, i) => {
    candidates.push({ source: url, previewUrl: url, label: `Bild ${i + 1} aus der Beschreibung` });
  });
  return candidates;
}

export function clampInstagramZoom(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return MIN_INSTAGRAM_ZOOM;
  return Math.min(MAX_INSTAGRAM_ZOOM, Math.max(MIN_INSTAGRAM_ZOOM, n));
}

/**
 * The `instagramImage` field stored on the event: the picked image's final URL
 * plus focal point and zoom. null when there is nothing to store (no image, or
 * the cover was picked but not uploaded), so the post falls back to the
 * automatic image.
 */
export function resolveInstagramImage(choice, { coverUrl } = {}) {
  if (!choice || !choice.source) return null;
  const url = choice.source === COVER_SOURCE ? coverUrl : choice.source;
  if (!isWebUrl(url)) return null;
  return {
    url: url.trim(),
    focalPoint: normalizeFocalPoint(choice.focalPoint) ?? { ...DEFAULT_FOCAL_POINT },
    zoom: clampInstagramZoom(choice.zoom),
  };
}
