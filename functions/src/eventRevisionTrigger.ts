import { logger } from 'firebase-functions';
import {
  onDocumentCreatedWithAuthContext,
  onDocumentDeletedWithAuthContext,
  onDocumentUpdatedWithAuthContext,
} from 'firebase-functions/v2/firestore';
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
import {
  MODERATION_LOG_COLLECTION,
  actorRoleFromStaffDoc,
  buildModerationLogEntry,
  classifyModerationAction,
  type LogActor,
} from './moderationLog';

if (getApps().length === 0) {
  initializeApp();
}

const REGION = 'europe-west3';

interface Actor {
  by: string | null;
  byRole: 'Admin' | 'User' | 'System';
  byName: string | null;
  /** Role for the moderation log (names Regions-Moderator:innen as such). */
  logRole: LogActor['role'];
}

async function resolveActor(uid: string | undefined): Promise<Actor> {
  if (!uid) return { by: null, byRole: 'System', byName: null, logRole: 'System' };
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
    logRole: actorRoleFromStaffDoc(uid, adminSnap.data()),
  };
}

/**
 * The person behind a change, for the moderation log. Admin SDK jobs and
 * scripts (service_account / system, e.g. the daily purge) and unauthenticated
 * writes are "System". Client writes of signed-in users carry their uid in
 * authId (the revision has always read it that way).
 */
const SYSTEM_AUTH_TYPES = new Set(['service_account', 'system', 'unauthenticated']);
function actorUidOf(event: { authType: string; authId?: string }): string | undefined {
  return SYSTEM_AUTH_TYPES.has(event.authType) ? undefined : event.authId || undefined;
}

const SYSTEM_ACTOR: LogActor = { uid: null, name: null, role: 'System' };

const logActorOf = (actor: Actor): LogActor => ({
  uid: actor.by,
  name: actor.byName,
  role: actor.logRole,
});

/**
 * Appends one entry to moderation_log (Super-Admin tab "Protokoll"). Never
 * throws: a failed log entry must not break the revision or the alerts.
 * `docId` = the revision's id on updates, so the backfill script and the
 * trigger never write the same change twice.
 */
async function writeModerationLog(
  docId: string | null,
  entry: ReturnType<typeof buildModerationLogEntry>
): Promise<void> {
  if (!entry) return;
  try {
    const col = getFirestore().collection(MODERATION_LOG_COLLECTION);
    const ref = docId ? col.doc(docId) : col.doc();
    await ref.set({ at: FieldValue.serverTimestamp(), ...entry });
  } catch (err) {
    logger.error('Failed to write moderation log entry', { eventId: entry.eventId, err });
  }
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
  actor: Actor,
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
 * Moderation-relevant changes also go to moderation_log (same doc id).
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
      const revisionRef = getFirestore()
        .collection('events')
        .doc(event.params.eventId)
        .collection('revisions')
        .doc();
      const { by, byRole, byName } = actor;
      await revisionRef.set({ at: FieldValue.serverTimestamp(), by, byRole, byName, ...draft });
      await writeModerationLog(
        revisionRef.id,
        buildModerationLogEntry({
          kind: 'update',
          eventId: event.params.eventId,
          before,
          after,
          changedFields: Object.keys(draft.changes),
          actor: actorUidOf(event) ? logActorOf(actor) : SYSTEM_ACTOR,
        })
      );
      await notifyAdminsOfEdit(event.params.eventId, event.id, before, after, actor, draft.changes);
    } catch (err) {
      logger.error('Failed to write event revision', { eventId: event.params.eventId, err });
    }
  }
);

/** Events submitted or approved right away (no update, so no revision). */
export const onEventCreatedWriteModerationLog = onDocumentCreatedWithAuthContext(
  { region: REGION, document: 'events/{eventId}' },
  async (event) => {
    const after = event.data?.data();
    if (!classifyModerationAction({ kind: 'create', after })) return;
    const actor = await resolveActor(actorUidOf(event));
    await writeModerationLog(
      null,
      buildModerationLogEntry({
        kind: 'create',
        eventId: event.params.eventId,
        after,
        actor: logActorOf(actor),
      })
    );
  }
);

/**
 * Permanent deletes (Papierkorb "endgültig löschen", organizer delete,
 * the daily purge of expired events as "System"). The event's own history is
 * gone with it, the log entry stays.
 */
export const onEventDeletedWriteModerationLog = onDocumentDeletedWithAuthContext(
  { region: REGION, document: 'events/{eventId}' },
  async (event) => {
    const before = event.data?.data();
    if (!before) return;
    const actor = await resolveActor(actorUidOf(event));
    await writeModerationLog(
      null,
      buildModerationLogEntry({
        kind: 'delete',
        eventId: event.params.eventId,
        before,
        actor: logActorOf(actor),
      })
    );
  }
);
