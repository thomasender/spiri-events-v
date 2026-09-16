import { defineSecret } from 'firebase-functions/params';

// Kept inline because the functions bundle is CJS and the shared helpers in
// src/lib/ are ESM modules. Keep in sync with the helper.
function extractMollieCheckoutUrl(
  response: { _links?: { checkout?: { href?: unknown } } } | null | undefined
): string | null {
  if (!response || typeof response !== 'object') return null;
  const checkout = response._links?.checkout;
  if (!checkout || typeof checkout.href !== 'string') return null;
  return checkout.href;
}

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

export interface CallableRequest {
  rawRequest: {
    host?: string;
    protocol?: string;
    headers?: Record<string, string | string[] | undefined>;
  };
}

// Kept inline because the functions bundle is CJS and the shared helper in
// src/lib/mollieBaseUrl.js is an ESM module. Keep in sync with the helper.
function readHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'string') return value;
  return undefined;
}

export function resolveAppBaseUrl(req: CallableRequest): string {
  const headers = req.rawRequest?.headers;

  const origin = readHeader(headers, 'origin');
  if (origin) return origin;

  const referer = readHeader(headers, 'referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // fall through
    }
  }

  const host = req.rawRequest?.host ?? 'localhost';
  const protocol = req.rawRequest?.protocol ?? 'https';
  return `${protocol}://${host}`;
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
    const mollieMessage =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : null;
    const message = mollieMessage
      ? `Mollie ${path} ${response.status}: ${mollieMessage}`
      : `Mollie ${path} failed with ${response.status}`;
    const error = new Error(message) as Error & { status?: number; body?: unknown };
    error.status = response.status;
    error.body = data;
    throw error;
  }

  return data as T;
}

interface MollieLink {
  href: string;
  type: string;
}

interface MollieLinks {
  checkout?: MollieLink;
}

export interface MolliePaymentResponse {
  id: string;
  status?: string;
  _links?: MollieLinks;
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
  const subscription = await mollieRequest<MollieSubscriptionResponse>(
    apiKey,
    `/customers/${params.customerId}/subscriptions`,
    {
      method: 'POST',
      body: {
        amount: {
          currency: DONATION_CURRENCY,
          value: formatAmount(params.amount),
        },
        description: SUBSCRIPTION_DESCRIPTION,
        interval: SUBSCRIPTION_INTERVAL,
        webhookUrl: `${params.appBaseUrl}/mollieWebhook`,
      },
    }
  );

  const subPayments = await mollieRequest<{
    _embedded?: { payments?: MolliePaymentResponse[] };
  }>(apiKey, `/customers/${params.customerId}/subscriptions/${subscription.id}/payments?limit=1`, {
    method: 'GET',
  });

  const firstPayment = subPayments._embedded?.payments?.[0];
  const checkoutUrl = firstPayment ? extractMollieCheckoutUrl(firstPayment) : null;
  if (!checkoutUrl) {
    throw new Error(
      `Mollie did not return a checkout URL for the first subscription payment (status: ${firstPayment?.status ?? 'unknown'})`
    );
  }

  return {
    checkoutUrl,
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
    locale: 'de_AT',
  };
  if (params.name && params.name.trim().length > 0) {
    body.metadata = { donorName: params.name.trim() };
  }

  const payment = await mollieRequest<MolliePaymentResponse>(apiKey, '/payments', {
    method: 'POST',
    body,
  });

  const checkoutUrl = extractMollieCheckoutUrl(payment);
  if (!checkoutUrl) {
    throw new Error(
      `Mollie did not return a checkout URL for the one-time payment (status: ${payment.status ?? 'unknown'})`
    );
  }

  return {
    checkoutUrl,
    paymentId: payment.id,
  };
}
