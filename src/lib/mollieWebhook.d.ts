/**
 * Type declarations for the pure Mollie webhook helpers.
 */

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
  /** Embedded payment resource when type is `payment.paid`, else null. */
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
  docs?: Array<{
    get: (field: string) => unknown;
  }>;
  get: (field: string) => unknown;
}

export interface FirestoreLikeQuery {
  get: () => Promise<FirestoreLikeSnapshot>;
}

export interface FirestoreLikeCollection {
  doc: (id: string) => FirestoreLikeRef;
  orderBy: (field: string, direction?: 'asc' | 'desc') => FirestoreLikeQuery;
  limit: (count: number) => FirestoreLikeQuery;
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

export interface VerifySignatureDeps {
  rawBody: string | Buffer;
  signature: string | null;
  secret: string | null;
}

export interface VerifySignatureResult {
  valid: boolean;
  skipped: boolean;
  reason?: string;
}

export const DONOR_NEXT_ORDER_STEP: number;
export const MOLLIE_DONATION_CURRENCY: string;
export const NEXT_GEN_SIGNATURE_HEADER: string;

export function verifyMollieSignature(deps: VerifySignatureDeps): VerifySignatureResult;
export function parseWebhookBody(rawBody: unknown): ParsedWebhookBody;
export function donorIdForPayment(paymentId: string, subscriptionId?: string | null): string;
export function handlePaidPayment(deps: HandlePaidPaymentDeps): Promise<HandlePaidPaymentResult>;
export function processMollieWebhook(
  deps: ProcessMollieWebhookDeps
): Promise<ProcessMollieWebhookResult>;
