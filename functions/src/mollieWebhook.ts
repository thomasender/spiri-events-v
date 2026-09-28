import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { MOLLIE_API_KEY, mollieRequest } from './mollie';
import { getFirestore } from 'firebase-admin/firestore';
import {
  NEXT_GEN_SIGNATURE_HEADER,
  parseWebhookBody,
  processMollieWebhook as runWebhook,
  verifyMollieSignature,
  FirestoreLikeDb,
} from '../../src/lib/mollieWebhook';

const REGION = 'europe-west3';
const MOLLIE_WEBHOOK_SIGNING_SECRET = defineSecret('MOLLIE_WEBHOOK_SIGNING_SECRET');

export const mollieWebhook = onRequest(
  {
    region: REGION,
    secrets: [MOLLIE_API_KEY, MOLLIE_WEBHOOK_SIGNING_SECRET],
  },
  async (req, res) => {
    const apiKey = MOLLIE_API_KEY.value();
    if (!apiKey) {
      logger.error('mollieWebhook called but MOLLIE_API_KEY is not configured');
      res.status(500).json({ error: 'payment provider is not configured' });
      return;
    }

    // Signature verification: Next-gen webhooks carry an HMAC-SHA256
    // signature of the raw body. Verifying it confirms the payload really
    // originated from Mollie. When the secret isn't configured (e.g. local
    // emulator running the classic flow), we accept unsigned requests.
    const secret = MOLLIE_WEBHOOK_SIGNING_SECRET.value() || null;
    const rawBody =
      req.rawBody ??
      Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? null));
    const signature =
      typeof req.get === 'function' ? (req.get(NEXT_GEN_SIGNATURE_HEADER) ?? null) : null;
    const sigCheck = verifyMollieSignature({ rawBody, signature, secret });
    if (!sigCheck.valid) {
      logger.warn('mollieWebhook signature rejected', { reason: sigCheck.reason });
      res.status(401).json({ error: 'invalid-signature', reason: sigCheck.reason });
      return;
    }

    const body = parseWebhookBody(req.body);
    const db = getFirestore() as unknown as FirestoreLikeDb;

    const result = await runWebhook({
      body,
      db,
      now: () => new Date(),
      fetchPayment: async (id) => mollieRequest(apiKey, `/payments/${id}`, { method: 'GET' }),
      fetchCustomer: async (id) => mollieRequest(apiKey, `/customers/${id}`, { method: 'GET' }),
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
} from '../../src/lib/mollieWebhook';
