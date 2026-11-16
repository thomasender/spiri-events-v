/**
 * Vereinsmitgliedschaft "Pioniere" (Trello 6af620c0; wizard on /pioniere, flag
 * `app_settings/membership`, data model in clubMembershipLogic.ts).
 *
 *   createMembershipCheckout({ amount, name, consents })  signed in
 *   cancelMembership()                                     signed in, own membership
 *   expireClubMemberships                                  daily: gekündigt -> ended
 *
 * Joining needs a login (no guest accounts from here). The membership only
 * becomes active when the first Mollie payment is paid (mollieWebhookLogic.ts,
 * membership branch); until then `club_memberships/{uid}` is 'pending'.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import { enforceRateLimit } from './rateLimit';
import { readRoleDoc, type RoleDocReader } from './staffRoles';
import { isSuperAdminDoc } from './adminEmails';
import {
  MOLLIE_API_KEY,
  cancelMollieSubscription,
  createMembershipCustomer,
  resolveAppBaseUrl,
  startMembershipCheckout,
} from './mollie';
import { describeError, reportPaymentFailure } from './paymentAlerts';
import {
  MEMBERSHIP_COLLECTION,
  MEMBERSHIP_CURRENCY,
  MEMBERSHIP_REQUIRED_CONSENTS,
  MEMBERSHIP_SETTINGS_DOC,
  MIN_MEMBERSHIP_AMOUNT,
  formatMembershipAmount,
  hasAllMembershipConsents,
  isMembershipDueToEnd,
  isMembershipRunning,
  isValidMembershipAmount,
  normalizeMemberName,
  parseMembershipSettings,
  type MembershipSettings,
} from './clubMembershipLogic';
import { viennaDateString, type MembershipNotice } from './mollieWebhookLogic';
import { buildMembershipWelcomePayload, type EmailPayload } from './emailTemplates';
import { inviteBaseUrl } from './moderatorInvites';
import {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_EU_BASE,
  MAILGUN_FROM,
  MAILGUN_REPLY_TO,
  isMailgunDryRun,
  sendMailgunMessage,
} from './mailgun';

if (getApps().length === 0) {
  initializeApp();
}

const REGION = 'europe-west3';
const CHECKOUT_LIMIT = { maxAttempts: 5, windowMs: 10 * 60 * 1000 };

type Doc = Record<string, unknown>;

/** Shown to the person; the raw Mollie error goes to the logs and the Verwaltung. */
export const MEMBERSHIP_START_FAILED_MESSAGE =
  'Die Anmeldung konnte gerade nicht gestartet werden. Bitte versuche es später erneut.';

export interface MembershipUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

export interface MembershipMollie {
  createCustomer(params: { name: string; email: string | null; uid: string }): Promise<{
    id: string;
  }>;
  startCheckout(params: {
    customerId: string;
    amount: number;
    uid: string;
    name: string;
  }): Promise<{ checkoutUrl: string; paymentId: string }>;
  cancelSubscription(customerId: string, subscriptionId: string): Promise<void>;
}

export interface MembershipDeps {
  now: () => number;
  readRoleDoc: RoleDocReader;
  readSettings: () => Promise<MembershipSettings>;
  getMembership: (uid: string) => Promise<Doc | null>;
  /** Replaces the doc (merge=false) or merges into it. */
  setMembership: (uid: string, data: Doc, options: { merge: boolean }) => Promise<void>;
  getUser: (uid: string) => Promise<MembershipUser | null>;
  /** Null when MOLLIE_API_KEY is not configured. */
  mollie: MembershipMollie | null;
  reportFailure: typeof reportPaymentFailure;
  enforceRateLimit: typeof enforceRateLimit;
  /** Sets `clubMember` on users/{uid}/publicProfile/data; false when there is no profile. */
  setClubMemberFlag: (uid: string, value: boolean) => Promise<boolean>;
  /** Bell entry for the Super-Admins only (create-once per id). */
  notifySuperAdmins: (id: string, text: string) => Promise<void>;
  /** Every membership with status 'cancelled' (for the daily expiry). */
  listCancelledMemberships: () => Promise<Array<{ uid: string; data: Doc }>>;
}

interface CallableRequest {
  auth?: { uid?: string } | null;
  data?: unknown;
  rawRequest?: unknown;
}

async function isSuperAdmin(uid: string, read: RoleDocReader): Promise<boolean> {
  const doc = await read(uid);
  return Boolean(doc) && (doc as Doc).role === 'Admin';
}

/**
 * Who may join under the flag: 'all' everybody signed in, 'admins' only
 * Super-Admins (testing), 'off' nobody. While no Statuten link is set, only
 * Super-Admins may go on (testing; the wizard shows a placeholder notice).
 */
export async function assertMembershipOpen(
  uid: string,
  settings: MembershipSettings,
  read: RoleDocReader
): Promise<void> {
  if (settings.mode === 'off') {
    throw new HttpsError('failed-precondition', 'Membership sign-up is not open.');
  }
  const admin =
    settings.mode === 'admins' || !settings.statutesUrl ? await isSuperAdmin(uid, read) : false;
  if (settings.mode === 'admins' && !admin) {
    throw new HttpsError('failed-precondition', 'Membership sign-up is not open.');
  }
  if (!settings.statutesUrl && !admin) {
    throw new HttpsError('failed-precondition', 'Statutes are not published yet.');
  }
}

export function todayOf(nowMs: number): string {
  return viennaDateString(new Date(nowMs));
}

export async function createMembershipCheckoutHandler(
  request: CallableRequest,
  deps: MembershipDeps,
  appBaseUrl: string
): Promise<{ checkoutUrl: string }> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
  deps.enforceRateLimit(request as never, 'membership', CHECKOUT_LIMIT);

  const data = (request.data ?? {}) as {
    amount?: unknown;
    name?: unknown;
    consents?: unknown;
    statutesVersion?: unknown;
  };
  if (!isValidMembershipAmount(data.amount)) {
    throw new HttpsError(
      'invalid-argument',
      `amount must be at least ${MIN_MEMBERSHIP_AMOUNT.toFixed(2)} EUR`
    );
  }
  const amount = data.amount;
  const name = normalizeMemberName(data.name);
  if (!name) throw new HttpsError('invalid-argument', 'Please enter your name.');
  if (!hasAllMembershipConsents(data.consents)) {
    throw new HttpsError('invalid-argument', 'Consents are missing.');
  }

  const settings = await deps.readSettings();
  await assertMembershipOpen(uid, settings, deps.readRoleDoc);

  const now = deps.now();
  const existing = await deps.getMembership(uid);
  if (isMembershipRunning(existing, todayOf(now))) {
    throw new HttpsError('already-exists', 'Already a member.');
  }

  const user = await deps.getUser(uid);
  if (!user) throw new HttpsError('not-found', 'No account with this uid.');
  const email = typeof user.email === 'string' && user.email ? user.email.toLowerCase() : null;

  if (!deps.mollie) {
    logger.error('MOLLIE_API_KEY secret is not configured');
    throw new HttpsError('internal', 'payment provider is not configured');
  }
  try {
    const customer = await deps.mollie.createCustomer({ name, email, uid });
    const checkout = await deps.mollie.startCheckout({
      customerId: customer.id,
      amount,
      uid,
      name,
    });
    const at = new Date(now);
    await deps.setMembership(
      uid,
      {
        uid,
        status: 'pending',
        source: 'web',
        name,
        email,
        amount,
        currency: MEMBERSHIP_CURRENCY,
        mollieCustomerId: customer.id,
        mollieSubscriptionId: null,
        pendingPaymentId: checkout.paymentId,
        consents: [...MEMBERSHIP_REQUIRED_CONSENTS],
        statutesAcceptedAt: at,
        statutesVersion: settings.statutesVersion || settings.statutesUrl || null,
        statutesUrl: settings.statutesUrl || null,
        privacyAcceptedAt: at,
        paidUntil: null,
        createdAt: at,
        updatedAt: at,
      },
      { merge: false }
    );
    return { checkoutUrl: checkout.checkoutUrl };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error('Mollie membership start failed', { error: describeError(err) });
    await deps.reportFailure({
      step: 'mitgliedschaft-start',
      error: err,
      amount,
      currency: MEMBERSHIP_CURRENCY,
      pageUrl: `${appBaseUrl}/pioniere`,
    });
    throw new HttpsError('unavailable', MEMBERSHIP_START_FAILED_MESSAGE);
  }
}

// ── Kündigung ────────────────────────────────────────────────────────────

export interface CancelMembershipResult {
  status: 'cancelled' | 'ended';
  /** Web members: the membership runs until this day (YYYY-MM-DD). */
  paidUntil: string | null;
  alreadyCancelled: boolean;
}

function memberLabel(data: Doc): string {
  const name = typeof data.name === 'string' && data.name ? data.name : null;
  const email = typeof data.email === 'string' && data.email ? data.email : null;
  return name ?? email ?? 'ohne Namen';
}

/**
 * The member cancels in the profile. Web: the Mollie subscription is deleted, the
 * membership stays 'cancelled' (and `clubMember` stays) until `paidUntil`, then
 * expireClubMemberships ends it. Manual (paper form, no Mollie): ends at once.
 * The Super-Admins get a bell notice.
 */
export async function cancelMembershipHandler(
  request: CallableRequest,
  deps: MembershipDeps
): Promise<CancelMembershipResult> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
  deps.enforceRateLimit(request as never, 'membershipCancel', CHECKOUT_LIMIT);

  const now = deps.now();
  const today = todayOf(now);
  const membership = await deps.getMembership(uid);
  if (membership?.status === 'cancelled' && isMembershipRunning(membership, today)) {
    return {
      status: 'cancelled',
      paidUntil: (membership.paidUntil as string) ?? null,
      alreadyCancelled: true,
    };
  }
  if (!membership || membership.status !== 'active') {
    throw new HttpsError('not-found', 'No running membership.');
  }

  const at = new Date(now);
  const paidUntil =
    typeof membership.paidUntil === 'string' && membership.paidUntil > today
      ? membership.paidUntil
      : null;
  const customerId =
    typeof membership.mollieCustomerId === 'string' ? membership.mollieCustomerId : '';
  const subscriptionId =
    typeof membership.mollieSubscriptionId === 'string' ? membership.mollieSubscriptionId : '';

  if (customerId && subscriptionId) {
    if (!deps.mollie) {
      logger.error('MOLLIE_API_KEY secret is not configured');
      throw new HttpsError('internal', 'payment provider is not configured');
    }
    try {
      await deps.mollie.cancelSubscription(customerId, subscriptionId);
    } catch (err) {
      logger.error('Mollie membership cancel failed', { uid, error: describeError(err) });
      await deps.reportFailure({
        step: 'mitgliedschaft-kuendigen',
        error: err,
        ids: { customer: customerId, subscription: subscriptionId },
      });
      throw new HttpsError(
        'unavailable',
        'Die Kündigung hat gerade nicht geklappt. Bitte versuche es später noch einmal.'
      );
    }
  }

  // Runs on until the paid month is over; nothing paid ahead (or a paper
  // membership) ends today.
  const status: 'cancelled' | 'ended' = paidUntil ? 'cancelled' : 'ended';
  await deps.setMembership(
    uid,
    {
      status,
      cancelledAt: at,
      ...(status === 'ended' ? { endedAt: at } : {}),
      updatedAt: at,
    },
    { merge: true }
  );
  if (status === 'ended') await deps.setClubMemberFlag(uid, false);

  try {
    const until = paidUntil ? `, läuft bis ${paidUntil}` : ', sofort beendet';
    await deps.notifySuperAdmins(
      `membership_cancel_${uid}_${today}`,
      `Pioniere-Mitgliedschaft gekündigt: ${memberLabel(membership)}${until}`
    );
  } catch (err) {
    logger.error('membership cancel notice failed', { uid, err });
  }
  return { status, paidUntil, alreadyCancelled: false };
}

/**
 * Daily: gekündigt memberships whose paid month is over become 'ended' and
 * lose `clubMember` on the public profile.
 */
export async function expireClubMembershipsHandler(deps: MembershipDeps): Promise<number> {
  const now = deps.now();
  const today = todayOf(now);
  let ended = 0;
  for (const { uid, data } of await deps.listCancelledMemberships()) {
    if (!isMembershipDueToEnd(data, today)) continue;
    const at = new Date(now);
    await deps.setMembership(uid, { status: 'ended', endedAt: at, updatedAt: at }, { merge: true });
    await deps.setClubMemberFlag(uid, false);
    ended += 1;
  }
  return ended;
}

// ── Firebase wiring ──────────────────────────────────────────────────────

export async function sendViaMailgun(payload: EmailPayload): Promise<void> {
  if (isMailgunDryRun(process.env)) {
    logger.info('MAILGUN dry-run: would send membership mail', {
      to: payload.to,
      subject: payload.subject,
    });
    return;
  }
  const apiKey = MAILGUN_API_KEY.value();
  const domain = MAILGUN_DOMAIN.value();
  const from = MAILGUN_FROM.value();
  if (!apiKey || !domain || !from) {
    throw new Error('Mailgun credentials are not configured.');
  }
  await sendMailgunMessage(MAILGUN_EU_BASE, {
    apiKey,
    domain,
    from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    replyTo: MAILGUN_REPLY_TO.value() || undefined,
  });
}

export const MEMBERSHIP_MAIL_SECRETS = [
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_FROM,
  MAILGUN_REPLY_TO,
];

async function readMembershipSettings(): Promise<MembershipSettings> {
  const snap = await getFirestore().doc(`app_settings/${MEMBERSHIP_SETTINGS_DOC}`).get();
  return parseMembershipSettings(snap.exists ? snap.data() : null);
}

export function firestoreMembershipDeps(apiKey?: string, appBaseUrl = ''): MembershipDeps {
  const db = getFirestore();
  const col = db.collection(MEMBERSHIP_COLLECTION);
  return {
    now: () => Date.now(),
    readRoleDoc,
    readSettings: readMembershipSettings,
    async getMembership(uid) {
      const snap = await col.doc(uid).get();
      return snap.exists ? (snap.data() ?? {}) : null;
    },
    async setMembership(uid, data, options) {
      await col.doc(uid).set(data, { merge: options.merge });
    },
    async getUser(uid) {
      try {
        const u = await getAuth().getUser(uid);
        return { uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null };
      } catch (err) {
        if ((err as { code?: string })?.code === 'auth/user-not-found') return null;
        throw err;
      }
    },
    mollie: apiKey
      ? {
          createCustomer: (params) => createMembershipCustomer(apiKey, params),
          startCheckout: (params) => startMembershipCheckout(apiKey, { ...params, appBaseUrl }),
          cancelSubscription: (customerId, subscriptionId) =>
            cancelMollieSubscription(apiKey, customerId, subscriptionId),
        }
      : null,
    reportFailure: reportPaymentFailure,
    enforceRateLimit,
    async setClubMemberFlag(uid, value) {
      const ref = db.doc(`users/${uid}/publicProfile/data`);
      const snap = await ref.get();
      if (!snap.exists) return false;
      if (snap.get('clubMember') !== value) await ref.set({ clubMember: value }, { merge: true });
      return true;
    },
    notifySuperAdmins: notifySuperAdminsOfMembership,
    async listCancelledMemberships() {
      const snap = await col.where('status', '==', 'cancelled').get();
      return snap.docs.map((d) => ({ uid: d.id, data: d.data() }));
    },
  };
}

export const createMembershipCheckout = onCall(
  { region: REGION, secrets: [MOLLIE_API_KEY], cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('createMembershipCheckout', request);
    const appBaseUrl = resolveAppBaseUrl(request);
    return createMembershipCheckoutHandler(
      request,
      firestoreMembershipDeps(MOLLIE_API_KEY.value(), appBaseUrl),
      appBaseUrl
    );
  }
);

export const cancelMembership = onCall(
  { region: REGION, secrets: [MOLLIE_API_KEY], cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('cancelMembership', request);
    const result = await cancelMembershipHandler(
      request,
      firestoreMembershipDeps(MOLLIE_API_KEY.value())
    );
    logger.info('cancelMembership', { uid: request.auth?.uid, status: result.status });
    return result;
  }
);

export const expireClubMemberships = onSchedule(
  { region: REGION, schedule: 'every day 04:10', timeZone: 'Europe/Vienna' },
  async () => {
    const ended = await expireClubMembershipsHandler(firestoreMembershipDeps());
    logger.info('expireClubMemberships', { ended });
  }
);

// ── Webhook helpers (mollieWebhook.ts) ───────────────────────────────────

/** uid of the membership a Mollie subscription belongs to, or null. */
export async function findMembershipUidBySubscription(
  subscriptionId: string
): Promise<string | null> {
  const snap = await getFirestore()
    .collection(MEMBERSHIP_COLLECTION)
    .where('mollieSubscriptionId', '==', subscriptionId)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

/** "Neues Vereinsmitglied (Pioniere): Anna, 12,90 € im Monat" */
export function membershipNoticeText(notice: Pick<MembershipNotice, 'name' | 'amount'>): string {
  return `Neues Vereinsmitglied (Pioniere): ${notice.name || 'ohne Namen'}, ${formatMembershipAmount(notice.amount)} im Monat`;
}

/**
 * Bell entries `users/{uid}/mentions/{id}` (kind 'membership') for the
 * Super-Admins only; create() makes a repeated call a no-op.
 */
export async function notifySuperAdminsOfMembership(id: string, text: string): Promise<void> {
  const db = getFirestore();
  const roles = await db.collection('admin_users').get();
  for (const doc of roles.docs) {
    if (!isSuperAdminDoc(doc.data())) continue;
    try {
      await db.doc(`users/${doc.id}/mentions/${id}`).create({
        kind: 'membership',
        eventId: null,
        eventSlug: '',
        eventTitle: '',
        messageId: id,
        fromUid: '',
        fromName: '',
        excerpt: text,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      if ((err as { code?: unknown })?.code === 6) continue; // already exists
      logger.error('membership notice not written', { uid: doc.id, id, err });
    }
  }
}

/** New member (first payment paid): notice to the Super-Admins, confirmation mail. */
export async function notifyNewMember(notice: MembershipNotice): Promise<void> {
  await notifySuperAdminsOfMembership(
    `membership_${notice.paymentId}`,
    membershipNoticeText(notice)
  );
  let email = notice.email;
  if (!email) {
    try {
      email = (await getAuth().getUser(notice.uid)).email ?? null;
    } catch {
      email = null;
    }
  }
  if (!email) return;
  try {
    await sendViaMailgun(
      buildMembershipWelcomePayload({
        recipient: email,
        name: notice.name,
        amount: notice.amount,
        nextPaymentDate: notice.paidUntil,
        baseUrl: inviteBaseUrl(),
      })
    );
  } catch (err) {
    logger.error('membership welcome mail failed', { uid: notice.uid, err: describeError(err) });
  }
}
