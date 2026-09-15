import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import {
  ALLOWED_DONATION_AMOUNTS,
  MOLLIE_API_KEY,
  createMollieCustomer,
  createMollieSubscription,
  isAllowedDonationAmount,
} from './mollie';

interface CreateMollieSubscriptionRequest {
  amount: number;
  name?: string | null;
}

const REGION = 'europe-west3';

function resolveAppBaseUrl(req: { rawRequest: { host?: string; protocol?: string } }): string {
  const host = req.rawRequest.host ?? 'localhost';
  const protocol = req.rawRequest.protocol ?? 'https';
  return `${protocol}://${host}`;
}

export const createMollieSubscriptionHandler = onCall(
  {
    region: REGION,
    secrets: [MOLLIE_API_KEY],
    cors: ['https://events.thetribe.at'],
  },
  async (request) => {
    const data = (request.data ?? {}) as CreateMollieSubscriptionRequest;

    if (!isAllowedDonationAmount(data.amount)) {
      throw new HttpsError(
        'invalid-argument',
        `amount must be one of ${ALLOWED_DONATION_AMOUNTS.join(', ')} EUR`
      );
    }

    const apiKey = MOLLIE_API_KEY.value();
    if (!apiKey) {
      logger.error('MOLLIE_API_KEY secret is not configured');
      throw new HttpsError('internal', 'payment provider is not configured');
    }

    try {
      const customer = await createMollieCustomer(apiKey, data.name ?? null);
      const checkout = await createMollieSubscription(apiKey, {
        customerId: customer.id,
        amount: data.amount,
        appBaseUrl: resolveAppBaseUrl(request),
      });
      return checkout;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error('Mollie subscription creation failed', { message });
      throw new HttpsError('unavailable', `payment provider error: ${message}`);
    }
  }
);

export const mollieWebhook = onCall(
  {
    region: REGION,
    secrets: [MOLLIE_API_KEY],
  },
  async (request) => {
    logger.info('Mollie webhook payload', { data: request.data });
    return { received: true };
  }
);
