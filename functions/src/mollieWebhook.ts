import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { MOLLIE_API_KEY, mollieRequest } from './mollie';
import { getFirestore } from 'firebase-admin/firestore';
import type { FirestoreLikeDb } from './mollieWebhookLogic';
import {
  canonicalBodyBytes,
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
