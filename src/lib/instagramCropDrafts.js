// Unsaved Instagram crop edits of an open admin crop editor, per event id.
// Approving an event publishes its stored `instagramImage`, so the approval
// first writes a crop the reviewer adjusted but did not save explicitly.
const drafts = new Map();

/** Registers `flush` (writes the open editor's crop); returns the unregister function. */
export function registerInstagramCropDraft(eventId, flush) {
  if (!drafts.has(eventId)) drafts.set(eventId, new Set());
  drafts.get(eventId).add(flush);
  return () => {
    const set = drafts.get(eventId);
    if (!set) return;
    set.delete(flush);
    if (set.size === 0) drafts.delete(eventId);
  };
}

/** Saves every unsaved crop edit of the event (no-op without an open editor). */
export async function flushInstagramCropDrafts(eventId) {
  const set = drafts.get(eventId);
  if (!set) return;
  await Promise.all([...set].map((flush) => flush()));
}
