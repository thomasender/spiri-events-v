/**
 * Delivery feedback of the outreach mail (docs/event-import.md, "Delivery and bounces", ticket 11).
 *
 * Mailgun calls a webhook for every delivered / failed / complained message. The mail carries the
 * organizer id as a custom variable (`v:organizerId`), so an event finds its `outreach/mail` doc
 * without an index. Pure: no Firebase imports, so tests/lib/importDelivery.spec.ts runs without
 * anything. The wiring (webhook function, Firestore) is in importConsentFunctions.ts.
 *
 * Rules:
 * - A hard bounce (permanent failure) puts the address on the blocklist (hash only, reason
 *   `bounce`). A spam complaint blocks the address and its domain (reason `complaint`).
 * - Only REAL mails count and may block: a bounce of a test mail (our own test address) must never
 *   block an organizer. Test mails only get their `delivery` field filled.
 * - Sending pauses itself (switch off + reason) when a complaint arrives, or when the share of
 *   bounces and complaints among the real mails gets too high.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { blocklistId, normalizeBlocklistValue } from './eventImport';

/** What the outreach log knows about the delivery. Only ever moves "up" (see `rank`). */
export type DeliveryState = 'delivered' | 'bounced' | 'complained';

const RANK: Record<DeliveryState, number> = { delivered: 1, bounced: 2, complained: 3 };

/** Mailgun signs with timestamp + token; an older signature is a replay. */
export const SIGNATURE_MAX_AGE_MS = 15 * 60 * 1000;

/** Pause the sending when bounces + complaints exceed this share of the real mails... */
export const MAX_BAD_RATE = 0.05;
/** ...but only judge it after this many real mails (a single early bounce says nothing). */
export const MIN_SAMPLE_FOR_RATE = 10;
/** A single spam complaint pauses the sending: cold outreach lives on its reputation. */
export const PAUSE_ON_COMPLAINTS = 1;

export interface OutreachStats {
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
}

export const EMPTY_STATS: OutreachStats = { sent: 0, delivered: 0, bounced: 0, complained: 0 };

export interface MailgunSignature {
  timestamp: string;
  token: string;
  signature: string;
}

/** Constant-time check of Mailgun's HMAC-SHA256 (hex) over `timestamp + token`. */
export function verifyMailgunSignature(
  sig: Partial<MailgunSignature> | null | undefined,
  signingKey: string,
  nowMs: number
): { valid: true } | { valid: false; reason: string } {
  if (!signingKey) return { valid: false, reason: 'no-signing-key' };
  if (!sig || !sig.timestamp || !sig.token || !sig.signature) {
    return { valid: false, reason: 'missing-signature' };
  }
  const ts = Number(sig.timestamp) * 1000;
  if (!Number.isFinite(ts) || Math.abs(nowMs - ts) > SIGNATURE_MAX_AGE_MS) {
    return { valid: false, reason: 'stale-timestamp' };
  }
  const expected = createHmac('sha256', signingKey).update(`${sig.timestamp}${sig.token}`).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig.signature, 'hex');
  } catch {
    return { valid: false, reason: 'bad-signature' };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { valid: false, reason: 'bad-signature' };
  }
  return { valid: true };
}

export interface DeliveryEvent {
  state: DeliveryState;
  organizerId: string;
  /** Message id without angle brackets. */
  messageId: string;
  /** Short reason for a bounce / complaint, from Mailgun. */
  reason: string;
}

type Doc = Record<string, unknown>;
const isObj = (v: unknown): v is Doc => !!v && typeof v === 'object' && !Array.isArray(v);

/** "<abc@mg.x>" -> "abc@mg.x" */
export function stripMessageId(id: unknown): string {
  return typeof id === 'string' ? id.trim().replace(/^<|>$/g, '') : '';
}

/**
 * The relevant part of a Mailgun webhook body, or null for everything we ignore: other events
 * (opened, clicked are off anyway), temporary failures (Mailgun retries those itself), mails
 * without our organizer variable.
 */
export function parseDeliveryEvent(body: unknown): DeliveryEvent | null {
  if (!isObj(body) || !isObj(body['event-data'])) return null;
  const ev = body['event-data'] as Doc;
  const vars = isObj(ev['user-variables']) ? (ev['user-variables'] as Doc) : {};
  const organizerId = typeof vars.organizerId === 'string' ? vars.organizerId : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(organizerId)) return null;

  const msg = isObj(ev.message) ? (ev.message as Doc) : {};
  const headers = isObj(msg.headers) ? (msg.headers as Doc) : {};
  const messageId = stripMessageId(headers['message-id']);

  let state: DeliveryState | null = null;
  if (ev.event === 'delivered') state = 'delivered';
  else if (ev.event === 'complained') state = 'complained';
  else if (ev.event === 'failed' && ev.severity === 'permanent') state = 'bounced';
  if (!state) return null;

  const status = isObj(ev['delivery-status']) ? (ev['delivery-status'] as Doc) : {};
  const reasonRaw =
    (typeof status.message === 'string' && status.message) ||
    (typeof status.description === 'string' && status.description) ||
    (typeof ev.reason === 'string' && ev.reason) ||
    '';
  return { state, organizerId, messageId, reason: reasonRaw.slice(0, 300) };
}

export interface DeliveryPlan {
  outreachPatch: Doc;
  /** Blocklist doc ids to write (hashes). */
  blocklist: Array<{ id: string; kind: 'email' | 'domain' }>;
  statsDelta: Partial<OutreachStats>;
  reason: string;
}

/**
 * What a delivery event changes, or null when it changes nothing: the event belongs to another
 * message than the logged one (an older mail), or it does not move the state "up" (Mailgun
 * retries webhooks; "delivered" after "bounced" is noise).
 */
export function planDelivery(
  event: DeliveryEvent,
  outreach: { messageId?: unknown; test?: unknown; delivery?: unknown } | null,
  organizer: { contactEmail?: unknown; website?: unknown } | null,
  nowMs: number
): DeliveryPlan | null {
  if (!outreach) return null;
  const logged = stripMessageId(outreach.messageId);
  if (logged && event.messageId && logged !== event.messageId) return null;
  const current = outreach.delivery as DeliveryState | undefined;
  if (current && RANK[current] >= RANK[event.state]) return null;

  const real = outreach.test !== true;
  const patch: Doc = { delivery: event.state, deliveryAt: new Date(nowMs) };
  if (event.state !== 'delivered') patch.deliveryReason = event.reason;

  const plan: DeliveryPlan = {
    outreachPatch: patch,
    blocklist: [],
    statsDelta: {},
    reason: event.state === 'complained' ? 'complaint' : 'bounce',
  };
  if (!real) return plan; // a test mail: log only

  // Count each state once per message; going up (delivered -> complained) moves the count.
  if (current) plan.statsDelta[current] = -1;
  plan.statsDelta[event.state] = (plan.statsDelta[event.state] ?? 0) + 1;

  if (event.state !== 'delivered') {
    const email = normalizeBlocklistValue(String(organizer?.contactEmail ?? ''));
    if (email) plan.blocklist.push({ id: blocklistId(email), kind: 'email' });
    if (event.state === 'complained') {
      const domain = normalizeBlocklistValue(String(organizer?.website ?? ''));
      if (domain) plan.blocklist.push({ id: blocklistId(domain), kind: 'domain' });
    }
  }
  return plan;
}

/** Stats after applying a delta (never below 0). */
export function applyStatsDelta(
  stats: OutreachStats,
  delta: Partial<OutreachStats>
): OutreachStats {
  const next = { ...stats };
  for (const key of Object.keys(delta) as Array<keyof OutreachStats>) {
    next[key] = Math.max(0, (next[key] ?? 0) + (delta[key] ?? 0));
  }
  return next;
}

/** Bounces + complaints as a share of the real mails sent; 0 without mails. */
export function badRate(stats: OutreachStats): number {
  return stats.sent > 0 ? (stats.bounced + stats.complained) / stats.sent : 0;
}

/** Why the sending must pause now, or null. */
export function pauseReason(stats: OutreachStats): string | null {
  if (stats.complained >= PAUSE_ON_COMPLAINTS) {
    return `Spam-Beschwerde erhalten (${stats.complained}). Bitte Absender-Reputation in Mailgun prüfen, bevor du weitersendest.`;
  }
  if (stats.sent >= MIN_SAMPLE_FOR_RATE && badRate(stats) > MAX_BAD_RATE) {
    const pct = Math.round(badRate(stats) * 100);
    return `Zu viele nicht zugestellte Mails (${stats.bounced} von ${stats.sent}, ${pct} %). Bitte die Adressen prüfen, bevor du weitersendest.`;
  }
  return null;
}

export interface DeliveryDeps {
  now: () => number;
  signingKey: string;
  getOutreach: (organizerId: string) => Promise<Doc | null>;
  getOrganizer: (
    organizerId: string
  ) => Promise<{ contactEmail?: unknown; website?: unknown } | null>;
  updateOutreach: (organizerId: string, patch: Doc) => Promise<void>;
  addBlocklist: (entries: DeliveryPlan['blocklist'], reason: string) => Promise<void>;
  /** Adds the delta to the running totals and returns the new totals. */
  bumpStats: (delta: Partial<OutreachStats>) => Promise<OutreachStats>;
  /** Switch the real sending off and remember why. */
  pauseSending: (reason: string) => Promise<void>;
  log: (message: string, data?: Doc) => void;
}

export interface WebhookResult {
  status: number;
  body: Doc;
}

/**
 * Mailgun webhook, minus the HTTP. 401 for a bad signature (Mailgun then retries and we see it),
 * 200 for everything else, also for events we ignore, so Mailgun does not retry them.
 */
export async function handleDeliveryWebhook(
  body: unknown,
  deps: DeliveryDeps
): Promise<WebhookResult> {
  const sig =
    isObj(body) && isObj(body.signature) ? (body.signature as Partial<MailgunSignature>) : null;
  const check = verifyMailgunSignature(sig, deps.signingKey, deps.now());
  if (!check.valid) {
    deps.log('delivery webhook rejected', { reason: check.reason });
    return { status: 401, body: { error: 'invalid-signature', reason: check.reason } };
  }
  const event = parseDeliveryEvent(body);
  if (!event) return { status: 200, body: { ignored: true } };

  const [outreach, organizer] = await Promise.all([
    deps.getOutreach(event.organizerId),
    deps.getOrganizer(event.organizerId),
  ]);
  const plan = planDelivery(event, outreach, organizer, deps.now());
  if (!plan) return { status: 200, body: { ignored: true } };

  await deps.updateOutreach(event.organizerId, plan.outreachPatch);
  if (plan.blocklist.length > 0) await deps.addBlocklist(plan.blocklist, plan.reason);
  let paused: string | null = null;
  if (Object.keys(plan.statsDelta).length > 0) {
    const stats = await deps.bumpStats(plan.statsDelta);
    paused = pauseReason(stats);
    if (paused) await deps.pauseSending(paused);
  }
  deps.log('delivery event applied', {
    organizerId: event.organizerId,
    state: event.state,
    blocked: plan.blocklist.length,
    paused: paused !== null,
  });
  return { status: 200, body: { applied: event.state, paused: paused !== null } };
}
