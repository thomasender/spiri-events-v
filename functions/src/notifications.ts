import { logger } from 'firebase-functions';
import { onDocumentUpdated, onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp();
}

import {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_FROM,
  MAILGUN_REPLY_TO,
  SUBMITTED_NOTIFICATION_INBOX,
  MAILGUN_EU_BASE,
  sendMailgunMessage,
  isMailgunDryRun,
  readSubmittedInbox,
} from './mailgun';
import {
  decideEventStatusNotification,
  decideCreatedEventNotification,
  decideAdminMessageNotification,
  EventSnapshot,
  AdminMessageSnapshot,
  NotificationDecision,
} from './notificationRouting';
import { getAdminAccounts, AdminAccount } from './adminEmails';
import {
  buildEmailPayload,
  NotificationType,
  SubmittedPayloadInput,
  ChangesRequestedPayloadInput,
  PublishedPayloadInput,
  DeletedPayloadInput,
  EmailPayload,
} from './emailTemplates';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getUsersNotificationPreferences,
  PreferenceKey,
  NotificationPreferenceMap,
} from './userPreferences';

const REGION = 'europe-west3';
const ADMINS_RECIPIENT = 'admins' as const;
type UserRecipient = { email: string; uid?: string | null };
type RecipientMarker = UserRecipient | typeof ADMINS_RECIPIENT;

const PREFERENCE_KEY_BY_TYPE: Record<Exclude<NotificationType, 'submitted'>, PreferenceKey> = {
  changes_requested: 'notifyOnChangesRequested',
  published: 'notifyOnPublished',
  deleted: 'notifyOnDeleted',
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStatus(value: unknown): EventSnapshot['status'] {
  return value === 'draft' || value === 'pending' || value === 'approved' || value === 'trashed'
    ? value
    : null;
}

interface OrganizerLike {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  photoURL?: unknown;
}

function readOrganizer(value: unknown): EventSnapshot['organizer'] {
  if (!value || typeof value !== 'object') return null;
  const org = value as OrganizerLike;
  return {
    firstName: typeof org.firstName === 'string' ? org.firstName : null,
    lastName: typeof org.lastName === 'string' ? org.lastName : null,
    email: typeof org.email === 'string' ? org.email : null,
    photoURL: typeof org.photoURL === 'string' ? org.photoURL : null,
  };
}

function snapshotToEventSnapshot(data: FirebaseFirestore.DocumentData | undefined): EventSnapshot {
  if (!data) return {};
  return {
    status: readStatus(data.status),
    organizer: readOrganizer(data.organizer),
    createdBy: readString(data.createdBy),
    trashedAt: data.trashedAt ?? null,
    lastNotifiedStatus: readStatus(data.lastNotifiedStatus),
  };
}

function eventIdFromPath(params: { eventId?: string }): string {
  return typeof params.eventId === 'string' ? params.eventId : '';
}

interface SendOptions {
  apiKey: string;
  domain: string;
  from: string;
  replyTo?: string | null;
  submittedInbox?: string | null;
  dryRun: boolean;
}

async function sendPayload(
  payload: EmailPayload,
  options: SendOptions
): Promise<{ delivered: boolean; id?: string }> {
  if (options.dryRun) {
    logger.info('MAILGUN dry-run: would send email', {
      to: payload.to,
      subject: payload.subject,
      htmlLength: payload.html.length,
      textLength: payload.text.length,
    });
    return { delivered: true };
  }
  const result = await sendMailgunMessage(MAILGUN_EU_BASE, {
    apiKey: options.apiKey,
    domain: options.domain,
    from: options.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    replyTo: options.replyTo ?? undefined,
  });
  return { delivered: true, id: result.id };
}

export function buildAdminRecipients(
  adminEmails: string[],
  submittedInbox?: string | null
): string[] {
  if (submittedInbox) {
    return uniqueEmails([...adminEmails, submittedInbox]);
  }
  return uniqueEmails(adminEmails);
}

export function uniqueEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of emails) {
    if (typeof email !== 'string') continue;
    const normalized = email.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(email);
  }
  return out;
}

export interface ResolvedRecipient {
  uid?: string | null;
  email: string;
}

async function resolveRecipients(
  recipient: RecipientMarker,
  submittedInbox?: string | null
): Promise<ResolvedRecipient[]> {
  if (recipient === ADMINS_RECIPIENT) {
    const accounts = await getAdminAccounts();
    return buildAdminRecipientList(accounts, submittedInbox);
  }
  return [{ uid: recipient.uid ?? null, email: recipient.email }];
}

export function buildAdminRecipientList(
  accounts: AdminAccount[],
  submittedInbox?: string | null
): ResolvedRecipient[] {
  const out: ResolvedRecipient[] = accounts.map((account) => ({
    uid: account.uid,
    email: account.email,
  }));
  if (!submittedInbox) return out;
  const normalized = submittedInbox.trim().toLowerCase();
  if (!normalized) return out;
  const alreadyPresent = out.some((r) => r.email.trim().toLowerCase() === normalized);
  if (alreadyPresent) return out;
  out.push({ email: submittedInbox });
  return out;
}

export function preferenceKeyForType(type: NotificationType): PreferenceKey {
  if (type === 'submitted') return 'notifyOnSubmitted';
  return PREFERENCE_KEY_BY_TYPE[type];
}

export function filterRecipientsByPreferenceMap(
  type: NotificationType,
  recipients: ResolvedRecipient[],
  prefMap: Map<string, NotificationPreferenceMap>
): ResolvedRecipient[] {
  if (recipients.length === 0) return recipients;
  const prefKey = preferenceKeyForType(type);
  return recipients.filter((recipient) => {
    if (typeof recipient.uid !== 'string' || recipient.uid.length === 0) return true;
    const prefs = prefMap.get(recipient.uid) ?? DEFAULT_NOTIFICATION_PREFERENCES;
    if (prefs[prefKey]) return true;
    logger.info('Skipping notification due to user preference', {
      type,
      uid: recipient.uid,
      prefKey,
    });
    return false;
  });
}

async function filterRecipientsByPreferences(
  type: NotificationType,
  recipients: ResolvedRecipient[]
): Promise<ResolvedRecipient[]> {
  if (recipients.length === 0) return recipients;
  const uidsToCheck = Array.from(
    new Set(
      recipients
        .map((r) => r.uid)
        .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0)
    )
  );
  const prefMap = await getUsersNotificationPreferences(uidsToCheck);
  return filterRecipientsByPreferenceMap(type, recipients, prefMap);
}

async function dispatchDecision(
  eventId: string,
  type: NotificationType,
  recipient: RecipientMarker,
  payloadInput:
    | SubmittedPayloadInput
    | ChangesRequestedPayloadInput
    | PublishedPayloadInput
    | DeletedPayloadInput,
  options: SendOptions
): Promise<{ recipients: number; dryRun: boolean }> {
  const resolved = await resolveRecipients(recipient, options.submittedInbox);
  const filtered = await filterRecipientsByPreferences(type, resolved);
  if (filtered.length === 0) {
    logger.warn('No recipients resolved after preference filter, skipping email', {
      eventId,
      type,
    });
    return { recipients: 0, dryRun: options.dryRun };
  }
  let sent = 0;
  for (const { email: to } of filtered) {
    const payload = buildEmailPayload(type, { ...payloadInput, recipient: to });
    const result = await sendPayload(payload, options).catch((err) => {
      logger.error('Mailgun send failed', { eventId, type, recipient: to, err });
      return { delivered: false as const };
    });
    if (result.delivered) sent += 1;
  }
  return { recipients: sent, dryRun: options.dryRun };
}

function markNotified(eventId: string, status: EventSnapshot['status']): Promise<void> {
  const db = getFirestore();
  return db
    .collection('events')
    .doc(eventId)
    .set(
      {
        lastNotifiedStatus: status ?? null,
        lastNotifiedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    .then(() => undefined)
    .catch((err) => {
      logger.warn('Failed to write lastNotifiedAt', { eventId, err });
    });
}

function safeSecrets(dryRun: boolean): {
  apiKey: string;
  domain: string;
  from: string;
  replyTo: string | null;
  submittedInbox: string | null;
} | null {
  const apiKey = MAILGUN_API_KEY.value() ?? '';
  const domain = MAILGUN_DOMAIN.value() ?? '';
  const from = MAILGUN_FROM.value() ?? '';
  const replyToRaw = MAILGUN_REPLY_TO.value();
  const replyTo =
    typeof replyToRaw === 'string' && replyToRaw.trim().length > 0 ? replyToRaw.trim() : null;
  const submittedInbox = readSubmittedInbox(process.env);
  if (!dryRun && (!apiKey || !domain || !from)) {
    return null;
  }
  return { apiKey, domain, from, replyTo, submittedInbox };
}

function buildPayloadInputFromDecision(
  decision: NotificationDecision
):
  | SubmittedPayloadInput
  | ChangesRequestedPayloadInput
  | PublishedPayloadInput
  | DeletedPayloadInput {
  if (decision.type === 'submitted') {
    const submitterName =
      [decision.event.organizer?.firstName, decision.event.organizer?.lastName]
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .join(' ')
        .trim() || 'Ein Mitglied';
    return {
      event: decision.event,
      recipient: '',
      context: { submitterName },
    };
  }
  if (decision.type === 'changes_requested') {
    return {
      event: decision.event,
      recipient: decision.recipient,
      context: decision.context,
    };
  }
  if (decision.type === 'published') {
    return {
      event: decision.event,
      recipient: decision.recipient,
    };
  }
  return {
    event: decision.event,
    recipient: decision.recipient,
  };
}

export const onEventCreated = onDocumentCreated(
  {
    region: REGION,
    document: 'events/{eventId}',
    secrets: [
      MAILGUN_API_KEY,
      MAILGUN_DOMAIN,
      MAILGUN_FROM,
      MAILGUN_REPLY_TO,
      SUBMITTED_NOTIFICATION_INBOX,
    ],
  },
  async (event) => {
    const eventId = eventIdFromPath(event.params);
    const after = snapshotToEventSnapshot(event.data?.data());
    const title = readString(event.data?.data()?.title);
    const slug = readString(event.data?.data()?.slug);

    const decision = decideCreatedEventNotification(eventId, after, title, slug);
    if (!decision) {
      logger.debug('No notification needed for newly created event', { eventId });
      return;
    }

    const dryRun = isMailgunDryRun(process.env);
    const secrets = safeSecrets(dryRun);
    if (!secrets) {
      logger.error('Mailgun secrets are not configured; skipping send', { eventId });
      return;
    }

    const payloadInput = buildPayloadInputFromDecision(decision);
    const recipientMarker: RecipientMarker =
      decision.type === 'submitted'
        ? ADMINS_RECIPIENT
        : { email: decision.recipient as string, uid: after.createdBy ?? null };
    const result = await dispatchDecision(eventId, decision.type, recipientMarker, payloadInput, {
      ...secrets,
      dryRun,
    });
    logger.info(`${decision.type} notification processed`, { eventId, ...result });
    if (result.recipients > 0 || result.dryRun) {
      await markNotified(eventId, after.status);
    }
  }
);

export const onEventStatusChanged = onDocumentUpdated(
  {
    region: REGION,
    document: 'events/{eventId}',
    secrets: [
      MAILGUN_API_KEY,
      MAILGUN_DOMAIN,
      MAILGUN_FROM,
      MAILGUN_REPLY_TO,
      SUBMITTED_NOTIFICATION_INBOX,
    ],
  },
  async (event) => {
    const eventId = eventIdFromPath(event.params);
    const before = snapshotToEventSnapshot(event.data?.before.data());
    const after = snapshotToEventSnapshot(event.data?.after.data());
    const title = readString(event.data?.after.data()?.title);
    const slug = readString(event.data?.after.data()?.slug);

    const decision = decideEventStatusNotification(eventId, before, after, title, slug);
    if (!decision) {
      logger.debug('No status transition to notify', { eventId });
      return;
    }

    const dryRun = isMailgunDryRun(process.env);
    const secrets = safeSecrets(dryRun);
    if (!secrets) {
      logger.error('Mailgun secrets are not configured; skipping send', { eventId });
      return;
    }

    const payloadInput = buildPayloadInputFromDecision(decision);
    const recipientMarker: RecipientMarker =
      decision.type === 'submitted'
        ? ADMINS_RECIPIENT
        : { email: decision.recipient as string, uid: after.createdBy ?? null };
    const result = await dispatchDecision(eventId, decision.type, recipientMarker, payloadInput, {
      ...secrets,
      dryRun,
    });
    logger.info(`${decision.type} notification processed`, { eventId, ...result });
    if (result.recipients > 0 || result.dryRun) {
      await markNotified(eventId, after.status);
    }
  }
);

export const onAdminMessageCreated = onDocumentCreated(
  {
    region: REGION,
    document: 'events/{eventId}/messages/{messageId}',
    secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM, MAILGUN_REPLY_TO],
  },
  async (event) => {
    const eventId = eventIdFromPath(event.params);
    const messageId = typeof event.params.messageId === 'string' ? event.params.messageId : '';
    const data = event.data?.data();
    if (!data) return;

    const snapshot: AdminMessageSnapshot = {
      id: messageId,
      authorRole:
        data.authorRole === 'Admin' || data.authorRole === 'User' ? data.authorRole : null,
      authorUid: readString(data.authorUid),
      text: readString(data.text),
      authorName: readString(data.authorName),
    };

    const db = getFirestore();
    const eventSnap = await db.collection('events').doc(eventId).get();
    if (!eventSnap.exists) {
      logger.warn('Event missing for message notification', { eventId, messageId });
      return;
    }
    const eventData = eventSnap.data() ?? {};
    const eventSnapshot = snapshotToEventSnapshot(eventData);
    const title = readString(eventData.title);
    const slug = readString(eventData.slug);

    const decision = decideAdminMessageNotification(eventId, snapshot, eventSnapshot, title, slug);
    if (!decision) {
      logger.debug('No admin message notification needed', { eventId, messageId });
      return;
    }

    const dryRun = isMailgunDryRun(process.env);
    const secrets = safeSecrets(dryRun);
    if (!secrets) {
      logger.error('Mailgun secrets are not configured; skipping send', { eventId });
      return;
    }

    const input: ChangesRequestedPayloadInput = {
      event: decision.event,
      recipient: decision.recipient,
      context: {
        messageId: decision.context.messageId,
        authorName: decision.context.authorName,
        text: decision.context.text,
      },
    };
    const result = await dispatchDecision(
      eventId,
      'changes_requested',
      { email: decision.recipient, uid: eventSnapshot.createdBy ?? null },
      input,
      {
        ...secrets,
        dryRun,
      }
    );
    logger.info('changes_requested notification processed', {
      eventId,
      messageId,
      ...result,
    });
  }
);
