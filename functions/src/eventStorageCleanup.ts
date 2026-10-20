// Storage prefixes that hold an event's assets: cover image, thumbnail and any
// older uploads (events/{id}/), plus images embedded in the description.
export function eventStoragePrefixes(eventId: string): string[] {
  return [`events/${eventId}/`, `event-descriptions/${eventId}/`];
}

interface PrefixDeletable {
  deleteFiles(options: { prefix: string; force?: boolean }): Promise<unknown>;
}

/** Deletes every storage asset belonging to an event. Missing files are fine. */
export async function deleteEventAssets(bucket: PrefixDeletable, eventId: string): Promise<void> {
  for (const prefix of eventStoragePrefixes(eventId)) {
    await bucket.deleteFiles({ prefix, force: true });
  }
}
