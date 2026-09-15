import { defineSecret } from 'firebase-functions/params';

export const MOLLIE_API_KEY = defineSecret('MOLLIE_API_KEY');

export const MOLLIE_API_BASE = 'https://api.mollie.com/v2';

export const MIN_DONATION_AMOUNT = 5.0;

export const DONATION_CURRENCY = 'EUR';

export const SUBSCRIPTION_INTERVAL = '1 month';

export const SUBSCRIPTION_DESCRIPTION = 'Monatliche Spende tribe Vorarlberg';

export const PAYMENT_DESCRIPTION = 'Einmalige Spende tribe Vorarlberg';

export function isValidDonationAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_DONATION_AMOUNT;
}

export function formatAmount(value: number): string {
  return value.toFixed(2);
}

interface MollieRequestOptions {
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
}

export async function mollieRequest<T>(
  apiKey: string,
  path: string,
  options: MollieRequestOptions
): Promise<T> {
  const response = await fetch(`${MOLLIE_API_BASE}${path}`, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : null) ?? `Mollie request to ${path} failed with ${response.status}`;
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return data as T;
}

interface MollieCheckoutUrl {
  href: string;
  type: string;
}

interface MollieCustomerResponse {
  id: string;
  name?: string;
}

interface MollieSubscriptionResponse {
  id: string;
  customerId?: string;
  status: string;
}

interface MolliePaymentResponse {
  id: string;
  checkoutUrl?: MollieCheckoutUrl;
}

export interface MollieSubscriptionCheckoutResult {
  checkoutUrl: string;
  customerId: string;
  subscriptionId: string;
}

export interface MolliePaymentCheckoutResult {
  checkoutUrl: string;
  paymentId: string;
}

export async function createMollieCustomer(
  apiKey: string,
  name: string | null
): Promise<MollieCustomerResponse> {
  const body: Record<string, unknown> = {};
  if (name && name.trim().length > 0) {
    body.name = name.trim();
  }
  return mollieRequest<MollieCustomerResponse>(apiKey, '/customers', {
    method: 'POST',
    body,
  });
}

export async function startMollieSubscriptionCheckout(
  apiKey: string,
  params: {
    customerId: string;
    amount: number;
    appBaseUrl: string;
  }
): Promise<MollieSubscriptionCheckoutResult> {
  const subscription = await mollieRequest<MollieSubscriptionResponse>(apiKey, '/subscriptions', {
    method: 'POST',
    body: {
      customerId: params.customerId,
      amount: {
        currency: DONATION_CURRENCY,
        value: formatAmount(params.amount),
      },
      description: SUBSCRIPTION_DESCRIPTION,
      interval: SUBSCRIPTION_INTERVAL,
      webhookUrl: `${params.appBaseUrl}/mollieWebhook`,
    },
  });

  const subPayments = await mollieRequest<{ _embedded?: { payments?: MolliePaymentResponse[] } }>(
    apiKey,
    `/subscriptions/${subscription.id}/payments?limit=1`,
    { method: 'GET' }
  );

  const firstPayment = subPayments._embedded?.payments?.[0];
  if (!firstPayment?.checkoutUrl?.href) {
    throw new Error('Mollie did not return a checkout URL for the first subscription payment');
  }

  return {
    checkoutUrl: firstPayment.checkoutUrl.href,
    customerId: params.customerId,
    subscriptionId: subscription.id,
  };
}

export async function startMolliePaymentCheckout(
  apiKey: string,
  params: {
    amount: number;
    appBaseUrl: string;
    name?: string | null;
  }
): Promise<MolliePaymentCheckoutResult> {
  const body: Record<string, unknown> = {
    amount: {
      currency: DONATION_CURRENCY,
      value: formatAmount(params.amount),
    },
    description: PAYMENT_DESCRIPTION,
    redirectUrl: `${params.appBaseUrl}/spenden/danke`,
    webhookUrl: `${params.appBaseUrl}/mollieWebhook`,
  };
  if (params.name && params.name.trim().length > 0) {
    body.metadata = { donorName: params.name.trim() };
  }

  const payment = await mollieRequest<MolliePaymentResponse>(apiKey, '/payments', {
    method: 'POST',
    body,
  });

  if (!payment.checkoutUrl?.href) {
    throw new Error('Mollie did not return a checkout URL for the one-time payment');
  }

  return {
    checkoutUrl: payment.checkoutUrl.href,
    paymentId: payment.id,
  };
}
