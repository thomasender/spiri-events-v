import { logger } from 'firebase-functions';
import { onDocumentUpdatedWithAuthContext } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { buildRevisionDraft } from './eventRevisions';

if (getApps().length === 0) {
  initializeApp();
}

const REGION = 'europe-west3';

async function resolveActor(
  uid: string | undefined
): Promise<{ by: string | null; byRole: 'Admin' | 'User' | 'System'; byName: string | null }> {
  if (!uid) return { by: null, byRole: 'System', byName: null };
  const db = getFirestore();
  const [adminSnap, userRecord] = await Promise.all([
    db.doc(`admin_users/${uid}`).get(),
    getAuth()
      .getUser(uid)
      .catch(() => null),
  ]);
  return {
    by: uid,
    byRole: adminSnap.exists && adminSnap.data()?.role === 'Admin' ? 'Admin' : 'User',
    byName: userRecord?.displayName || userRecord?.email || null,
  };
}

/**
 * Writes one revision (field diff + status transition) to
 * events/{id}/revisions whenever an event changes. Written server-side so the
 * history cannot be skipped or forged by the client; only admins can read it.
 */
export const onEventUpdatedWriteRevision = onDocumentUpdatedWithAuthContext(
  { region: REGION, document: 'events/{eventId}' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const draft = buildRevisionDraft(before, after);
    if (!draft) return;

    try {
      const actor = await resolveActor(
        event.authType === 'unauthenticated' ? undefined : event.authId
      );
      await getFirestore()
        .collection('events')
        .doc(event.params.eventId)
        .collection('revisions')
        .add({ at: FieldValue.serverTimestamp(), ...actor, ...draft });
    } catch (err) {
      logger.error('Failed to write event revision', { eventId: event.params.eventId, err });
    }
  }
);
