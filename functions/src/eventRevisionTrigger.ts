import { logger } from 'firebase-functions';
import { onDocumentUpdatedWithAuthContext } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { buildRevisionDraft } from './eventRevisions';
import { buildEditAlertFields, shouldNotifyAdminsOfEdit } from './eventEditNotice';

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
 * In-app alert for every admin when an organizer edits a pending event (or sends it
 * back in). One doc per event and admin, so further edits raise the counter instead
 * of piling up. Never throws: a failed alert must not lose the revision.
 */
async function notifyAdminsOfEdit(
  eventId: string,
  triggerId: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  actor: { byRole: 'Admin' | 'User' | 'System'; byName: string | null },
  changes: Parameters<typeof shouldNotifyAdminsOfEdit>[3]
): Promise<void> {
  const kind = shouldNotifyAdminsOfEdit(before, after, actor.byRole, changes);
  if (!kind || !after) return;
  try {
    const db = getFirestore();
    const admins = await db.collection('admin_users').where('role', '==', 'Admin').get();
    const changeCount = Object.keys(changes).length;
    const base = {
      eventId,
      eventTitle: typeof after.title === 'string' ? after.title : '',
      eventSlug: typeof after.slug === 'string' ? after.slug : '',
      ownerName: actor.byName ?? '',
    };
    await Promise.all(
      admins.docs.map((admin) =>
        db.runTransaction(async (tx) => {
          const ref = db.doc(`users/${admin.id}/adminAlerts/${eventId}`);
          const fields = buildEditAlertFields((await tx.get(ref)).data(), {
            triggerId,
            kind,
            changeCount,
          });
          if (fields) tx.set(ref, { ...base, ...fields, at: FieldValue.serverTimestamp() });
        })
      )
    );
  } catch (err) {
    logger.error('Failed to write admin edit alerts', { eventId, err });
  }
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
      await notifyAdminsOfEdit(event.params.eventId, event.id, before, after, actor, draft.changes);
    } catch (err) {
      logger.error('Failed to write event revision', { eventId: event.params.eventId, err });
    }
  }
);
