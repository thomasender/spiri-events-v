import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { generateAndStoreEventImage } from './instagram/instagramImage';
import { publishApprovedEvent, type PublishDeps } from './instagram/instagramPublish';
import { getAdminEmails } from './adminEmails';
import {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_FROM,
  MAILGUN_REPLY_TO,
  MAILGUN_EU_BASE,
  sendMailgunMessage,
  isMailgunDryRun,
} from './mailgun';

if (getApps().length === 0) {
  initializeApp();
}

const IG_ACCESS_TOKEN = defineSecret('IG_ACCESS_TOKEN');
const IG_USER_ID = defineSecret('IG_USER_ID');

const REGION = 'europe-west3';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function notifyAdmins(subject: string, text: string): Promise<void> {
  if (isMailgunDryRun(process.env)) {
    logger.info('MAILGUN dry-run: would send Instagram failure mail', { subject });
    return;
  }
  const apiKey = MAILGUN_API_KEY.value();
  const domain = MAILGUN_DOMAIN.value();
  const from = MAILGUN_FROM.value();
  if (!apiKey || !domain || !from) {
    logger.error('Mailgun secrets are not configured; Instagram failure mail not sent');
    return;
  }
  const recipients = await getAdminEmails();
  const html = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
  for (const to of recipients) {
    await sendMailgunMessage(MAILGUN_EU_BASE, {
      apiKey,
      domain,
      from,
      to,
      subject,
      text,
      html,
      replyTo: MAILGUN_REPLY_TO.value() || undefined,
    });
  }
}

export const onEventApprovedPostToInstagram = onDocumentWritten(
  {
    region: REGION,
    document: 'events/{eventId}',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [
      IG_ACCESS_TOKEN,
      IG_USER_ID,
      MAILGUN_API_KEY,
      MAILGUN_DOMAIN,
      MAILGUN_FROM,
      MAILGUN_REPLY_TO,
    ],
  },
  async (event) => {
    const eventId = typeof event.params.eventId === 'string' ? event.params.eventId : '';
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const db = getFirestore();

    const deps: PublishDeps = {
      fetch,
      accessToken: IG_ACCESS_TOKEN.value(),
      userId: IG_USER_ID.value(),
      async isEnabled() {
        const snap = await db.doc('app_settings/instagram').get();
        return snap.exists && snap.get('enabled') === true;
      },
      async createPost(id, record) {
        try {
          await db
            .collection('instagram_posts')
            .doc(id)
            .create({
              ...record,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          return true;
        } catch (err) {
          // gRPC ALREADY_EXISTS
          if ((err as { code?: unknown }).code === 6) return false;
          throw err;
        }
      },
      async updatePost(id, patch) {
        await db
          .collection('instagram_posts')
          .doc(id)
          .update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
      },
      async generateImage(id, ev) {
        const colors: Record<string, string> = {};
        const categories = await db.collection('categories').get();
        categories.forEach((doc) => {
          const color = doc.get('color');
          const name = doc.get('name');
          if (typeof color === 'string' && typeof name === 'string') colors[name] = color;
        });
        return generateAndStoreEventImage(
          getStorage().bucket() as never,
          `feed_${id}`,
          ev,
          'feed',
          {
            categoryColors: colors,
          }
        );
      },
      notifyAdmins,
      log: (message, data) => logger.info(message, data),
    };

    // Cheap gates first so unrelated event writes never touch secrets or the
    // network; the full decision (kill switch, dedupe, date) lives in the
    // tested logic module.
    if (!deps.accessToken || !deps.userId) {
      logger.warn('IG_ACCESS_TOKEN or IG_USER_ID is not configured; skipping Instagram post', {
        eventId,
      });
      return;
    }

    const outcome = await publishApprovedEvent(deps, eventId, before, after);
    if (outcome !== 'ignored') logger.info('Instagram feed post processed', { eventId, outcome });
  }
);
