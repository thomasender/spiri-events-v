import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { MOLLIE_API_KEY, ensureMollieSubscription, mollieRequest } from './mollie';
import { reportPaymentFailure } from './paymentAlerts';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { regionNameOf } from './regions';
import type { FirestoreLikeDb } from './mollieWebhookLogic';
import {
  canonicalBodyBytes,
  donationNoticeRecipients,
  donationNoticeText,
  type DonationNotice,
  NEXT_GEN_SIGNATURE_HEADER,
  parseWebhookBody,
  processMollieWebhook as runWebhook,
  verifyMollieSignature,
} from './mollieWebhookLogic';

const REGION = 'europe-west3';

/**
 * Read the webhook signing secret. Falls back to the
 * MOLLIE_WEBHOOK_SIGNING_SECRET environment variable so the function
 * works in the local emulator out-of-the-box; in production this is set
 * via `firebase functions:secrets:set`.
 */
function getWebhookSigningSecret(): string | null {
  return process.env.MOLLIE_WEBHOOK_SIGNING_SECRET ?? null;
}

/**
 * Writes the bell entry `users/{uid}/mentions/donation_{paymentId}` for every
 * Super-Admin and the Regions-Moderator:innen of the donation's region. create()
 * fails when the entry exists, so a repeated webhook adds nothing.
 */
async function notifyStaffOfDonation(notice: DonationNotice): Promise<void> {
  const db = getFirestore();
  const [roles, regions] = await Promise.all([
    db.collection('admin_users').get(),
    db.collection('regions').where('active', '==', true).get(),
  ]);
  const activeIds = new Set(regions.docs.map((d) => d.id));
  activeIds.add('vorarlberg');
  const text = donationNoticeText(
    notice,
    activeIds.size > 1 ? (regionNameOf(notice.regionId) ?? notice.regionId) : null
  );
  const recipients = donationNoticeRecipients(
    roles.docs.map((d) => ({ id: d.id, data: d.data() })),
    notice.regionId
  );
  for (const uid of recipients) {
    try {
      await db.doc(`users/${uid}/mentions/${notice.id}`).create({
        kind: 'donation',
        eventId: null,
        eventSlug: '',
        eventTitle: '',
        messageId: notice.id,
        fromUid: '',
        fromName: '',
        excerpt: text,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      if ((err as { code?: unknown })?.code === 6) continue; // already exists
      logger.error('donation notice not written', { uid, id: notice.id, err });
    }
  }
}

export const mollieWebhook = onRequest(
  {
    region: REGION,
    secrets: [MOLLIE_API_KEY],
  },
  async (req, res) => {
    const apiKey = MOLLIE_API_KEY.value();
    if (!apiKey) {
      logger.error('mollieWebhook called but MOLLIE_API_KEY is not configured');
      res.status(500).json({ error: 'payment provider is not configured' });
      return;
    }

    const rawBody = canonicalBodyBytes(req);

    const secret = getWebhookSigningSecret();
    const signatureHeader =
      typeof req.headers[NEXT_GEN_SIGNATURE_HEADER] === 'string'
        ? (req.headers[NEXT_GEN_SIGNATURE_HEADER] as string)
        : null;
    const sigCheck = verifyMollieSignature({
      rawBody,
      signature: signatureHeader,
      secret,
    });
    if (!sigCheck.valid) {
      logger.warn('mollieWebhook signature rejected', {
        reason: sigCheck.reason,
        rawBodyLength: rawBody.length,
        signaturePrefix: signatureHeader ? signatureHeader.slice(0, 24) : null,
      });
      res.status(401).json({ error: 'invalid-signature', reason: sigCheck.reason });
      return;
    }

    const bodyText = rawBody.toString('utf8');
    const body = parseWebhookBody(bodyText);
    const db = getFirestore() as unknown as FirestoreLikeDb;

    const result = await runWebhook({
      body,
      db,
      now: () => new Date(),
      fetchPayment: async (id) => mollieRequest(apiKey, `/payments/${id}`, { method: 'GET' }),
      fetchCustomer: async (id) => mollieRequest(apiKey, `/customers/${id}`, { method: 'GET' }),
      ensureSubscription: (args) => ensureMollieSubscription(apiKey, args),
      reportFailure: (args) => reportPaymentFailure(args),
      notifyDonation: notifyStaffOfDonation,
    });

    if (result.status >= 500) {
      logger.error('mollieWebhook internal error', { body: result.body });
    }

    res.status(result.status).json(result.body);
  }
);

export {
  parseWebhookBody,
  processMollieWebhook,
  handlePaidPayment,
  verifyMollieSignature,
} from './mollieWebhookLogic';
