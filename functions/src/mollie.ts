import { defineSecret } from 'firebase-functions/params';

export const MOLLIE_API_KEY = defineSecret('MOLLIE_API_KEY');

export const MOLLIE_API_BASE = 'https://api.mollie.com/v2';

export const ALLOWED_DONATION_AMOUNTS = [1.9, 6.9, 12.9] as const;
export type AllowedDonationAmount = (typeof ALLOWED_DONATION_AMOUNTS)[number];

export function isAllowedDonationAmount(value: unknown): value is AllowedDonationAmount {
  return (
    typeof value === 'number' && (ALLOWED_DONATION_AMOUNTS as readonly number[]).includes(value)
  );
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
  checkoutUrl?: { href: string; type: string };
}

export interface MollieCheckoutResult {
  checkoutUrl: string;
  customerId: string;
  subscriptionId: string;
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

export async function createMollieSubscription(
  apiKey: string,
  params: {
    customerId: string;
    amount: AllowedDonationAmount;
    appBaseUrl: string;
  }
): Promise<MollieCheckoutResult> {
  const subscription = await mollieRequest<MollieSubscriptionResponse>(apiKey, '/subscriptions', {
    method: 'POST',
    body: {
      customerId: params.customerId,
      amount: {
        currency: 'EUR',
        value: formatAmount(params.amount),
      },
      description: 'Monatliche Spende tribe Vorarlberg',
      interval: '1 month',
      webhookUrl: `${params.appBaseUrl}/mollieWebhook`,
      _links: {},
    },
  });

  const payment = await mollieRequest<MolliePaymentResponse>(
    apiKey,
    `/subscriptions/${subscription.id}`,
    { method: 'GET' }
  );

  void payment;

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
