import { defineSecret } from 'firebase-functions/params';
import { MONTHLY_DONATION_TYPE } from './mollieWebhookLogic';

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
  idempotencyKey?: string;
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
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    // Mollie v2 errors carry the reason in `detail` (and the offending
    // `field`); without it a 422 is undiagnosable.
    const errorBody = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const reason =
      typeof errorBody.detail === 'string'
        ? errorBody.detail
        : typeof errorBody.message === 'string'
          ? errorBody.message
          : null;
    const field = typeof errorBody.field === 'string' ? ` (field: ${errorBody.field})` : '';
    const mollieMessage = reason ? `${reason}${field}` : null;
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
  paymentId: string;
}

export interface MolliePaymentCheckoutResult {
  checkoutUrl: string;
  paymentId: string;
}

export async function createMollieCustomer(
  apiKey: string,
  params: { name: string | null; displayOnConsent: boolean }
): Promise<MollieCustomerResponse> {
  const body: Record<string, unknown> = {};
  if (params.name && params.name.trim().length > 0) {
    body.name = params.name.trim();
  }
  body.metadata = { displayOnConsent: params.displayOnConsent };
  return mollieRequest<MollieCustomerResponse>(apiKey, '/customers', {
    method: 'POST',
    body,
  });
}

/**
 * Starts a monthly donation. Mollie only accepts a subscription once the
 * customer has a mandate, and a mandate only exists after a paid FIRST
 * payment (sequenceType=first). So this creates that first payment and
 * returns its checkout; the webhook creates the subscription once the
 * first payment is paid (see `ensureMollieSubscription`). Creating the
 * subscription straight away (the old flow) always failed with 422.
 */
export async function startMollieSubscriptionCheckout(
  apiKey: string,
  params: {
    customerId: string;
    amount: number;
    appBaseUrl: string;
    name?: string | null;
    displayOnConsent?: boolean;
    comment?: string | null;
    // Region the donation counts for (already checked by the callable).
    regionId?: string | null;
  }
): Promise<MollieSubscriptionCheckoutResult> {
  const metadata: Record<string, unknown> = {
    displayOnConsent: Boolean(params.displayOnConsent),
    donationType: MONTHLY_DONATION_TYPE,
  };
  if (params.name && params.name.trim().length > 0) {
    metadata.donorName = params.name.trim();
  }
  if (params.displayOnConsent && params.comment) {
    metadata.comment = params.comment;
  }
  if (params.regionId) {
    metadata.regionId = params.regionId;
  }

  const payment = await mollieRequest<MolliePaymentResponse>(apiKey, '/payments', {
    method: 'POST',
    body: {
      amount: {
        currency: DONATION_CURRENCY,
        value: formatAmount(params.amount),
      },
      description: SUBSCRIPTION_DESCRIPTION,
      customerId: params.customerId,
      sequenceType: 'first',
      redirectUrl: `${params.appBaseUrl}/spenden/danke`,
      webhookUrl: `${params.appBaseUrl}/mollieWebhook`,
      locale: 'de_AT',
      metadata,
    },
  });

  const checkoutUrl = extractMollieCheckoutUrl(payment);
  if (!checkoutUrl) {
    throw new Error(
      `Mollie did not return a checkout URL for the first monthly payment (status: ${payment.status ?? 'unknown'})`
    );
  }

  return {
    checkoutUrl,
    customerId: params.customerId,
    paymentId: payment.id,
  };
}

/**
 * Creates the monthly subscription after the first payment was paid.
 * Idempotent: Mollie resends webhooks, so an existing active/pending
 * subscription of the customer is returned instead of creating a second one.
 */
export async function ensureMollieSubscription(
  apiKey: string,
  params: {
    customerId: string;
    amount: string;
    startDate: string;
    firstPaymentId: string;
    mandateId?: string | null;
    webhookUrl?: string | null;
  }
): Promise<{ id: string; created: boolean }> {
  const existing = await mollieRequest<{
    _embedded?: { subscriptions?: MollieSubscriptionResponse[] };
  }>(apiKey, `/customers/${params.customerId}/subscriptions`, { method: 'GET' });
  const live = existing?._embedded?.subscriptions?.find(
    (sub) => sub.status === 'active' || sub.status === 'pending'
  );
  if (live) return { id: live.id, created: false };

  const body: Record<string, unknown> = {
    amount: { currency: DONATION_CURRENCY, value: params.amount },
    description: SUBSCRIPTION_DESCRIPTION,
    interval: SUBSCRIPTION_INTERVAL,
    startDate: params.startDate,
    metadata: { firstPaymentId: params.firstPaymentId },
  };
  if (params.mandateId) body.mandateId = params.mandateId;
  if (params.webhookUrl) body.webhookUrl = params.webhookUrl;

  const subscription = await mollieRequest<MollieSubscriptionResponse>(
    apiKey,
    `/customers/${params.customerId}/subscriptions`,
    {
      method: 'POST',
      body,
      idempotencyKey: `sub-${params.firstPaymentId}`,
    }
  );
  return { id: subscription.id, created: true };
}

export async function startMolliePaymentCheckout(
  apiKey: string,
  params: {
    amount: number;
    appBaseUrl: string;
    name?: string | null;
    displayOnConsent?: boolean;
    comment?: string | null;
    // Region the donation counts for (already checked by the callable).
    regionId?: string | null;
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
  const metadata: Record<string, unknown> = {
    displayOnConsent: Boolean(params.displayOnConsent),
  };
  if (params.name && params.name.trim().length > 0) {
    metadata.donorName = params.name.trim();
  }
  if (params.displayOnConsent && params.comment) {
    metadata.comment = params.comment;
  }
  if (params.regionId) {
    metadata.regionId = params.regionId;
  }
  body.metadata = metadata;

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
