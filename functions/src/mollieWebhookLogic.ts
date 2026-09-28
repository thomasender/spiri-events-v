/**
 * Pure logic for the Mollie webhook handler. Lives in functions/src/ so
 * both the Cloud Function in functions/src/mollieWebhook.ts and the
 * Vitest specs in tests/lib/ can import it from a single source of
 * truth. tsc compiles this file into functions/lib/ as CommonJS; vitest
 * reads it as TS directly.
 *
 * The Cloud Function wires up the live Firestore admin SDK and real
 * Mollie fetchers, and forwards HTTP requests to `processMollieWebhook`.
 * Tests inject fake fetchers + a fake db.
 *
 * Supports Mollie's Next-gen webhook format (current, since 2024):
 *   Headers: Content-Type: application/json, X-Mollie-Signature: sha256=<hex>
 *   Body: { resource: 'event', id, type: 'payment.paid', entityId, _embedded: { entity: <payment> } }
 *
 * Falls back to the legacy Classic webhook format:
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: id=tr_xxx   (then the handler fetches via API)
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const DONOR_NEXT_ORDER_STEP = 100;
export const MOLLIE_DONATION_CURRENCY = 'EUR';
export const NEXT_GEN_SIGNATURE_HEADER = 'x-mollie-signature';

function asMetadata(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object') return input as Record<string, unknown>;
  return {};
}

function parseEuroAmount(input: unknown): number | null {
  if (!input || typeof input !== 'object') return null;
  const value = (input as { value?: unknown }).value;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

export function donorIdForPayment(paymentId: string, subscriptionId?: string | null): string {
  if (subscriptionId) {
    return `donor_mollie_sub_${subscriptionId}`;
  }
  return `donor_mollie_${paymentId}`;
}

async function nextOrderForNewDonor(db: FirestoreLikeDb): Promise<number> {
  const snapshot = await db.collection('donors').orderBy('order', 'desc').limit(1).get();
  const docs = snapshot.docs ?? [];
  const maxOrder = docs.reduce((max: number, doc) => {
    const value = doc.get('order');
    return typeof value === 'number' && value > max ? value : max;
  }, -1);
  return maxOrder < 0 ? 0 : maxOrder + DONOR_NEXT_ORDER_STEP;
}

export function verifyMollieSignature({
  rawBody,
  signature,
  secret,
}: {
  rawBody: string | Buffer;
  signature: string | null;
  secret: string | null;
}): { valid: boolean; skipped: boolean; reason?: string } {
  if (!secret) {
    return { valid: true, skipped: true, reason: 'no-secret-configured' };
  }
  if (!signature) {
    return { valid: false, skipped: false, reason: 'missing-signature' };
  }
  const expected = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  const computed = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected.length !== computed.length) {
    return { valid: false, skipped: false, reason: 'length-mismatch' };
  }
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(computed, 'hex');
  if (a.length !== b.length) {
    return { valid: false, skipped: false, reason: 'length-mismatch' };
  }
  const ok = timingSafeEqual(a, b);
  return { valid: ok, skipped: false, reason: ok ? undefined : 'signature-mismatch' };
}

/**
 * Returns the body bytes that the signature should be verified against.
 *
 * Firebase Functions v2 (and the local emulator) parses JSON bodies via
 * Express `body-parser`, populating `req.body` and consuming the raw
 * stream. The stream is therefore typically empty by the time the
 * handler runs, so `req.rawBody` is not populated.
 *
 * For signature verification to work reliably across deployments we need
 * the EXACT bytes Mollie signed. We accept that `req.body` already parsed
 * the JSON, and re-serialise it back to a canonical string. As long as
 * both sides agree on the canonical form this works — and for Mollie's
 * Next-gen event payload (a deterministic JSON shape with no
 * whitespace), `JSON.stringify(parsedBody)` is byte-equivalent to the
 * wire payload.
 */
export function canonicalBodyBytes(req: { body?: unknown; rawBody?: Buffer | string }): Buffer {
  if (req.rawBody) {
    return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody, 'utf8');
  }
  if (req.body === undefined || req.body === null) return Buffer.alloc(0);
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  return Buffer.from(JSON.stringify(req.body), 'utf8');
}

/**
 * Normalise a parsed body to the union shape the rest of the handler
 * works with. Returns:
 *   { format: 'next-gen', type, eventId, payment }   when the body is a Next-gen event we care about
 *   { format: 'classic', id }                        when the body is the legacy id=<tr_xxx> form
 *   { format: 'unknown', reason }                    otherwise
 *
 * Classic webhooks always ship a single payment id — subscription events
 * are not exposed via the classic webhook either, so the resource type is
 * implicit. Next-gen wraps every event in `{ resource: 'event', type,
 * _embedded: { entity: <payment> } }`.
 */
export function parseWebhookBody(rawBody: unknown): ParsedWebhookBody {
  // Classic: a string like 'id=tr_xxx' (form-urlencoded) — or the same
  // parsed as JSON (some senders / proxies attach the JSON form too).
  if (typeof rawBody === 'string') {
    const text = rawBody.trim();
    if (text.startsWith('{')) {
      try {
        return parseWebhookBody(JSON.parse(text));
      } catch {
        // fall through to URLSearchParams below
      }
    }
    const params = new URLSearchParams(text);
    const id = params.get('id');
    if (!id) return { format: 'unknown', reason: 'missing-id' };
    return {
      format: 'classic',
      id,
    };
  }

  if (rawBody && typeof rawBody === 'object') {
    // Legacy JSON form: only the payment resource is ever sent by the
    // classic webhook, so a `resource: 'payment'` envelope still means
    // we need to fetch the payment by id.
    const obj = rawBody as Record<string, unknown>;
    if (obj.resource === 'payment' && typeof obj.id === 'string') {
      return {
        format: 'classic',
        id: obj.id,
      };
    }

    // Next-gen webhook envelope.
    if (obj.resource === 'event') {
      const type = typeof obj.type === 'string' ? obj.type : null;
      const eventId = typeof obj.id === 'string' ? obj.id : null;
      const entity = (obj._embedded as { entity?: unknown } | undefined)?.entity;
      let payment: MolliePaymentResource | null = null;
      if (type === 'payment.paid' && entity && typeof entity === 'object') {
        payment = entity as MolliePaymentResource;
      }
      return {
        format: 'next-gen',
        type,
        eventId,
        payment,
      };
    }
  }

  return { format: 'unknown', reason: 'unrecognised-body' };
}

/**
 * Pure handler: persists the donor record for a paid Mollie payment.
 */
export async function handlePaidPayment({
  db,
  payment,
  now = () => new Date(),
}: HandlePaidPaymentDeps): Promise<HandlePaidPaymentResult> {
  const metadata = asMetadata(payment.metadata);
  if (!metadata.displayOnConsent) {
    return { written: false, reason: 'no-consent' };
  }
  if (payment.status !== 'paid' && payment.status !== 'authorized') {
    return { written: false, reason: `status:${payment.status}` };
  }
  if (payment.amount?.currency && payment.amount.currency !== MOLLIE_DONATION_CURRENCY) {
    return { written: false, reason: 'wrong-currency' };
  }
  const donorName = typeof metadata.donorName === 'string' ? metadata.donorName.trim() : '';
  const isAnonymous = donorName.length === 0;
  const amount = parseEuroAmount(payment.amount);

  const donorId = donorIdForPayment(payment.id, payment.subscriptionId);
  const ref = db.collection('donors').doc(donorId);
  const existing = await ref.get();
  const existingCreatedAt = existing.exists ? existing.get('createdAt') : undefined;

  let order: number;
  if (existing.exists) {
    const existingOrder = existing.get('order');
    if (typeof existingOrder === 'number') {
      order = existingOrder;
    } else {
      order = await nextOrderForNewDonor(db);
    }
  } else {
    order = await nextOrderForNewDonor(db);
  }

  const isSubscriptionPayment = Boolean(payment.subscriptionId);
  const isRecurring =
    payment.sequenceType === 'recurring' ||
    (isSubscriptionPayment && payment.sequenceType === 'first');
  const frequency = isRecurring ? 'monthly' : 'one-time';

  const data: Record<string, unknown> = {
    name: isAnonymous ? null : donorName,
    amount,
    frequency,
    note: null,
    order,
    source: 'mollie',
    mollieConsent: true,
    molliePaymentId: payment.id,
    mollieSubscriptionId: payment.subscriptionId ?? null,
    createdAt: existingCreatedAt ?? { __serverTimestamp: true },
    updatedAt: { __serverTimestamp: true },
  };

  await ref.set(data, { merge: false });
  return { written: true };
}

/**
 * Top-level webhook handler. Looks up the resource mentioned in the
 * webhook body, verifies state==='paid', and writes the donor record.
 */
export async function processMollieWebhook({
  body,
  fetchPayment,
  fetchCustomer,
  db,
  now = () => new Date(),
}: ProcessMollieWebhookDeps): Promise<ProcessMollieWebhookResult> {
  if (body.format === 'unknown') {
    return {
      status: 400,
      body: { error: 'unrecognised webhook body', reason: body.reason },
    };
  }

  // Next-gen: the full payment object is embedded in the event payload,
  // no fetch needed.
  if (body.format === 'next-gen') {
    if (!body.payment) {
      return {
        status: 200,
        body: { received: true, action: 'ignored', reason: body.type },
      };
    }
    const payment = body.payment;
    if (payment.status !== 'paid') {
      return {
        status: 200,
        body: { received: true, action: 'ignored', reason: payment.status },
      };
    }
    if (payment.subscriptionId && payment.sequenceType && payment.sequenceType !== 'first') {
      return { status: 200, body: { received: true, action: 'skip-recurring' } };
    }
    await enrichPaymentFromCustomerIfNeeded({ payment, fetchCustomer });
    const result = await handlePaidPayment({ db, payment, now });
    return { status: 200, body: { received: true, ...result } };
  }

  // Classic: only the id is shipped; fetch the full payment from Mollie.
  if (body.format === 'classic') {
    if (!body.id || !fetchPayment) {
      return { status: 400, body: { error: 'missing-id' } };
    }
    try {
      const payment = await fetchPayment(body.id);
      if (payment.status !== 'paid') {
        return {
          status: 200,
          body: { received: true, action: 'ignored', reason: payment.status },
        };
      }
      if (payment.subscriptionId && payment.sequenceType && payment.sequenceType !== 'first') {
        return { status: 200, body: { received: true, action: 'skip-recurring' } };
      }
      await enrichPaymentFromCustomerIfNeeded({ payment, fetchCustomer });
      const result = await handlePaidPayment({ db, payment, now });
      return { status: 200, body: { received: true, ...result } };
    } catch (err) {
      return {
        status: 500,
        body: { error: 'fetch-failed', message: (err as Error)?.message ?? 'unknown' },
      };
    }
  }

  return { status: 400, body: { error: 'unsupported format' } };
}

/**
 * When the payment carries no donor metadata — typical for the first
 * payment of a subscription, which Mollie creates automatically — pull
 * `displayOnConsent` and the donor name from the underlying customer.
 */
async function enrichPaymentFromCustomerIfNeeded({
  payment,
  fetchCustomer,
}: {
  payment: MolliePaymentResource;
  fetchCustomer?: CustomerFetcher;
}): Promise<void> {
  if (!fetchCustomer) return;
  const metadata = asMetadata(payment.metadata);
  const hasConsent = metadata.displayOnConsent === true;
  const hasName = typeof metadata.donorName === 'string' && metadata.donorName.trim().length > 0;
  if (hasConsent && hasName) return;
  if (!payment.customerId) return;
  const customer = await fetchCustomer(payment.customerId).catch(() => null);
  if (!customer) return;
  const customerMeta = asMetadata(customer.metadata);
  payment.metadata = {
    ...customerMeta,
    ...metadata,
    displayOnConsent: hasConsent ? metadata.displayOnConsent : customerMeta.displayOnConsent,
    donorName: hasName
      ? metadata.donorName
      : typeof customer.name === 'string' && customer.name.trim().length > 0
        ? customer.name.trim()
        : metadata.donorName,
  };
  if (!payment.customerId && customer.id) payment.customerId = customer.id;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MolliePaymentResource {
  id: string;
  status: string;
  amount?: { value?: string; currency?: string };
  metadata?: Record<string, unknown> | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  sequenceType?: string | null;
}

export interface MollieCustomerResource {
  id: string;
  name?: string;
  metadata?: Record<string, unknown> | null;
}

export type PaymentFetcher = (id: string) => Promise<MolliePaymentResource>;
export type CustomerFetcher = (id: string) => Promise<MollieCustomerResource | null>;

export type NextGenEventType = string;

export interface NextGenEventBody {
  format: 'next-gen';
  type: NextGenEventType | null;
  eventId: string | null;
  payment: MolliePaymentResource | null;
}

export interface ClassicWebhookBody {
  format: 'classic';
  id: string;
}

export interface UnknownWebhookBody {
  format: 'unknown';
  reason: string;
}

export type ParsedWebhookBody = NextGenEventBody | ClassicWebhookBody | UnknownWebhookBody;

export interface FirestoreLikeTimestamp {
  seconds?: number;
  nanoseconds?: number;
  toDate?: () => Date;
  __serverTimestamp?: boolean;
}

export interface FirestoreLikeRef {
  get: () => Promise<FirestoreLikeSnapshot>;
  set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
}

export interface FirestoreLikeSnapshot {
  exists: boolean;
  docs?: Array<{ get: (field: string) => unknown }>;
  get: (field: string) => unknown;
}

export interface FirestoreLikeQuery {
  get: () => Promise<FirestoreLikeSnapshot>;
  limit: (count: number) => FirestoreLikeQuery;
}

export interface FirestoreLikeCollection {
  doc: (id: string) => FirestoreLikeRef;
  orderBy: (field: string, direction?: 'asc' | 'desc') => FirestoreLikeQuery;
}

export interface FirestoreLikeDb {
  collection: (name: string) => FirestoreLikeCollection;
}

export interface HandlePaidPaymentDeps {
  db: FirestoreLikeDb;
  payment: MolliePaymentResource;
  now?: () => Date;
}

export interface HandlePaidPaymentResult {
  written: boolean;
  reason?: string;
}

export interface ProcessMollieWebhookDeps {
  body: ParsedWebhookBody;
  fetchPayment?: PaymentFetcher;
  fetchCustomer?: CustomerFetcher;
  db: FirestoreLikeDb;
  now?: () => Date;
}

export interface ProcessMollieWebhookResult {
  status: number;
  body: unknown;
}
