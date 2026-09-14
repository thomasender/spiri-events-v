const FIRESTORE_BASE =
  'http://127.0.0.1:8181/v1/projects/spirieventsvbg/databases/(default)/documents';

/**
 * Deletes every event whose title starts with `prefix`.
 *
 * The wizard specs create real events and used to leave them behind, so each
 * run added a few more pending events to the emulator. That is not just clutter:
 * it pushed the Review tab badge past its "9+" cap and made an unrelated
 * assertion fail. Specs that create events should clean up after themselves in
 * an `afterAll`.
 */
export async function deleteEventsByTitlePrefix(prefix: string): Promise<number> {
  const response = await fetch(`${FIRESTORE_BASE}/events?pageSize=500`, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (!response.ok) return 0;

  const payload = (await response.json()) as {
    documents?: Array<{ name: string; fields?: { title?: { stringValue?: string } } }>;
  };

  const doomed = (payload.documents ?? []).filter((doc) =>
    (doc.fields?.title?.stringValue ?? '').startsWith(prefix)
  );

  await Promise.all(
    doomed.map((doc) =>
      fetch(`${FIRESTORE_BASE}/events/${doc.name.split('/').pop()}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer owner' },
      }).catch(() => {})
    )
  );

  return doomed.length;
}
