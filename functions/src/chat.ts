import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ADMIN_MAIL_SECRETS, notifyAdmins } from './adminNotify';
import {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_EU_BASE,
  MAILGUN_FROM,
  MAILGUN_REPLY_TO,
  isMailgunDryRun,
  sendMailgunMessage,
} from './mailgun';
import {
  buildDirectMessagePayload,
  buildEventChatPayload,
  EmailPayload,
  withSiteOrigin,
} from './emailTemplates';
import { getUserNotificationPreferences, getUserSiteOrigin } from './userPreferences';
import {
  DM_MAIL_MARKER_COLLECTION,
  DM_MAIL_MARKER_RETENTION_MS,
  EVENT_CHAT_MAIL_MARKER_COLLECTION,
  EVENT_CHAT_MAIL_MARKER_RETENTION_MS,
  MailAccount,
  chatMailBaseUrl,
  decideDmMail,
  decideEventChatMail,
  directMessageUrl,
  dmMailMarkerId,
  dmRecipientUid,
  eventChatUrl,
  isBanActive,
  shouldSendDmMail,
  shouldSendEventChatMail,
  viennaDay,
} from './chatMailNotify';
import {
  CHAT_RESOLVED_REPORT_RETENTION_DAYS,
  DM_RETENTION_DAYS,
  buildDmReportMail,
  buildReportMail,
  canReceiveChatMention,
  mentionExcerpt,
  mentionTargets,
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
 * Private messages live for 90 days: conversations whose last message is older
 * go entirely, others lose their old messages. Walks the threads in pages.
 */
async function purgeDirectMessages(
  cutoff: Timestamp
): Promise<{ dmThreads: number; dmMessages: number }> {
  const db = getFirestore();
  let dmThreads = 0;
  let dmMessages = 0;
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db.collection('dm_threads').orderBy('__name__').limit(200);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    for (const thread of page.docs) {
      const lastAt = thread.get('lastMessageAt') as Timestamp | undefined;
      try {
        if (lastAt && lastAt.toMillis() < cutoff.toMillis()) {
          await db.recursiveDelete(thread.ref);
          dmThreads += 1;
        } else {
          dmMessages += await deleteQuery(
            thread.ref.collection('messages').where('createdAt', '<', cutoff)
          );
        }
      } catch (err) {
        logger.error('Failed to purge private messages', {
          thread: thread.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    last = page.docs[page.docs.length - 1];
    if (page.size < 200) break;
  }
  return { dmThreads, dmMessages };
}

/**
 * Kerzenraum (one room per event, `event_chats/{eventId}`): same 10 days as the
 * Lagerfeuer. Rooms without a newer message go entirely, others lose their old
 * messages and cooldown markers.
 */
async function purgeEventChats(
  cutoff: Timestamp
): Promise<{ eventRooms: number; eventMessages: number }> {
  const db = getFirestore();
  let eventRooms = 0;
  let eventMessages = 0;
  const rooms = await db.collection('event_chats').get();
  for (const room of rooms.docs) {
    const lastAt = room.get('lastMessageAt') as Timestamp | undefined;
    try {
      if (!lastAt || lastAt.toMillis() < cutoff.toMillis()) {
        await db.recursiveDelete(room.ref);
        eventRooms += 1;
      } else {
        eventMessages += await deleteQuery(
          room.ref.collection('messages').where('createdAt', '<', cutoff)
        );
        await deleteQuery(room.ref.collection('members').where('lastMessageAt', '<', cutoff));
      }
    } catch (err) {
      logger.error('Failed to purge event chat', {
        room: room.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { eventRooms, eventMessages };
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
    // Heartbeats of closed tabs that never got to delete theirs.
    const presence = await deleteQuery(
      db
        .collection(`chat_rooms/${ROOM}/presence`)
        .where('lastSeen', '<', Timestamp.fromMillis(now - 24 * 60 * 60 * 1000))
    );
    const reports = await deleteQuery(
      db.collection('chat_reports').where('createdAt', '<', reportCutoff)
    );
    // Online-status heartbeats left behind by closed browsers.
    const onlinePresence = await deleteQuery(
      db
        .collection('presence')
        .where('lastSeen', '<', Timestamp.fromMillis(now - 24 * 60 * 60 * 1000))
    );
    const starters = await deleteQuery(
      db
        .collection('dm_starters')
        .where('lastThreadAt', '<', Timestamp.fromMillis(now - 2 * 24 * 60 * 60 * 1000))
    );
    const dmReports = await deleteQuery(
      db.collection('dm_reports').where('createdAt', '<', reportCutoff)
    );
    const dm = await purgeDirectMessages(
      Timestamp.fromMillis(retentionCutoffMs(now, DM_RETENTION_DAYS))
    );
    const eventChats = await purgeEventChats(messageCutoff);
    // Mention notifications go with the messages they point at.
    const mentionNotices = await deleteQuery(
      db.collectionGroup('mentions').where('createdAt', '<', messageCutoff)
    );
    // Throttle markers of the chat e-mails are only needed for an hour / a day.
    const dmMailMarkers = await deleteQuery(
      db
        .collection(DM_MAIL_MARKER_COLLECTION)
        .where('lastMailAt', '<', Timestamp.fromMillis(now - DM_MAIL_MARKER_RETENTION_MS))
    );
    const eventChatMailMarkers = await deleteQuery(
      db
        .collection(EVENT_CHAT_MAIL_MARKER_COLLECTION)
        .where('lastMailAt', '<', Timestamp.fromMillis(now - EVENT_CHAT_MAIL_MARKER_RETENTION_MS))
    );
    logger.info('Purged chat data', {
      mentionNotices,
      dmMailMarkers,
      eventChatMailMarkers,
      messages,
      members,
      presence,
      reports,
      starters,
      onlinePresence,
      dmReports,
      ...dm,
      ...eventChats,
    });
  }
);

/** One report mail per 15 minutes in total (chat and private reports share the budget). */
async function claimReportMailSlot(now: number): Promise<boolean> {
  const db = getFirestore();
  const stateRef = db.doc('chat_private/reportMail');
  return db.runTransaction(async (tx) => {
    const state = await tx.get(stateRef);
    const last = state.exists ? (state.data()?.lastSentAt as Timestamp | undefined) : undefined;
    if (!shouldSendReportMail(last ? last.toMillis() : null, now)) return false;
    tx.set(stateRef, { lastSentAt: Timestamp.fromMillis(now) });
    return true;
  });
}

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
    const claimed = await claimReportMailSlot(Date.now());
    if (!claimed) {
      logger.info('Chat report mail throttled', { reportId: event.params.reportId });
      return;
    }

    const open = await db.collection('chat_reports').where('status', '==', 'open').count().get();
    let eventTitle: string | undefined;
    if (typeof data.eventId === 'string' && data.eventId) {
      try {
        const eventSnap = await db.doc(`events/${data.eventId}`).get();
        const title = eventSnap.get('title');
        eventTitle = typeof title === 'string' ? title : undefined;
      } catch (err) {
        logger.warn('Could not read event title for report mail', { eventId: data.eventId });
      }
    }
    const mail = buildReportMail(data, open.data().count, ADMIN_CHAT_URL, eventTitle);
    try {
      await notifyAdmins(mail.subject, mail.text);
    } catch (err) {
      logger.error('Failed to send chat report mail', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

/** Same for a reported private conversation; the mail never contains message text. */
export const onDmReportCreated = onDocumentCreated(
  {
    region: REGION,
    document: 'dm_reports/{reportId}',
    secrets: ADMIN_MAIL_SECRETS,
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    if (!(await claimReportMailSlot(Date.now()))) {
      logger.info('DM report mail throttled', { reportId: event.params.reportId });
      return;
    }
    const db = getFirestore();
    const open = await db.collection('dm_reports').where('status', '==', 'open').count().get();
    const mail = buildDmReportMail(data, open.data().count, ADMIN_CHAT_URL);
    try {
      await notifyAdmins(mail.subject, mail.text);
    } catch (err) {
      logger.error('Failed to send DM report mail', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

/**
 * Writes `users/{uid}/mentions/{messageId}` for everyone a new message mentions,
 * so the bell in the header can show it. Server side on purpose: clients cannot
 * create these documents, so nobody can fill another person's bell. The client
 * only names uids; this re-checks that each person allows being mentioned
 * (public profile `allowMentions`), is not the author and can open the room.
 * Idempotent (document id = message id), so a retry changes nothing.
 */
async function notifyMentions(
  kind: 'lagerfeuer' | 'event',
  eventId: string | null,
  messageId: string,
  data: FirebaseFirestore.DocumentData | undefined
): Promise<void> {
  if (!data) return;
  const authorUid = typeof data.authorUid === 'string' ? data.authorUid : '';
  const targets = mentionTargets(data.mentions, authorUid);
  if (!authorUid || targets.length === 0) return;

  const db = getFirestore();
  const mode = (await db.doc('app_settings/chat').get()).get('mode');
  if (mode !== 'all' && mode !== 'admins') return;

  let eventSlug = '';
  let eventTitle = '';
  if (kind === 'event' && eventId) {
    const event = await db.doc(`events/${eventId}`).get();
    eventSlug = typeof event.get('slug') === 'string' ? event.get('slug') : '';
    eventTitle = typeof event.get('title') === 'string' ? event.get('title') : '';
  }

  const base = {
    kind,
    eventId,
    eventSlug,
    eventTitle: eventTitle.slice(0, 200),
    messageId,
    fromUid: authorUid,
    fromName: typeof data.authorName === 'string' ? data.authorName.slice(0, 80) : '',
    excerpt: mentionExcerpt(data.text),
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  };

  let sent = 0;
  for (const uid of targets) {
    try {
      const profile = await db.doc(`users/${uid}/publicProfile/data`).get();
      if (!profile.exists || profile.get('allowMentions') !== true) continue;
      const isAdmin = mode === 'admins' ? (await db.doc(`admin_users/${uid}`).get()).exists : false;
      if (!canReceiveChatMention(mode, isAdmin)) continue;
      await db.doc(`users/${uid}/mentions/${messageId}`).set(base);
      sent += 1;
    } catch (err) {
      logger.error('Failed to write mention notification', {
        uid,
        messageId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  logger.info('Mention notifications written', { kind, messageId, targets: targets.length, sent });
}

export const onLagerfeuerMention = onDocumentCreated(
  { region: REGION, document: `chat_rooms/${ROOM}/messages/{messageId}` },
  async (event) => notifyMentions('lagerfeuer', null, event.params.messageId, event.data?.data())
);

export const onKerzenraumMention = onDocumentCreated(
  { region: REGION, document: 'event_chats/{eventId}/messages/{messageId}' },
  async (event) =>
    notifyMentions('event', event.params.eventId, event.params.messageId, event.data?.data())
);

// ---- E-mail notifications (Postfach and Event Chat, pure logic in chatMailNotify.ts) ----

const CHAT_MAIL_SECRETS = [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM, MAILGUN_REPLY_TO];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

interface ChatMailAccount extends MailAccount {
  displayName: string | null;
}

/** Firebase Auth accounts by uid; a deleted account is simply missing. */
async function readAccounts(uids: string[]): Promise<Map<string, ChatMailAccount>> {
  const map = new Map<string, ChatMailAccount>();
  const result = await getAuth().getUsers(uids.map((uid) => ({ uid })));
  for (const user of result.users) {
    map.set(user.uid, {
      email: user.email ?? null,
      disabled: user.disabled,
      emailVerified: user.emailVerified,
      displayName: user.displayName ?? null,
    });
  }
  return map;
}

async function publicDisplayName(uid: string): Promise<string | null> {
  const profile = await getFirestore().doc(`users/${uid}/publicProfile/data`).get();
  return readText(profile.get('displayName'));
}

async function isChatBanActive(uid: string, nowMs: number): Promise<boolean> {
  const ban = await getFirestore().doc(`chat_bans/${uid}`).get();
  const until = ban.exists ? (ban.get('until') as Timestamp | undefined) : undefined;
  return isBanActive(
    until && typeof until.toMillis === 'function' ? until.toMillis() : null,
    nowMs
  );
}

async function isAdminUid(uid: string): Promise<boolean> {
  return (await getFirestore().doc(`admin_users/${uid}`).get()).exists;
}

/** Sends one chat mail via Mailgun (or logs it in dry-run mode). */
async function sendChatMail(
  payload: EmailPayload,
  context: Record<string, string>
): Promise<boolean> {
  if (isMailgunDryRun(process.env)) {
    logger.info('MAILGUN dry-run: would send chat e-mail', {
      ...context,
      subject: payload.subject,
    });
    return true;
  }
  const apiKey = MAILGUN_API_KEY.value() ?? '';
  const domain = MAILGUN_DOMAIN.value() ?? '';
  const from = MAILGUN_FROM.value() ?? '';
  if (!apiKey || !domain || !from) {
    logger.error('Mailgun secrets are not configured; skipping chat e-mail', context);
    return false;
  }
  await sendMailgunMessage(MAILGUN_EU_BASE, {
    apiKey,
    domain,
    from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    replyTo: readText(MAILGUN_REPLY_TO.value()) ?? undefined,
  });
  return true;
}

/** One mail per conversation and recipient per hour; the transaction stops parallel triggers. */
async function claimDmMailSlot(markerId: string, nowMs: number): Promise<boolean> {
  const db = getFirestore();
  const ref = db.collection(DM_MAIL_MARKER_COLLECTION).doc(markerId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = snap.exists ? (snap.get('lastMailAt') as Timestamp | undefined) : undefined;
    if (!shouldSendDmMail(last ? last.toMillis() : null, nowMs)) return false;
    tx.set(ref, { lastMailAt: Timestamp.fromMillis(nowMs) });
    return true;
  });
}

/** One Event Chat mail per organizer and calendar day (Vienna), whichever event it is. */
async function claimEventChatMailSlot(organizerUid: string, nowMs: number): Promise<boolean> {
  const db = getFirestore();
  const ref = db.collection(EVENT_CHAT_MAIL_MARKER_COLLECTION).doc(organizerUid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const day = snap.exists ? readText(snap.get('day')) : null;
    if (!shouldSendEventChatMail(day, nowMs)) return false;
    tx.set(ref, { day: viennaDay(nowMs), lastMailAt: Timestamp.fromMillis(nowMs) });
    return true;
  });
}

/**
 * Mails the other participant about a new private message, with a short excerpt
 * and a link to the conversation. Never for blocked senders, recipients who take
 * no private messages or switched the mail off, banned authors or inactive accounts.
 */
async function mailDirectMessage(
  threadId: string,
  messageId: string,
  data: FirebaseFirestore.DocumentData | undefined
): Promise<void> {
  const authorUid = readText(data?.authorUid) ?? '';
  if (!data || !authorUid) return;
  const db = getFirestore();
  const mode = (await db.doc('app_settings/messenger').get()).get('mode');
  if (mode !== 'all' && mode !== 'admins') return;
  const recipientUid = dmRecipientUid(threadId, authorUid);
  const log = { threadId, messageId };
  if (!recipientUid || recipientUid === authorUid) {
    logger.info('Direct message mail skipped', { ...log, reason: 'invalid_thread' });
    return;
  }

  const now = Date.now();
  const [recipientIsAdmin, prefs, blockA, blockB, settings, authorBanned, accounts] =
    await Promise.all([
      mode === 'admins' ? isAdminUid(recipientUid) : Promise.resolve(false),
      getUserNotificationPreferences(recipientUid),
      db.doc(`dm_blocks/${recipientUid}_${authorUid}`).get(),
      db.doc(`dm_blocks/${authorUid}_${recipientUid}`).get(),
      db.doc(`dm_settings/${recipientUid}`).get(),
      isChatBanActive(authorUid, now),
      readAccounts([authorUid, recipientUid]),
    ]);
  const decision = decideDmMail({
    mode,
    recipientIsAdmin,
    authorUid,
    recipientUid,
    text: data.text,
    prefEnabled: prefs.notifyOnDirectMessage !== false,
    blocked: blockA.exists || blockB.exists,
    recipientAllowsDirectMessages: settings.get('allowDirectMessages') !== false,
    authorBanned,
    author: accounts.get(authorUid) ?? null,
    recipient: accounts.get(recipientUid) ?? null,
  });
  if (!decision.send) {
    logger.info('Direct message mail skipped', { ...log, reason: decision.reason });
    return;
  }
  if (!(await claimDmMailSlot(dmMailMarkerId(threadId, recipientUid), now))) {
    logger.info('Direct message mail throttled', log);
    return;
  }

  const recipient = accounts.get(recipientUid) as ChatMailAccount;
  const [senderName, recipientName] = await Promise.all([
    publicDisplayName(authorUid),
    publicDisplayName(recipientUid),
  ]);
  const siteOrigin = await getUserSiteOrigin(recipientUid);
  const payload = buildDirectMessagePayload({
    recipient: recipient.email as string,
    recipientName: recipientName ?? recipient.displayName,
    senderName,
    messageText: typeof data.text === 'string' ? data.text : '',
    conversationUrl: directMessageUrl(
      chatMailBaseUrl(process.env.GCLOUD_PROJECT, siteOrigin),
      authorUid
    ),
  });
  const sent = await sendChatMail(withSiteOrigin(payload, siteOrigin), log);
  logger.info('Direct message mail processed', { ...log, sent });
}

/**
 * Mails the organizer (events.createdBy) about a new message in the Event Chat
 * of their event, at most once a day across all their events. No mail for the
 * organizer's own messages.
 */
async function mailEventChatMessage(
  eventId: string,
  messageId: string,
  data: FirebaseFirestore.DocumentData | undefined
): Promise<void> {
  const authorUid = readText(data?.authorUid) ?? '';
  if (!data || !authorUid) return;
  const db = getFirestore();
  const mode = (await db.doc('app_settings/chat').get()).get('mode');
  if (mode !== 'all' && mode !== 'admins') return;
  const event = await db.doc(`events/${eventId}`).get();
  const organizerUid = readText(event.get('createdBy'));
  const log = { eventId, messageId };
  if (!organizerUid || organizerUid === authorUid) {
    logger.info('Event chat mail skipped', {
      ...log,
      reason: organizerUid ? 'author_is_organizer' : 'no_organizer',
    });
    return;
  }

  const now = Date.now();
  const [organizerIsAdmin, prefs, block, authorBanned, accounts] = await Promise.all([
    mode === 'admins' ? isAdminUid(organizerUid) : Promise.resolve(false),
    getUserNotificationPreferences(organizerUid),
    db.doc(`dm_blocks/${organizerUid}_${authorUid}`).get(),
    isChatBanActive(authorUid, now),
    readAccounts([authorUid, organizerUid]),
  ]);
  const decision = decideEventChatMail({
    mode,
    organizerIsAdmin,
    authorUid,
    organizerUid,
    eventStatus: event.get('status'),
    text: data.text,
    prefEnabled: prefs.notifyOnEventChat !== false,
    blocked: block.exists,
    authorBanned,
    author: accounts.get(authorUid) ?? null,
    organizer: accounts.get(organizerUid) ?? null,
  });
  if (!decision.send) {
    logger.info('Event chat mail skipped', { ...log, reason: decision.reason });
    return;
  }
  if (!(await claimEventChatMailSlot(organizerUid, now))) {
    logger.info('Event chat mail throttled', log);
    return;
  }

  const organizer = accounts.get(organizerUid) as ChatMailAccount;
  const [authorName, organizerName] = await Promise.all([
    publicDisplayName(authorUid),
    publicDisplayName(organizerUid),
  ]);
  const siteOrigin = await getUserSiteOrigin(organizerUid);
  const payload = buildEventChatPayload({
    recipient: organizer.email as string,
    recipientName: organizerName ?? organizer.displayName,
    authorName,
    eventTitle: readText(event.get('title')) ?? '',
    messageText: typeof data.text === 'string' ? data.text : '',
    roomUrl: eventChatUrl(
      chatMailBaseUrl(process.env.GCLOUD_PROJECT, siteOrigin),
      readText(event.get('slug')),
      eventId
    ),
  });
  const sent = await sendChatMail(withSiteOrigin(payload, siteOrigin), log);
  logger.info('Event chat mail processed', { ...log, sent });
}

export const onDirectMessageMailNotify = onDocumentCreated(
  {
    region: REGION,
    document: 'dm_threads/{threadId}/messages/{messageId}',
    secrets: CHAT_MAIL_SECRETS,
  },
  async (event) => {
    try {
      await mailDirectMessage(event.params.threadId, event.params.messageId, event.data?.data());
    } catch (err) {
      logger.error('Direct message mail failed', {
        threadId: event.params.threadId,
        messageId: event.params.messageId,
        error: errorMessage(err),
      });
    }
  }
);

export const onKerzenraumMailNotify = onDocumentCreated(
  {
    region: REGION,
    document: 'event_chats/{eventId}/messages/{messageId}',
    secrets: CHAT_MAIL_SECRETS,
  },
  async (event) => {
    try {
      await mailEventChatMessage(event.params.eventId, event.params.messageId, event.data?.data());
    } catch (err) {
      logger.error('Event chat mail failed', {
        eventId: event.params.eventId,
        messageId: event.params.messageId,
        error: errorMessage(err),
      });
    }
  }
);
