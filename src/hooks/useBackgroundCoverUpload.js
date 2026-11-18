import { useCallback, useEffect, useRef } from 'react';
import { uploadEventCover, deleteImageByUrl, CoverUploadError } from '../lib/imageUpload';

// Uploads the Titelbild in the background as soon as it is picked, without any
// visible UI, so saving the event later only has to wait for what is left
// (Trello 7iDvAj4U). The event is still never written without a finished
// upload: the forms call `awaitCover` before the write, which waits for the
// running upload, or starts it again if it failed / belongs to another photo.
//
// A replaced or removed photo's upload is deleted from Storage once it is done.
// An upload whose form is abandoned (tab closed, navigated away) stays in
// events/{id}/ without an event, like any other unsaved upload.
//
// `file`: the picked photo (null = none); `enabled`: only signed-in people may
// upload (guests in the wizard); `getEventId()`: the event id to upload to.
function startUpload(file, eventId) {
  const entry = { file, eventId, progress: 0, listener: null, failed: false, saved: false };
  entry.promise = uploadEventCover(file, {
    eventId,
    onProgress: (p) => {
      entry.progress = p;
      entry.listener?.(p);
    },
  });
  entry.promise.catch((err) => {
    entry.failed = true;
    console.warn('Background cover upload failed:', err);
  });
  return entry;
}

// The upload of a photo that is no longer chosen: remove it once it is done.
function discardUpload(entry) {
  if (!entry || entry.saved) return;
  entry.promise.then(
    ({ url, thumbUrl }) => {
      deleteImageByUrl(url);
      if (thumbUrl) deleteImageByUrl(thumbUrl);
    },
    () => {}
  );
}

async function waitForUpload(entry, onProgress) {
  entry.listener = onProgress ?? null;
  onProgress?.(entry.progress);
  try {
    return await entry.promise;
  } catch (err) {
    console.error('Image upload failed:', err);
    throw new CoverUploadError(err);
  } finally {
    entry.listener = null;
  }
}

export function useBackgroundCoverUpload({ file, enabled, getEventId }) {
  const currentRef = useRef(null);

  // getEventId is a new function on every render; the early return keeps it
  // from starting anything twice for the same photo.
  useEffect(() => {
    const cur = currentRef.current;
    if (!file) {
      currentRef.current = null;
      discardUpload(cur);
      return;
    }
    if (!enabled || cur?.file === file) return;
    currentRef.current = startUpload(file, getEventId());
    discardUpload(cur);
  }, [file, enabled, getEventId]);

  /**
   * The finished upload of `f` to events/{eventId}/: waits for the running
   * one, or (re)starts it if there is none for this photo or it failed.
   * Throws CoverUploadError when the upload fails.
   */
  const awaitCover = useCallback((f, eventId, onProgress) => {
    let entry = currentRef.current;
    if (!entry || entry.file !== f || entry.eventId !== eventId || entry.failed) {
      if (entry && !entry.failed) discardUpload(entry);
      entry = startUpload(f, eventId);
      currentRef.current = entry;
    }
    return waitForUpload(entry, onProgress);
  }, []);

  // Call once the event was written with the upload: it is in use now and
  // must not be deleted when the form later clears or replaces the photo.
  const markCoverSaved = useCallback(() => {
    if (currentRef.current) currentRef.current.saved = true;
  }, []);

  return { awaitCover, markCoverSaved };
}
