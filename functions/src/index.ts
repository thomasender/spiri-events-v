import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import {
  MOLLIE_API_KEY,
  MIN_DONATION_AMOUNT,
  createMollieCustomer,
  isValidDonationAmount,
  resolveAppBaseUrl,
  startMolliePaymentCheckout,
  startMollieSubscriptionCheckout,
} from './mollie';
import { onEventStatusChanged, onEventCreated, onAdminMessageCreated } from './notifications';

const REGION = 'europe-west3';
const ALLOWED_ORIGINS = ['https://events.thetribe.at'];

interface CreateDonationRequest {
  amount: number;
  name?: string | null;
}

function assertValidAmount(amount: unknown): asserts amount is number {
  if (!isValidDonationAmount(amount)) {
    throw new HttpsError(
      'invalid-argument',
      `amount must be a number of at least ${MIN_DONATION_AMOUNT.toFixed(2)} EUR`
    );
  }
}

function assertApiKey(value: string | undefined): asserts value is string {
  if (!value) {
    logger.error('MOLLIE_API_KEY secret is not configured');
    throw new HttpsError('internal', 'payment provider is not configured');
  }
}

export const createMollieSubscription = onCall(
  {
    region: REGION,
    secrets: [MOLLIE_API_KEY],
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    const data = (request.data ?? {}) as CreateDonationRequest;
    assertValidAmount(data.amount);

    const apiKey = MOLLIE_API_KEY.value();
    assertApiKey(apiKey);

    try {
      const customer = await createMollieCustomer(apiKey, data.name ?? null);
      const checkout = await startMollieSubscriptionCheckout(apiKey, {
        customerId: customer.id,
        amount: data.amount,
        appBaseUrl: resolveAppBaseUrl(request),
      });
      return checkout;
    } catch (err) {
      logger.error('Mollie subscription creation failed', err);
      throw new HttpsError('unavailable', err instanceof Error ? err.message : 'unknown error');
    }
  }
);

export const createMolliePayment = onCall(
  {
    region: REGION,
    secrets: [MOLLIE_API_KEY],
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    const data = (request.data ?? {}) as CreateDonationRequest;
    assertValidAmount(data.amount);

    const apiKey = MOLLIE_API_KEY.value();
    assertApiKey(apiKey);

    try {
      const checkout = await startMolliePaymentCheckout(apiKey, {
        amount: data.amount,
        appBaseUrl: resolveAppBaseUrl(request),
        name: data.name ?? null,
      });
      return checkout;
    } catch (err) {
      logger.error('Mollie one-time payment creation failed', err);
      throw new HttpsError('unavailable', err instanceof Error ? err.message : 'unknown error');
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

export { onEventStatusChanged, onEventCreated, onAdminMessageCreated };
