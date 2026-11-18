/**
 * Copying an organizer's images into our storage AFTER they consented to it
 * (`scopes.images`, docs/event-import.md "Images"). Before that the preview
 * only hotlinks them from the organizer's own site.
 *
 * Same layout as an upload from the event form (src/lib/imageUpload.js):
 * `events/{eventId}/{ts}_import.jpg` (max 1600 px) and
 * `events/{eventId}/thumb_{ts}_import.webp` (max 720 px), public download URL
 * with a token, so eventStorageCleanup / purgeExpiredEvents remove them with
 * the event. The fetch/convert/upload steps are injected, so the flow is unit
 * tested; importConsentFunctions.ts wires fetch, sharp and the bucket.
 */
import { isImageUrlAllowed } from './eventImport';
import type { ImageCopyItem } from './importConsent';

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 10_000;

export interface ImageCopyDeps {
  now: () => number;
  /** GET without following redirects; throws on non-2xx, non-image or too large. */
  fetchImage: (url: string) => Promise<Buffer>;
  /** JPEG (max 1600 px) and WebP thumbnail (max 720 px); throws if it is no image. */
  convert: (data: Buffer) => Promise<{ full: Buffer; thumb: Buffer }>;
  /** Stores the object and returns its public download URL. */
  upload: (path: string, data: Buffer, contentType: string) => Promise<string>;
  updateEvent: (eventId: string, patch: Record<string, unknown>) => Promise<void>;
  log: (message: string, data: Record<string, unknown>) => void;
}

export function importImagePaths(eventId: string, nowMs: number): { full: string; thumb: string } {
  return {
    full: `events/${eventId}/${nowMs}_import.jpg`,
    thumb: `events/${eventId}/thumb_${nowMs}_import.webp`,
  };
}

/**
 * Copies each consented image and sets imageUrl / imageThumbUrl on the event.
 * Best effort: a failing image is logged and skipped (the event stays without
 * a picture, like before); it never throws. URLs that do not pass
 * isImageUrlAllowed (again checked here) are skipped.
 */
export async function copyConsentedImages(
  items: ImageCopyItem[],
  deps: ImageCopyDeps
): Promise<{ copied: number; failed: number }> {
  let copied = 0;
  let failed = 0;
  for (const item of items) {
    if (!isImageUrlAllowed(item.imageUrl, item.sourceUrl)) {
      failed += 1;
      deps.log('import image not allowed', { eventId: item.eventId });
      continue;
    }
    try {
      const original = await deps.fetchImage(item.imageUrl);
      const { full, thumb } = await deps.convert(original);
      const nowMs = deps.now();
      const paths = importImagePaths(item.eventId, nowMs);
      const imageUrl = await deps.upload(paths.full, full, 'image/jpeg');
      const imageThumbUrl = await deps.upload(paths.thumb, thumb, 'image/webp');
      await deps.updateEvent(item.eventId, {
        imageUrl,
        imageThumbUrl,
        // The organizer confirmed the rights in the consent (scopes.images).
        rightsConfirmed: true,
        rightsConfirmedAt: new Date(nowMs),
        'curation.imageSourceUrl': item.imageUrl,
        'curation.imageCopiedAt': new Date(nowMs),
      });
      copied += 1;
    } catch (err) {
      failed += 1;
      deps.log('import image copy failed', {
        eventId: item.eventId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { copied, failed };
}

/** Download URL of a Storage object with a download token (as the client SDK makes it). */
export function storageDownloadUrl(bucket: string, path: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}
