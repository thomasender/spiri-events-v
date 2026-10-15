import { logger } from 'firebase-functions';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp();
}

import {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_FROM,
  MAILGUN_REPLY_TO,
  MAILGUN_EU_BASE,
  sendMailgunMessage,
  isMailgunDryRun,
} from './mailgun';
import { buildFavoriteCancelledPayload } from './emailTemplates';
import {
  detectNewCancellations,
  selectFavoriteRecipients,
  todayInVienna,
  FavoriteUserInfo,
} from './eventCancellation';
import { getUsersNotificationPreferences } from './userPreferences';

const REGION = 'europe-west3';
const GET_ALL_CHUNK = 300;
const AUTH_LOOKUP_CHUNK = 100;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

// Favorites live in users/{uid}/favorites/{eventId}. The site has few enough
// accounts that checking each user's favorite doc for this event is cheaper
// and simpler than a collection-group index.
async function findFavoriterUids(eventId: string): Promise<string[]> {
  const db = getFirestore();
  const userRefs = await db.collection('users').listDocuments();
  const uids: string[] = [];
  for (let i = 0; i < userRefs.length; i += GET_ALL_CHUNK) {
    const chunk = userRefs.slice(i, i + GET_ALL_CHUNK);
    const favRefs = chunk.map((ref) => ref.collection('favorites').doc(eventId));
    if (favRefs.length === 0) continue;
    const snaps = await db.getAll(...favRefs);
    snaps.forEach((snap, idx) => {
      if (snap.exists) uids.push(chunk[idx].id);
    });
  }
  return uids;
}

async function lookupUsers(uids: string[]): Promise<Map<string, FavoriteUserInfo>> {
  const map = new Map<string, FavoriteUserInfo>();
  const auth = getAuth();
  for (let i = 0; i < uids.length; i += AUTH_LOOKUP_CHUNK) {
    const chunk = uids.slice(i, i + AUTH_LOOKUP_CHUNK);
    const result = await auth.getUsers(chunk.map((uid) => ({ uid })));
    for (const user of result.users) {
      map.set(user.uid, {
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        disabled: user.disabled,
      });
    }
  }
  return map;
}

export const onEventCancelledNotifyFavorites = onDocumentUpdated(
  {
    region: REGION,
    document: 'events/{eventId}',
    secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM, MAILGUN_REPLY_TO],
  },
  async (event) => {
    const eventId = typeof event.params.eventId === 'string' ? event.params.eventId : '';
    const before = event.data?.before.data() ?? {};
    const after = event.data?.after.data() ?? {};

    const change = detectNewCancellations(before, after, todayInVienna());
    if (!change) return;

    const dryRun = isMailgunDryRun(process.env);
    const apiKey = MAILGUN_API_KEY.value() ?? '';
    const domain = MAILGUN_DOMAIN.value() ?? '';
    const from = MAILGUN_FROM.value() ?? '';
    const replyTo = readString(MAILGUN_REPLY_TO.value());
    if (!dryRun && (!apiKey || !domain || !from)) {
      logger.error('Mailgun secrets are not configured; skipping cancellation e-mail', { eventId });
      return;
    }

    const favoriterUids = await findFavoriterUids(eventId);
    if (favoriterUids.length === 0) {
      logger.info('Event cancelled, nobody favorited it', { eventId });
      return;
    }
    const [users, prefs] = await Promise.all([
      lookupUsers(favoriterUids),
      getUsersNotificationPreferences(favoriterUids),
    ]);
    const recipients = selectFavoriteRecipients(
      favoriterUids,
      users,
      (uid) => prefs.get(uid)?.notifyOnFavoriteCancelled !== false,
      readString(after.createdBy)
    );

    const notificationEvent = {
      id: eventId,
      title: readString(after.title) ?? '',
      slug: readString(after.slug),
    };
    let sent = 0;
    for (const recipient of recipients) {
      const payload = buildFavoriteCancelledPayload({
        event: notificationEvent,
        recipient: recipient.email,
        recipientName: recipient.displayName,
        dates: change.dates,
        wholeEvent: change.wholeEvent,
      });
      if (dryRun) {
        logger.info('MAILGUN dry-run: would send cancellation e-mail', {
          eventId,
          uid: recipient.uid,
          subject: payload.subject,
        });
        sent += 1;
        continue;
      }
      try {
        await sendMailgunMessage(MAILGUN_EU_BASE, {
          apiKey,
          domain,
          from,
          to: payload.to,
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
          replyTo: replyTo ?? undefined,
        });
        sent += 1;
      } catch (err) {
        logger.error('Cancellation e-mail failed', { eventId, uid: recipient.uid, err });
      }
    }
    logger.info('Cancellation e-mails processed', {
      eventId,
      wholeEvent: change.wholeEvent,
      dates: change.dates,
      favorites: favoriterUids.length,
      sent,
      dryRun,
    });
  }
);
