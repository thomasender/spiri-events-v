import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ADMIN_MAIL_SECRETS, notifyAdmins } from './adminNotify';
import {
  CHAT_RESOLVED_REPORT_RETENTION_DAYS,
  buildReportMail,
  retentionCutoffMs,
  shouldSendReportMail,
} from './chatLogic';

if (getApps().length === 0) {
  initializeApp();
}

const REGION = 'europe-west3';
const ROOM = 'lagerfeuer';
const ADMIN_CHAT_URL = 'https://www.thetribe.at/admin?tab=chat';

/** Deletes every doc of a query in chunks; returns how many were removed. */
async function deleteQuery(query: FirebaseFirestore.Query): Promise<number> {
  const db = getFirestore();
  let deleted = 0;
  for (;;) {
    const snap = await query.limit(400).get();
    if (snap.empty) return deleted;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) return deleted;
  }
}

/**
 * Chat messages live for 10 days (privacy). Also drops stale cooldown markers
 * and reports older than 30 days (they hold a copy of the reported text).
 */
export const purgeChatMessages = onSchedule(
  { region: REGION, schedule: 'every day 04:10', timeZone: 'Europe/Vienna' },
  async () => {
    const db = getFirestore();
    const now = Date.now();
    const messageCutoff = Timestamp.fromMillis(retentionCutoffMs(now));
    const reportCutoff = Timestamp.fromMillis(
      retentionCutoffMs(now, CHAT_RESOLVED_REPORT_RETENTION_DAYS)
    );

    const messages = await deleteQuery(
      db.collection(`chat_rooms/${ROOM}/messages`).where('createdAt', '<', messageCutoff)
    );
    const members = await deleteQuery(
      db.collection(`chat_rooms/${ROOM}/members`).where('lastMessageAt', '<', messageCutoff)
    );
    const reports = await deleteQuery(
      db.collection('chat_reports').where('createdAt', '<', reportCutoff)
    );
    logger.info('Purged chat data', { messages, members, reports });
  }
);

/** Tells the admins about a reported message (at most one mail per 15 minutes). */
export const onChatReportCreated = onDocumentCreated(
  {
    region: REGION,
    document: 'chat_reports/{reportId}',
    secrets: ADMIN_MAIL_SECRETS,
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const db = getFirestore();
    const stateRef = db.doc('chat_private/reportMail');
    const now = Date.now();

    const claimed = await db.runTransaction(async (tx) => {
      const state = await tx.get(stateRef);
      const last = state.exists ? (state.data()?.lastSentAt as Timestamp | undefined) : undefined;
      if (!shouldSendReportMail(last ? last.toMillis() : null, now)) return false;
      tx.set(stateRef, { lastSentAt: Timestamp.fromMillis(now) });
      return true;
    });
    if (!claimed) {
      logger.info('Chat report mail throttled', { reportId: event.params.reportId });
      return;
    }

    const open = await db.collection('chat_reports').where('status', '==', 'open').count().get();
    const mail = buildReportMail(data, open.data().count, ADMIN_CHAT_URL);
    try {
      await notifyAdmins(mail.subject, mail.text);
    } catch (err) {
      logger.error('Failed to send chat report mail', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
);
