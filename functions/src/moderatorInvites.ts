/**
 * Inviting Regions-Moderator:innen by e-mail (Trello 6ae5aa68; UI: tab
 * "Moderation" -> "Per E-Mail einladen", onboarding wizard on /einladung).
 *
 *   adminCreateModeratorInvite({ email, regionIds, sendEmail? })  Super-Admin
 *   adminListModeratorInvites()                                  Super-Admin
 *   adminRevokeModeratorInvite({ inviteId })                     Super-Admin
 *   getModeratorInvite({ token })                                anyone (rate-limited)
 *   acceptModeratorInvite({ token, consents, signatureName, textVersion })  signed in
 *
 * Security model:
 * - The link carries a random token (32 bytes, base64url, like the calendar
 *   feed token). Only its SHA-256 is stored: `moderator_invites/{sha256}`. The
 *   collection is server-only (firestore.rules denies every client access).
 * - An invite is valid for 14 days, used once, and can be revoked. "Erneut
 *   senden" / a new link creates a new invite and revokes the open ones for the
 *   same address, so an older link stops working.
 * - Accepting needs a login whose account e-mail equals the invited address
 *   (case-insensitive); the token alone is not enough. Super-Admins are never
 *   changed (shared role logic from adminModerators.ts). Existing moderator
 *   regions are kept: the new role is the union.
 * - Consents, typed name and text version are stored on the invite and in the
 *   `admin_audit_log` entry (via: 'invite'), never in admin_users.
 */
import { createHash, randomBytes } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import {
  AUDIT_LOG_COLLECTION,
  assertNotSuperAdminUser,
  hasSameModeratorRegions,
  moderatorRoleDoc,
  moderatorSnapshotOrRefuse,
  type AuditEntry,
  type TargetUser,
} from './adminModerators';
import {
  assertSuperAdmin,
  readRoleDoc,
  validateModeratorRegionIds,
  type RoleDocReader,
} from './staffRoles';
import { REGION_IDS, isRegionId, regionNameOf } from './regions';
import { enforceRateLimit } from './rateLimit';
import {
  APP_BASE_URL,
  buildModeratorInviteAcceptedPayload,
  buildModeratorInvitePayload,
  type EmailPayload,
} from './emailTemplates';
import { getAdminEmails } from './adminEmails';
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

export const INVITES_COLLECTION = 'moderator_invites';
export const INVITE_VALID_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Version of the onboarding texts the moderator agrees to. KEEP IN SYNC with
 * MODERATOR_ONBOARDING_TEXT_VERSION / MODERATOR_ONBOARDING_CONSENTS in
 * src/utils/moderatorOnboardingText.js (tests/lib/moderatorInvites.spec.ts
 * compares both). Bump it whenever the meaning of the texts changes.
 */
export const ONBOARDING_TEXT_VERSION = 1;
export const REQUIRED_CONSENTS: readonly string[] = ['haltung', 'richtlinien', 'pruefung'];

export const SIGNATURE_MIN = 2;
export const SIGNATURE_MAX = 80;

const READ_LIMIT = { maxAttempts: 30, windowMs: 10 * 60 * 1000 };
const ACCEPT_LIMIT = { maxAttempts: 10, windowMs: 10 * 60 * 1000 };
const ADMIN_LIMIT = { maxAttempts: 30, windowMs: 10 * 60 * 1000 };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const INVITE_ID_PATTERN = /^[0-9a-f]{64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STAGING_PROJECT_ID = 'tribe-vbg-staging';

export type InviteStatus = 'pending' | 'accepted' | 'revoked';

/** One `moderator_invites` doc, times as epoch millis. */
export interface InviteRecord {
  email: string;
  regionIds: string[];
  invitedBy: string;
  createdAtMs: number;
  expiresAtMs: number;
  status: InviteStatus;
  acceptedUid?: string | null;
  acceptedAtMs?: number | null;
  consents?: string[];
  signatureName?: string | null;
  textVersion?: number | null;
}

/** 32 random bytes, base64url: 43 characters. */
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Doc id of an invite: the hex SHA-256 of its token. */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function assertInviteToken(raw: unknown): string {
  if (typeof raw !== 'string' || !TOKEN_PATTERN.test(raw)) {
    throw new HttpsError('invalid-argument', 'Invalid invitation link.');
  }
  return raw;
}

function assertInviteId(raw: unknown): string {
  if (typeof raw !== 'string' || !INVITE_ID_PATTERN.test(raw)) {
    throw new HttpsError('invalid-argument', 'Invalid invitation id.');
  }
  return raw;
}

export function normalizeInviteEmail(raw: unknown): string {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email) || email.length > 200) {
    throw new HttpsError('invalid-argument', 'A valid email address is required.');
  }
  return email;
}

/** Site the link points to: the staging site when the functions run there. */
export function inviteBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return env.GCLOUD_PROJECT === STAGING_PROJECT_ID
    ? `https://${STAGING_PROJECT_ID}.web.app`
    : APP_BASE_URL;
}

export function inviteUrlFor(token: string, baseUrl: string = inviteBaseUrl()): string {
  return `${baseUrl}/einladung?t=${encodeURIComponent(token)}`;
}

/** Known region ids of an invite, canonical order (a region removed since is dropped). */
function inviteRegionIds(invite: InviteRecord): string[] {
  return REGION_IDS.filter((id) => invite.regionIds.includes(id));
}

const regionNames = (ids: readonly string[]): string[] => ids.map((id) => regionNameOf(id) ?? id);

/** YYYY-MM-DD of an instant in Vienna (for "gilt bis ..."). */
function viennaDate(ms: number): string {
  return new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
}

export function isInviteExpired(invite: InviteRecord, now: number): boolean {
  return invite.expiresAtMs <= now;
}

export type PublicInviteState = 'pending' | 'accepted' | 'revoked' | 'expired';

export function publicInviteState(invite: InviteRecord, now: number): PublicInviteState {
  if (invite.status === 'accepted') return 'accepted';
  if (invite.status === 'revoked') return 'revoked';
  return isInviteExpired(invite, now) ? 'expired' : 'pending';
}

// ── Dependencies (injected, so the handlers are unit-tested without Firebase) ──

export interface InviteTransaction {
  getInvite(id: string): Promise<InviteRecord | null>;
  getRoleDoc(uid: string): Promise<Record<string, unknown> | null>;
  setModerator(
    uid: string,
    data: { regionIds: string[]; email: string | null; updatedBy: string }
  ): void;
  markAccepted(
    id: string,
    data: { acceptedUid: string; consents: string[]; signatureName: string; textVersion: number }
  ): void;
  addAuditEntry(entry: AuditEntry): void;
}

export interface InviteDeps {
  readRoleDoc: RoleDocReader;
  now: () => number;
  generateToken: () => string;
  baseUrl: string;
  createInvite: (id: string, invite: InviteRecord) => Promise<void>;
  getInvite: (id: string) => Promise<InviteRecord | null>;
  listPendingInvites: () => Promise<Array<{ id: string; invite: InviteRecord }>>;
  revokeInvite: (id: string, revokedBy: string) => Promise<void>;
  getUser: (uid: string) => Promise<TargetUser | null>;
  getUserByEmail: (email: string) => Promise<TargetUser | null>;
  runTransaction: <T>(fn: (tx: InviteTransaction) => Promise<T>) => Promise<T>;
  /** Sends one mail; throws on failure. */
  sendMail: (payload: EmailPayload) => Promise<void>;
  /** Addresses of the Super-Admins (for "Einladung angenommen"). */
  getSuperAdminEmails: () => Promise<string[]>;
  enforceRateLimit: typeof enforceRateLimit;
}

interface CallableRequest {
  auth?: { uid?: string } | null;
  data?: unknown;
  rawRequest?: unknown;
}

// ── Super-Admin: create, list, revoke ─────────────────────────────────────

export interface CreateInviteResult {
  inviteId: string;
  inviteUrl: string;
  expiresAt: string;
  emailSent: boolean;
}

export async function createModeratorInviteHandler(
  request: CallableRequest,
  deps: InviteDeps
): Promise<CreateInviteResult> {
  const actorUid = request.auth?.uid;
  await assertSuperAdmin(actorUid, deps.readRoleDoc);
  deps.enforceRateLimit(request as never, 'moderatorInviteAdmin', ADMIN_LIMIT);

  const data = (request.data ?? {}) as {
    email?: unknown;
    regionIds?: unknown;
    sendEmail?: unknown;
  };
  const email = normalizeInviteEmail(data.email);
  const regionIds = validateModeratorRegionIds(data.regionIds);
  if (regionIds.length === 0) {
    throw new HttpsError('invalid-argument', 'Choose at least one region.');
  }
  const sendEmail = data.sendEmail !== false;

  // An existing account with this address must not be a Super-Admin or the caller.
  const existing = await deps.getUserByEmail(email);
  if (existing) {
    if (existing.uid === actorUid) {
      throw new HttpsError('failed-precondition', 'You cannot change your own role.');
    }
    assertNotSuperAdminUser(existing);
    moderatorSnapshotOrRefuse(await deps.readRoleDoc(existing.uid));
  }

  // A new link replaces the open ones for the same address.
  for (const { id, invite } of await deps.listPendingInvites()) {
    if (invite.email === email) await deps.revokeInvite(id, actorUid as string);
  }

  const now = deps.now();
  const token = deps.generateToken();
  const inviteId = hashInviteToken(token);
  const invite: InviteRecord = {
    email,
    regionIds,
    invitedBy: actorUid as string,
    createdAtMs: now,
    expiresAtMs: now + INVITE_VALID_MS,
    status: 'pending',
    acceptedUid: null,
    acceptedAtMs: null,
    consents: [],
    signatureName: null,
    textVersion: null,
  };
  await deps.createInvite(inviteId, invite);
  const inviteUrl = inviteUrlFor(token, deps.baseUrl);

  let emailSent = false;
  if (sendEmail) {
    try {
      await deps.sendMail(
        buildModeratorInvitePayload({
          recipient: email,
          regionNames: regionNames(regionIds),
          inviteUrl,
          expiresAt: viennaDate(invite.expiresAtMs),
        })
      );
      emailSent = true;
    } catch (err) {
      // The invite stays valid; the admin can copy the link instead.
      logger.error('Sending the moderator invitation failed', { inviteId, err });
    }
  }
  return {
    inviteId,
    inviteUrl,
    expiresAt: new Date(invite.expiresAtMs).toISOString(),
    emailSent,
  };
}

export interface InviteListEntry {
  inviteId: string;
  email: string;
  regionIds: string[];
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

export async function listModeratorInvitesHandler(
  request: CallableRequest,
  deps: InviteDeps
): Promise<{ invites: InviteListEntry[] }> {
  await assertSuperAdmin(request.auth?.uid, deps.readRoleDoc);
  const now = deps.now();
  const invites = (await deps.listPendingInvites())
    .filter(({ invite }) => invite.status === 'pending')
    .sort((a, b) => b.invite.createdAtMs - a.invite.createdAtMs)
    .map(({ id, invite }) => ({
      inviteId: id,
      email: invite.email,
      regionIds: inviteRegionIds(invite),
      createdAt: new Date(invite.createdAtMs).toISOString(),
      expiresAt: new Date(invite.expiresAtMs).toISOString(),
      expired: isInviteExpired(invite, now),
    }));
  return { invites };
}

export async function revokeModeratorInviteHandler(
  request: CallableRequest,
  deps: InviteDeps
): Promise<{ revoked: boolean }> {
  const actorUid = request.auth?.uid;
  await assertSuperAdmin(actorUid, deps.readRoleDoc);
  const inviteId = assertInviteId((request.data as { inviteId?: unknown } | null)?.inviteId);
  const invite = await deps.getInvite(inviteId);
  if (!invite) throw new HttpsError('not-found', 'Invitation not found.');
  if (invite.status !== 'pending') return { revoked: false };
  await deps.revokeInvite(inviteId, actorUid as string);
  return { revoked: true };
}

// ── The invited person: look up, accept ──────────────────────────────────

export interface PublicInvite {
  state: PublicInviteState;
  regionIds: string[];
  regionNames: string[];
  /** Only while the invite is open: the address to sign in with. */
  email: string | null;
}

export async function getModeratorInviteHandler(
  request: CallableRequest,
  deps: InviteDeps
): Promise<PublicInvite> {
  deps.enforceRateLimit(request as never, 'moderatorInviteRead', READ_LIMIT);
  const token = assertInviteToken((request.data as { token?: unknown } | null)?.token);
  const invite = await deps.getInvite(hashInviteToken(token));
  if (!invite) throw new HttpsError('not-found', 'Invitation not found.');
  const state = publicInviteState(invite, deps.now());
  const ids = inviteRegionIds(invite);
  return {
    state,
    regionIds: ids,
    regionNames: regionNames(ids),
    email: state === 'pending' ? invite.email : null,
  };
}

/** Consents of the wizard: exactly the required ids, each once. */
export function validateConsents(raw: unknown): string[] {
  if (!Array.isArray(raw) || !raw.every((c) => typeof c === 'string')) {
    throw new HttpsError('invalid-argument', 'Consents are missing.');
  }
  const set = new Set(raw as string[]);
  if (set.size !== raw.length || set.size !== REQUIRED_CONSENTS.length) {
    throw new HttpsError('invalid-argument', 'Consents are missing.');
  }
  if (!REQUIRED_CONSENTS.every((c) => set.has(c))) {
    throw new HttpsError('invalid-argument', 'Consents are missing.');
  }
  return [...REQUIRED_CONSENTS];
}

export function validateSignatureName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < SIGNATURE_MIN || name.length > SIGNATURE_MAX) {
    throw new HttpsError('invalid-argument', 'Please sign with your name.');
  }
  return name;
}

export interface AcceptInviteResult {
  regionIds: string[];
  alreadyAccepted: boolean;
}

export async function acceptModeratorInviteHandler(
  request: CallableRequest,
  deps: InviteDeps
): Promise<AcceptInviteResult> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
  deps.enforceRateLimit(request as never, 'moderatorInviteAccept', ACCEPT_LIMIT);

  const data = (request.data ?? {}) as {
    token?: unknown;
    consents?: unknown;
    signatureName?: unknown;
    textVersion?: unknown;
  };
  const token = assertInviteToken(data.token);
  const consents = validateConsents(data.consents);
  const signatureName = validateSignatureName(data.signatureName);
  if (data.textVersion !== ONBOARDING_TEXT_VERSION) {
    throw new HttpsError('failed-precondition', 'Outdated onboarding text.');
  }
  const inviteId = hashInviteToken(token);

  const user = await deps.getUser(uid);
  if (!user) throw new HttpsError('not-found', 'No account with this uid.');
  assertNotSuperAdminUser(user);
  const accountEmail = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';

  const outcome = await deps.runTransaction(async (tx) => {
    const invite = await tx.getInvite(inviteId);
    if (!invite) throw new HttpsError('not-found', 'Invitation not found.');
    if (invite.status === 'accepted') {
      if (invite.acceptedUid === uid) {
        return { regionIds: inviteRegionIds(invite), alreadyAccepted: true, invite };
      }
      throw new HttpsError('failed-precondition', 'Invitation already used.');
    }
    if (invite.status === 'revoked') {
      throw new HttpsError('failed-precondition', 'Invitation revoked.');
    }
    if (isInviteExpired(invite, deps.now())) {
      throw new HttpsError('failed-precondition', 'Invitation expired.');
    }
    if (!accountEmail || accountEmail !== invite.email) {
      throw new HttpsError('permission-denied', 'Wrong account for this invitation.');
    }

    const current = await tx.getRoleDoc(uid);
    const before = moderatorSnapshotOrRefuse(current);
    const invited = inviteRegionIds(invite);
    const regionIds = REGION_IDS.filter(
      (id) => invited.includes(id) || (before?.regionIds ?? []).includes(id)
    );
    if (regionIds.length === 0) {
      throw new HttpsError('failed-precondition', 'Invitation has no valid region.');
    }

    if (!hasSameModeratorRegions(current, regionIds)) {
      tx.setModerator(uid, { regionIds, email: user.email ?? null, updatedBy: uid });
    }
    tx.markAccepted(inviteId, {
      acceptedUid: uid,
      consents,
      signatureName,
      textVersion: ONBOARDING_TEXT_VERSION,
    });
    tx.addAuditEntry({
      action: before ? 'updateRegionModerator' : 'grantRegionModerator',
      actorUid: uid,
      targetUid: uid,
      targetEmail: user.email ?? null,
      before,
      after: { role: 'RegionModerator', regionIds },
      via: 'invite',
      inviteId,
      invitedBy: invite.invitedBy,
      consents,
      signatureName,
      textVersion: ONBOARDING_TEXT_VERSION,
    });
    return { regionIds, alreadyAccepted: false, invite };
  });

  if (!outcome.alreadyAccepted) {
    // Best effort: the role is granted even if the info mail fails.
    try {
      const names = regionNames(inviteRegionIds(outcome.invite));
      for (const recipient of await deps.getSuperAdminEmails()) {
        await deps.sendMail(
          buildModeratorInviteAcceptedPayload({
            recipient,
            moderatorEmail: user.email ?? accountEmail,
            signatureName,
            regionNames: names,
          })
        );
      }
    } catch (err) {
      logger.error('Sending the "invitation accepted" mail failed', { inviteId, err });
    }
  }
  return { regionIds: outcome.regionIds, alreadyAccepted: outcome.alreadyAccepted };
}

// ── Firebase wiring ──────────────────────────────────────────────────────

function millis(value: unknown): number {
  if (value && typeof (value as Timestamp).toMillis === 'function') {
    return (value as Timestamp).toMillis();
  }
  return typeof value === 'number' ? value : 0;
}

function toRecord(data: Record<string, unknown>): InviteRecord {
  const status = data.status === 'accepted' || data.status === 'revoked' ? data.status : 'pending';
  return {
    email: typeof data.email === 'string' ? data.email : '',
    regionIds: Array.isArray(data.regionIds) ? data.regionIds.filter(isRegionId) : [],
    invitedBy: typeof data.invitedBy === 'string' ? data.invitedBy : '',
    createdAtMs: millis(data.createdAt),
    expiresAtMs: millis(data.expiresAt),
    status,
    acceptedUid: typeof data.acceptedUid === 'string' ? data.acceptedUid : null,
    acceptedAtMs: data.acceptedAt ? millis(data.acceptedAt) : null,
    consents: Array.isArray(data.consents) ? (data.consents as string[]) : [],
    signatureName: typeof data.signatureName === 'string' ? data.signatureName : null,
    textVersion: typeof data.textVersion === 'number' ? data.textVersion : null,
  };
}

async function getUserOrNull(load: () => Promise<TargetUser>): Promise<TargetUser | null> {
  try {
    return await load();
  } catch (err) {
    if ((err as { code?: string })?.code === 'auth/user-not-found') return null;
    throw err;
  }
}

async function sendViaMailgun(payload: EmailPayload): Promise<void> {
  if (isMailgunDryRun(process.env)) {
    logger.info('MAILGUN dry-run: would send moderator invite mail', {
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

function firestoreDeps(): InviteDeps {
  const db = getFirestore();
  const invites = db.collection(INVITES_COLLECTION);
  return {
    readRoleDoc,
    now: () => Date.now(),
    generateToken: generateInviteToken,
    baseUrl: inviteBaseUrl(),
    async createInvite(id, invite) {
      await invites.doc(id).create({
        email: invite.email,
        regionIds: invite.regionIds,
        invitedBy: invite.invitedBy,
        createdAt: Timestamp.fromMillis(invite.createdAtMs),
        expiresAt: Timestamp.fromMillis(invite.expiresAtMs),
        status: invite.status,
        acceptedUid: null,
        acceptedAt: null,
        consents: [],
        signatureName: null,
        textVersion: null,
      });
    },
    async getInvite(id) {
      const snap = await invites.doc(id).get();
      return snap.exists ? toRecord(snap.data() ?? {}) : null;
    },
    async listPendingInvites() {
      const snap = await invites.where('status', '==', 'pending').get();
      return snap.docs.map((d) => ({ id: d.id, invite: toRecord(d.data()) }));
    },
    async revokeInvite(id, revokedBy) {
      await invites.doc(id).update({
        status: 'revoked',
        revokedAt: FieldValue.serverTimestamp(),
        revokedBy,
      });
    },
    getUser: (uid) => getUserOrNull(() => getAuth().getUser(uid)),
    getUserByEmail: (email) => getUserOrNull(() => getAuth().getUserByEmail(email)),
    runTransaction: (fn) =>
      db.runTransaction(async (t) => {
        const writes: Array<() => void> = [];
        const tx: InviteTransaction = {
          async getInvite(id) {
            const snap = await t.get(invites.doc(id));
            return snap.exists ? toRecord(snap.data() ?? {}) : null;
          },
          async getRoleDoc(uid) {
            const snap = await t.get(db.collection('admin_users').doc(uid));
            return snap.exists ? (snap.data() ?? {}) : null;
          },
          setModerator(uid, data) {
            writes.push(() => t.set(db.collection('admin_users').doc(uid), moderatorRoleDoc(data)));
          },
          markAccepted(id, data) {
            writes.push(() =>
              t.update(invites.doc(id), {
                status: 'accepted',
                acceptedUid: data.acceptedUid,
                acceptedAt: FieldValue.serverTimestamp(),
                consents: data.consents,
                signatureName: data.signatureName,
                textVersion: data.textVersion,
              })
            );
          },
          addAuditEntry(entry) {
            writes.push(() =>
              t.create(db.collection(AUDIT_LOG_COLLECTION).doc(), {
                ...entry,
                createdAt: FieldValue.serverTimestamp(),
              })
            );
          },
        };
        const result = await fn(tx);
        // All reads happen before any write, as Firestore transactions require.
        writes.forEach((w) => w());
        return result;
      }),
    sendMail: sendViaMailgun,
    getSuperAdminEmails: getAdminEmails,
    enforceRateLimit,
  };
}

const MAIL_SECRETS = [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM, MAILGUN_REPLY_TO];

export const adminCreateModeratorInvite = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, secrets: MAIL_SECRETS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('adminCreateModeratorInvite', request);
    const result = await createModeratorInviteHandler(request, firestoreDeps());
    logger.info('adminCreateModeratorInvite', {
      actorUid: request.auth?.uid,
      inviteId: result.inviteId,
      emailSent: result.emailSent,
    });
    return result;
  }
);

export const adminListModeratorInvites = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('adminListModeratorInvites', request);
    return listModeratorInvitesHandler(request, firestoreDeps());
  }
);

export const adminRevokeModeratorInvite = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('adminRevokeModeratorInvite', request);
    return revokeModeratorInviteHandler(request, firestoreDeps());
  }
);

export const getModeratorInvite = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('getModeratorInvite', request);
    return getModeratorInviteHandler(request, firestoreDeps());
  }
);

export const acceptModeratorInvite = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, secrets: MAIL_SECRETS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('acceptModeratorInvite', request);
    const result = await acceptModeratorInviteHandler(request, firestoreDeps());
    logger.info('acceptModeratorInvite', {
      uid: request.auth?.uid,
      regionIds: result.regionIds,
      alreadyAccepted: result.alreadyAccepted,
    });
    return result;
  }
);
