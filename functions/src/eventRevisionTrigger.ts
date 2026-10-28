import { logger } from 'firebase-functions';
import { onDocumentUpdatedWithAuthContext } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { buildRevisionDraft } from './eventRevisions';
import {
  buildEditAlertFields,
  pickResponsibleStaff,
  shouldNotifyAdminsOfEdit,
} from './eventEditNotice';
import { parseStaffRole } from './staffRoles';

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

const millisOf = (value: unknown): number | null =>
  value && typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ? (value as { toMillis: () => number }).toMillis()
    : null;

/**
 * Who gets the alert: after a change request ("bitte ändere dein Event") only the
 * staff member who asked (pickResponsibleStaff), as long as they are still staff;
 * otherwise every Super-Admin, as before.
 */
async function alertRecipients(
  eventId: string,
  kind: NonNullable<ReturnType<typeof shouldNotifyAdminsOfEdit>>,
  after: Record<string, unknown>,
  actorUid: string | null
): Promise<string[]> {
  const db = getFirestore();
  const eventRef = db.collection('events').doc(eventId);
  const [messages, reverts] = await Promise.all([
    eventRef.collection('messages').get(),
    eventRef.collection('revisions').where('statusTo', '==', 'draft').get(),
  ]);
  const responsible = pickResponsibleStaff({
    kind,
    ownerUid: typeof after.createdBy === 'string' ? after.createdBy : null,
    messages: messages.docs.map((d) => ({
      authorRole: d.get('authorRole'),
      authorUid: d.get('authorUid'),
      atMs: millisOf(d.get('createdAt')),
    })),
    revisions: reverts.docs.map((d) => ({
      statusFrom: d.get('statusFrom'),
      statusTo: d.get('statusTo'),
      by: d.get('by'),
      atMs: millisOf(d.get('at')),
    })),
  });
  if (responsible) {
    if (responsible === actorUid) return [];
    const roleDoc = await db.doc(`admin_users/${responsible}`).get();
    if (parseStaffRole(roleDoc.data())) return [responsible];
  }
  const admins = await db.collection('admin_users').where('role', '==', 'Admin').get();
  return admins.docs.map((d) => d.id);
}

/**
 * In-app alert when an organizer edits a pending event (or sends it back in): for
 * the staff member who asked for the change, or every admin when nobody did. One
 * doc per event and recipient, so further edits raise the counter instead of
 * piling up. Never throws: a failed alert must not lose the revision.
 */
async function notifyAdminsOfEdit(
  eventId: string,
  triggerId: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  actor: { by: string | null; byRole: 'Admin' | 'User' | 'System'; byName: string | null },
  changes: Parameters<typeof shouldNotifyAdminsOfEdit>[3]
): Promise<void> {
  const kind = shouldNotifyAdminsOfEdit(before, after, actor.byRole, changes);
  if (!kind || !after) return;
  try {
    const db = getFirestore();
    const recipients = await alertRecipients(eventId, kind, after, actor.by);
    const changeCount = Object.keys(changes).length;
    const base = {
      eventId,
      eventTitle: typeof after.title === 'string' ? after.title : '',
      eventSlug: typeof after.slug === 'string' ? after.slug : '',
      ownerName: actor.byName ?? '',
    };
    await Promise.all(
      recipients.map((uid) =>
        db.runTransaction(async (tx) => {
          const ref = db.doc(`users/${uid}/adminAlerts/${eventId}`);
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
