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

const AUTH_BASE = 'http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1';

/** Resolves a test account's uid from the Auth emulator. */
export async function uidForEmail(email: string): Promise<string> {
  const response = await fetch(
    `${AUTH_BASE}/projects/spirieventsvbg/accounts:query?key=fake-api-key`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
  const payload = (await response.json()) as {
    userInfo?: Array<{ localId: string; email: string }>;
  };
  const match = (payload.userInfo ?? []).find((u) => u.email === email);
  if (!match) throw new Error(`No Auth emulator user for ${email}`);
  return match.localId;
}

/**
 * Creates one approved event owned by `ownerEmail`, in-process via the
 * Firestore REST API — no `spawn('node', ...)`, so it costs milliseconds
 * rather than a shell fork plus a firebase-admin import.
 *
 * Use this instead of mutating a seeded event: the seeded fixtures are read
 * concurrently by other specs, and trashing or editing one makes them fail.
 */
export async function createApprovedEvent(opts: {
  id: string;
  title: string;
  ownerEmail: string;
  place?: string;
  category?: string;
  daysFromToday?: number;
}): Promise<void> {
  const uid = await uidForEmail(opts.ownerEmail);
  const date = new Date();
  date.setDate(date.getDate() + (opts.daysFromToday ?? 7));
  const iso = date.toISOString().split('T')[0];

  await fetch(`${FIRESTORE_BASE}/events/${opts.id}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        title: { stringValue: opts.title },
        description: { stringValue: `Fixture event for ${opts.title}.` },
        date: { stringValue: iso },
        time: { stringValue: '18:00' },
        place: { stringValue: opts.place ?? 'Fixture Place' },
        bezirk: { stringValue: 'Bregenz' },
        category: { stringValue: opts.category ?? 'Yoga' },
        status: { stringValue: 'approved' },
        createdBy: { stringValue: uid },
        contribution: { stringValue: 'free' },
      },
    }),
  });
}

export async function deleteEventById(id: string): Promise<void> {
  await fetch(`${FIRESTORE_BASE}/events/${id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' },
  }).catch(() => {});
}
