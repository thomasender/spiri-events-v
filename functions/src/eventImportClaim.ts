/**
 * Event import, claim (docs/event-import.md, "Claim"): an organizer takes the
 * curated events of their `import_organizers` doc over into their own account.
 *
 *   claimCuratedEvents({ organizerId?, token? })   signed-in member
 *   approveClaimRequest({ requestId, approve })    Super-Admin
 *   listMyClaimableEvents()                        signed-in member (banner)
 *   findCuratedMatches({ title, date, regionId? }) signed-in member (wizard hint)
 *
 * Proofs, strongest first:
 * - `token`: the preview token of the outreach mail (sha256 equals
 *   `previewTokenHash`, not expired)            -> automatic claim
 * - `email`: the account's VERIFIED e-mail equals `contactEmail`
 *   (case-insensitive)                           -> automatic claim
 * - `domain`: same registrable domain as the website / contact address, the
 *   account's address is not a free-mail one     -> claim request only
 * - `none`                                       -> claim request only
 * Claim requests (`import_claim_requests`) are decided by a Super-Admin.
 *
 * Refused: the curator account itself, declined or blocklisted organizers, an
 * organizer already claimed by another account.
 *
 * The claim moves `createdBy` of the organizer's curated events to the user,
 * fills `organizer` (name, the verified e-mail), sets `curation.claimable =
 * false`, `claimedAt`, `claimedBy`, and marks the organizer `claimed` with
 * `linkedUid`. Claiming is NOT consent: `curation.consentAt` and the event
 * status are left alone (consent is recorded by the preview page callable).
 *
 * Writes: the organizer, the audit entry and the first chunk of events in one
 * transaction; further chunks (more than CLAIM_CHUNK_SIZE events) each in their
 * own transaction. Every step is idempotent, so a repeated call by the same
 * account resumes an interrupted claim.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import { AUDIT_LOG_COLLECTION } from './adminModerators';
import { assertSuperAdmin, readRoleDoc, type RoleDocReader } from './staffRoles';
import { enforceRateLimit } from './rateLimit';
import { isRegionId } from './regions';
import {
  IMPORT_BLOCKLIST,
  IMPORT_ORGANIZERS,
  IMPORT_SETTINGS_DOC,
  blocklistId,
  claimTitleSimilarity,
  hashPreviewToken,
  isBlocked,
  normalizeBlocklistValue,
  registrableHost,
} from './eventImport';

if (getApps().length === 0) {
  initializeApp();
}

type Doc = Record<string, unknown>;

export const IMPORT_CLAIM_REQUESTS = 'import_claim_requests';
/** Events per transaction (limit 500 writes; organizer + audit entry go into the first). */
export const CLAIM_CHUNK_SIZE = 400;
/** Minimum claimTitleSimilarity for the wizard hint. */
export const MATCH_THRESHOLD = 0.6;
export const MAX_MATCHES = 3;
export const MAX_LISTED_EVENTS = 20;

export const CLAIM_RATE_LIMITS = {
  claim: { maxAttempts: 10, windowMs: 10 * 60 * 1000 },
  approve: { maxAttempts: 60, windowMs: 10 * 60 * 1000 },
  list: { maxAttempts: 20, windowMs: 10 * 60 * 1000 },
  // The wizard asks debounced while the person types title and date.
  find: { maxAttempts: 40, windowMs: 60 * 1000 },
} as const;

/**
 * Free-mail providers: an address there proves nothing about an organisation,
 * so it never matches by domain (an exact contact address still does).
 */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'gmx.at',
  'gmx.de',
  'gmx.ch',
  'gmx.net',
  'gmx.com',
  'web.de',
  'outlook.com',
  'outlook.de',
  'outlook.at',
  'hotmail.com',
  'hotmail.de',
  'live.com',
  'live.at',
  'live.de',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'yahoo.com',
  'yahoo.de',
  'ymail.com',
  'proton.me',
  'protonmail.com',
  'protonmail.ch',
  'pm.me',
  'aon.at',
  'chello.at',
  'a1.net',
  'bluewin.ch',
  'freenet.de',
  't-online.de',
  'posteo.de',
  'posteo.at',
  'mailbox.org',
  'tutanota.com',
  'tuta.io',
  'aol.com',
  'mail.de',
]);

export type ClaimProof = 'token' | 'email' | 'domain' | 'none';
export type ClaimRefusal = 'curator' | 'declined' | 'blocked' | 'already-claimed';

// ── Pure helpers ──────────────────────────────────────────────────────────

const lower = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

/** Domain part of an e-mail address, lower-case ('' when there is none). */
export function emailDomainOf(email: unknown): string {
  const value = lower(email);
  const at = value.lastIndexOf('@');
  return at > 0 ? value.slice(at + 1).replace(/\.$/, '') : '';
}

/** A free-mail provider (also a subdomain of one, e.g. "mail.gmx.at"). */
export function isFreeMailDomain(domain: string): boolean {
  const value = lower(domain);
  if (!value) return false;
  if (FREE_MAIL_DOMAINS.has(value)) return true;
  const base = registrableHost(value);
  return Boolean(base) && FREE_MAIL_DOMAINS.has(base);
}

function websiteHost(website: unknown): string {
  const value = normalizeBlocklistValue(typeof website === 'string' ? website : '');
  return value.includes('@') ? '' : value;
}

/**
 * Which proof the signed-in account has for an organizer. The token is
 * checked by the caller (`tokenMatched`); `email` must be the account's
 * verified address.
 */
export function claimProofFor({
  organizer,
  email,
  tokenMatched = false,
}: {
  organizer: Doc;
  email: string | null | undefined;
  tokenMatched?: boolean;
}): ClaimProof {
  if (tokenMatched) return 'token';
  const mail = lower(email);
  if (!mail || !mail.includes('@')) return 'none';
  const contact = lower(organizer.contactEmail);
  if (contact && contact === mail) return 'email';
  const domain = emailDomainOf(mail);
  if (!domain || isFreeMailDomain(domain)) return 'none';
  const mine = registrableHost(domain);
  if (!mine) return 'none';
  const theirs = [websiteHost(organizer.website), emailDomainOf(contact)]
    .filter((d) => d && !isFreeMailDomain(d))
    .map((d) => registrableHost(d));
  return theirs.includes(mine) ? 'domain' : 'none';
}

/** Token and exact e-mail claim at once; the rest only asks a Super-Admin. */
export function isAutomaticProof(proof: ClaimProof): boolean {
  return proof === 'token' || proof === 'email';
}

/** Why this account may not claim this organizer, or null. */
export function claimRefusal({
  organizer,
  uid,
  curatorUid,
  blocked,
}: {
  organizer: Doc;
  uid: string;
  curatorUid: string | null;
  blocked: boolean;
}): ClaimRefusal | null {
  if (curatorUid && uid === curatorUid) return 'curator';
  if (organizer.consent === 'declined' || organizer.syncMode === 'declined') return 'declined';
  if (blocked) return 'blocked';
  const linked = typeof organizer.linkedUid === 'string' ? organizer.linkedUid : '';
  if (linked && linked !== uid) return 'already-claimed';
  return null;
}

/** The organizer is already linked to this account (a repeated / resumed claim). */
export function isClaimedBy(organizer: Doc, uid: string): boolean {
  return organizer.linkedUid === uid;
}

/**
 * Doc ids in import_blocklist to look up for an organizer: its contact
 * address, the address's domain and the website domain, each with its parent
 * domains (never a bare TLD). isBlocked() decides on the ids that exist.
 */
export function blocklistLookupIds({
  email,
  website,
}: {
  email?: unknown;
  website?: unknown;
}): string[] {
  const values = new Set<string>();
  const mail = lower(email);
  if (mail.includes('@')) values.add(normalizeBlocklistValue(mail));
  for (const domain of [emailDomainOf(mail), websiteHost(website)]) {
    const labels = domain.split('.').filter(Boolean);
    for (let i = 0; i < labels.length - 1; i += 1) values.add(labels.slice(i).join('.'));
  }
  return [...values].map((v) => blocklistId(v));
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function millisOf(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  const v = value as { toMillis?: () => number };
  return typeof v.toMillis === 'function' ? v.toMillis() : null;
}

/** The preview token expired (`previewTokenExpiresAt` in the past). Missing = never expires. */
export function isPreviewTokenExpired(organizer: Doc, nowMs: number): boolean {
  const expires = millisOf(organizer.previewTokenExpiresAt);
  return expires !== null && expires <= nowMs;
}

/**
 * The update (dotted field paths) that moves one curated event to the
 * claiming account, or null when nothing is to do: not curated, already
 * claimed by this account, or owned by somebody who is neither the curator nor
 * the claimer (an event someone else already owns is never taken).
 */
export function eventClaimPatch(
  event: Doc | null,
  {
    uid,
    email,
    organizerName,
    curatorUid,
    now,
  }: { uid: string; email: string; organizerName: string; curatorUid: string | null; now: Date }
): Doc | null {
  if (!event) return null;
  const curation = event.curation as Doc | undefined;
  if (!curation || typeof curation !== 'object') return null;
  const owner = typeof event.createdBy === 'string' ? event.createdBy : '';
  if (owner === uid && curation.claimable === false && curation.claimedBy === uid) return null;
  if (owner !== uid && owner !== curatorUid) return null;
  const current = (event.organizer ?? {}) as Doc;
  const currentName = typeof current.name === 'string' ? current.name.trim() : '';
  return {
    createdBy: uid,
    'organizer.name': currentName || organizerName,
    'organizer.email': email,
    'curation.claimable': false,
    'curation.claimedAt': now,
    'curation.claimedBy': uid,
  };
}

// ── Handlers ──────────────────────────────────────────────────────────────

export interface ClaimUser {
  uid: string;
  email?: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
}

export interface DocRecord {
  id: string;
  data: Doc;
}

export interface ClaimAuditEntry {
  action: 'claimCuratedEvents' | 'rejectClaimRequest';
  actorUid: string;
  targetUid: string;
  targetEmail: string | null;
  organizerId: string;
  proof: ClaimProof;
  via: 'self' | 'request';
  requestId?: string | null;
  eventCount?: number;
}

export interface ClaimTransaction {
  getOrganizer(id: string): Promise<Doc | null>;
  getEvents(ids: string[]): Promise<DocRecord[]>;
  updateOrganizer(id: string, patch: Doc): void;
  updateEvent(id: string, patch: Doc): void;
  addAuditEntry(entry: ClaimAuditEntry): void;
}

export interface ClaimDeps {
  now: () => Date;
  enforceRateLimit: (
    req: never,
    action: string,
    opts: { maxAttempts: number; windowMs: number }
  ) => void;
  readRoleDoc: RoleDocReader;
  getUser: (uid: string) => Promise<ClaimUser | null>;
  getCuratorUid: () => Promise<string | null>;
  getOrganizer: (id: string) => Promise<Doc | null>;
  findOrganizerByTokenHash: (hash: string) => Promise<DocRecord | null>;
  findOrganizersByEmail: (email: string) => Promise<DocRecord[]>;
  /** Which of these import_blocklist ids exist. */
  existingBlocklistIds: (ids: string[]) => Promise<string[]>;
  /** Ids of all events with curation.organizerRef == organizerId. */
  listOrganizerEventIds: (organizerId: string) => Promise<string[]>;
  /** Events with curation.organizerRef == organizerId and curation.claimable == true. */
  listClaimableEventsOf: (organizerId: string) => Promise<DocRecord[]>;
  /** Events on this date with curation.claimable == true. */
  listClaimableEventsOn: (date: string) => Promise<DocRecord[]>;
  runTransaction: <T>(fn: (tx: ClaimTransaction) => Promise<T>) => Promise<T>;
  getClaimRequest: (id: string) => Promise<Doc | null>;
  createClaimRequest: (id: string, data: Doc) => Promise<void>;
  updateClaimRequest: (id: string, patch: Doc) => Promise<void>;
  addAuditEntry: (entry: ClaimAuditEntry) => Promise<void>;
}

interface CallableRequest {
  auth?: { uid?: string } | null;
  data?: unknown;
}

export interface ClaimedOrganizer {
  organizerId: string;
  name: string;
  eventCount: number;
}

export type ClaimResult =
  | { status: 'claimed'; organizers: ClaimedOrganizer[]; eventCount: number }
  | { status: 'requested'; requestId: string; proof: ClaimProof; alreadyRequested: boolean }
  | { status: 'request-rejected'; requestId: string };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function refuse(reason: ClaimRefusal): never {
  const messages: Record<ClaimRefusal, [ConstructorParameters<typeof HttpsError>[0], string]> = {
    curator: ['permission-denied', 'The curator account cannot claim events.'],
    declined: ['failed-precondition', 'This organizer declined.'],
    blocked: ['failed-precondition', 'This organizer is blocked.'],
    'already-claimed': ['failed-precondition', 'Already claimed by another account.'],
  };
  const [code, message] = messages[reason];
  throw new HttpsError(code, message, { reason });
}

async function signedInVerifiedUser(
  request: CallableRequest,
  deps: ClaimDeps
): Promise<{ user: ClaimUser; email: string } | null> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
  // Read the account itself: the ID token's email_verified may be stale right
  // after the confirmation link.
  const user = await deps.getUser(uid);
  const email = lower(user?.email);
  if (!user || !email || user.emailVerified !== true) return null;
  return { user, email };
}

async function isOrganizerBlocked(deps: ClaimDeps, organizer: Doc): Promise<boolean> {
  const ids = blocklistLookupIds({ email: organizer.contactEmail, website: organizer.website });
  if (ids.length === 0) return false;
  const existing = await deps.existingBlocklistIds(ids);
  return isBlocked(
    {
      email: typeof organizer.contactEmail === 'string' ? organizer.contactEmail : null,
      website: typeof organizer.website === 'string' ? organizer.website : null,
    },
    existing
  );
}

async function refusalFor(
  deps: ClaimDeps,
  organizer: Doc,
  uid: string,
  curatorUid: string | null
): Promise<ClaimRefusal | null> {
  const cheap = claimRefusal({ organizer, uid, curatorUid, blocked: false });
  if (cheap) return cheap;
  return claimRefusal({
    organizer,
    uid,
    curatorUid,
    blocked: await isOrganizerBlocked(deps, organizer),
  });
}

function organizerNameOf(organizer: Doc, user: ClaimUser): string {
  const name = typeof organizer.name === 'string' ? organizer.name.trim() : '';
  return (name || (user.displayName ?? '').trim()).slice(0, 120);
}

/**
 * Moves an organizer and its curated events to `user` (idempotent; resumes
 * an interrupted claim). Refusals are re-checked inside the transaction.
 */
export async function performClaim(
  deps: ClaimDeps,
  {
    organizerId,
    user,
    email,
    curatorUid,
    actorUid,
    proof,
    via,
    requestId = null,
  }: {
    organizerId: string;
    user: ClaimUser;
    email: string;
    curatorUid: string | null;
    actorUid: string;
    proof: ClaimProof;
    via: 'self' | 'request';
    requestId?: string | null;
  }
): Promise<ClaimedOrganizer> {
  const uid = user.uid;
  const eventIds = await deps.listOrganizerEventIds(organizerId);
  const [first = [], ...rest] = chunk(eventIds, CLAIM_CHUNK_SIZE);
  let claimed = 0;
  let name = '';

  const claimChunk = (
    tx: ClaimTransaction,
    events: DocRecord[],
    organizerName: string,
    now: Date
  ): number => {
    let n = 0;
    for (const { id, data } of events) {
      const patch = eventClaimPatch(data, { uid, email, organizerName, curatorUid, now });
      if (patch) {
        tx.updateEvent(id, patch);
        n += 1;
      }
    }
    return n;
  };

  await deps.runTransaction(async (tx) => {
    const organizer = await tx.getOrganizer(organizerId);
    if (!organizer)
      throw new HttpsError('not-found', 'Organizer not found.', { reason: 'no-organizer' });
    const reason = claimRefusal({ organizer, uid, curatorUid, blocked: false });
    if (reason) refuse(reason);
    const events = first.length ? await tx.getEvents(first) : [];
    const now = deps.now();
    name = organizerNameOf(organizer, user);
    const resumed = isClaimedBy(organizer, uid);
    if (!resumed) {
      tx.updateOrganizer(organizerId, {
        consent: 'claimed',
        syncMode: 'self_managed',
        linkedUid: uid,
        claimedAt: now,
        updatedAt: now,
      });
    }
    claimed = claimChunk(tx, events, name, now);
    if (!resumed) {
      tx.addAuditEntry({
        action: 'claimCuratedEvents',
        actorUid,
        targetUid: uid,
        targetEmail: email,
        organizerId,
        proof,
        via,
        requestId,
        eventCount: eventIds.length,
      });
    }
  });

  for (const ids of rest) {
    claimed += await deps.runTransaction(async (tx) => {
      const organizer = await tx.getOrganizer(organizerId);
      // Somebody else got it in between (only possible via a Super-Admin edit): stop.
      if (!organizer || !isClaimedBy(organizer, uid)) refuse('already-claimed');
      const events = await tx.getEvents(ids);
      return claimChunk(tx, events, name, deps.now());
    });
  }

  return { organizerId, name, eventCount: claimed };
}

export function parseClaimInput(raw: unknown): {
  organizerId: string | null;
  token: string | null;
} {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Doc;
  const organizerId = data.organizerId ?? null;
  const token = data.token ?? null;
  if (organizerId !== null && (typeof organizerId !== 'string' || !ID_PATTERN.test(organizerId))) {
    throw new HttpsError('invalid-argument', 'Invalid organizer.');
  }
  if (token !== null && (typeof token !== 'string' || !TOKEN_PATTERN.test(token))) {
    throw new HttpsError('invalid-argument', 'Invalid link.', { reason: 'invalid-token' });
  }
  return { organizerId: organizerId as string | null, token: token as string | null };
}

export function claimRequestId(organizerId: string, uid: string): string {
  return `${organizerId}_${uid}`;
}

async function requestClaim(
  deps: ClaimDeps,
  {
    organizerId,
    user,
    email,
    proof,
  }: { organizerId: string; user: ClaimUser; email: string; proof: ClaimProof }
): Promise<ClaimResult> {
  const requestId = claimRequestId(organizerId, user.uid);
  const existing = await deps.getClaimRequest(requestId);
  if (existing?.status === 'rejected') return { status: 'request-rejected', requestId };
  if (existing?.status === 'pending') {
    return { status: 'requested', requestId, proof, alreadyRequested: true };
  }
  await deps.createClaimRequest(requestId, {
    uid: user.uid,
    organizerId,
    userEmail: email,
    proof,
    status: 'pending',
    createdAt: deps.now(),
  });
  return { status: 'requested', requestId, proof, alreadyRequested: false };
}

export async function claimCuratedEventsHandler(
  request: CallableRequest,
  deps: ClaimDeps
): Promise<ClaimResult> {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
  deps.enforceRateLimit(request as never, 'claimCuratedEvents', CLAIM_RATE_LIMITS.claim);
  const { organizerId, token } = parseClaimInput(request.data);
  const account = await signedInVerifiedUser(request, deps);
  if (!account) {
    throw new HttpsError('failed-precondition', 'Please confirm your e-mail address first.', {
      reason: 'email-not-verified',
    });
  }
  const { user, email } = account;
  const curatorUid = await deps.getCuratorUid();
  if (curatorUid && user.uid === curatorUid) refuse('curator');

  // Targets: organizer + proof.
  let targets: Array<{ id: string; organizer: Doc; proof: ClaimProof }>;
  if (token) {
    const found = await deps.findOrganizerByTokenHash(hashPreviewToken(token));
    if (!found) throw new HttpsError('not-found', 'Unknown link.', { reason: 'invalid-token' });
    if (organizerId && organizerId !== found.id) {
      throw new HttpsError('invalid-argument', 'Link and organizer do not match.', {
        reason: 'invalid-token',
      });
    }
    if (
      isPreviewTokenExpired(found.data, deps.now().getTime()) &&
      !isClaimedBy(found.data, user.uid)
    ) {
      throw new HttpsError('failed-precondition', 'The link expired.', { reason: 'token-expired' });
    }
    targets = [{ id: found.id, organizer: found.data, proof: 'token' }];
  } else if (organizerId) {
    const organizer = await deps.getOrganizer(organizerId);
    if (!organizer) {
      throw new HttpsError('not-found', 'Organizer not found.', { reason: 'no-organizer' });
    }
    targets = [{ id: organizerId, organizer, proof: claimProofFor({ organizer, email }) }];
  } else {
    targets = (await deps.findOrganizersByEmail(email))
      .map(({ id, data }) => ({
        id,
        organizer: data,
        proof: claimProofFor({ organizer: data, email }),
      }))
      .filter((t) => t.proof === 'email');
    if (targets.length === 0) {
      throw new HttpsError('not-found', 'No events for this address.', { reason: 'no-organizer' });
    }
  }

  const allowed: typeof targets = [];
  let firstRefusal: ClaimRefusal | null = null;
  for (const target of targets) {
    const reason = await refusalFor(deps, target.organizer, user.uid, curatorUid);
    if (reason) firstRefusal ??= reason;
    else allowed.push(target);
  }
  if (allowed.length === 0) refuse(firstRefusal ?? 'already-claimed');

  // A single organizer without a strong proof: ask a Super-Admin (unless the
  // account already owns it, then the call only resumes the claim).
  const single = allowed.length === 1 ? allowed[0] : null;
  if (single && !isAutomaticProof(single.proof) && !isClaimedBy(single.organizer, user.uid)) {
    return requestClaim(deps, { organizerId: single.id, user, email, proof: single.proof });
  }

  const organizers: ClaimedOrganizer[] = [];
  for (const target of allowed) {
    organizers.push(
      await performClaim(deps, {
        organizerId: target.id,
        user,
        email,
        curatorUid,
        actorUid: user.uid,
        proof: target.proof,
        via: 'self',
      })
    );
  }
  return {
    status: 'claimed',
    organizers,
    eventCount: organizers.reduce((sum, o) => sum + o.eventCount, 0),
  };
}

export interface ApproveClaimResult {
  requestId: string;
  status: 'approved' | 'rejected';
  eventCount: number;
}

export async function approveClaimRequestHandler(
  request: CallableRequest,
  deps: ClaimDeps
): Promise<ApproveClaimResult> {
  const actorUid = request.auth?.uid;
  await assertSuperAdmin(actorUid, deps.readRoleDoc);
  deps.enforceRateLimit(request as never, 'approveClaimRequest', CLAIM_RATE_LIMITS.approve);
  const data = (request.data && typeof request.data === 'object' ? request.data : {}) as Doc;
  const requestId = data.requestId;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,300}$/.test(requestId)) {
    throw new HttpsError('invalid-argument', 'Invalid request id.');
  }
  if (typeof data.approve !== 'boolean') {
    throw new HttpsError('invalid-argument', 'approve must be true or false.');
  }
  const claimRequest = await deps.getClaimRequest(requestId);
  if (!claimRequest) throw new HttpsError('not-found', 'Claim request not found.');
  const status = claimRequest.status;
  // Approving again finishes an interrupted claim; any other repeat is refused.
  if (status !== 'pending' && !(status === 'approved' && data.approve === true)) {
    throw new HttpsError('failed-precondition', 'Already decided.', { reason: 'request-decided' });
  }
  const uid = typeof claimRequest.uid === 'string' ? claimRequest.uid : '';
  const organizerId = typeof claimRequest.organizerId === 'string' ? claimRequest.organizerId : '';
  const proof = (['token', 'email', 'domain', 'none'] as const).includes(
    claimRequest.proof as ClaimProof
  )
    ? (claimRequest.proof as ClaimProof)
    : 'none';
  const now = deps.now();

  if (!data.approve) {
    await deps.updateClaimRequest(requestId, {
      status: 'rejected',
      decidedAt: now,
      decidedBy: actorUid,
    });
    await deps.addAuditEntry({
      action: 'rejectClaimRequest',
      actorUid: actorUid as string,
      targetUid: uid,
      targetEmail: typeof claimRequest.userEmail === 'string' ? claimRequest.userEmail : null,
      organizerId,
      proof,
      via: 'request',
      requestId,
    });
    return { requestId, status: 'rejected', eventCount: 0 };
  }

  const user = uid ? await deps.getUser(uid) : null;
  const email = lower(user?.email);
  if (!user || !email || user.emailVerified !== true) {
    throw new HttpsError('failed-precondition', 'The account has no confirmed e-mail address.', {
      reason: 'email-not-verified',
    });
  }
  const organizer = await deps.getOrganizer(organizerId);
  if (!organizer)
    throw new HttpsError('not-found', 'Organizer not found.', { reason: 'no-organizer' });
  const curatorUid = await deps.getCuratorUid();
  const reason = await refusalFor(deps, organizer, uid, curatorUid);
  if (reason) refuse(reason);

  const result = await performClaim(deps, {
    organizerId,
    user,
    email,
    curatorUid,
    actorUid: actorUid as string,
    proof,
    via: 'request',
    requestId,
  });
  if (status === 'pending') {
    await deps.updateClaimRequest(requestId, {
      status: 'approved',
      decidedAt: now,
      decidedBy: actorUid,
    });
  }
  return { requestId, status: 'approved', eventCount: result.eventCount };
}

export interface ClaimableListing {
  events: Array<{ title: string; date: string }>;
  total: number;
}

function isOpenClaimableEvent(event: Doc, uid: string): boolean {
  const curation = event.curation as Doc | undefined;
  return (
    Boolean(curation) &&
    curation?.claimable === true &&
    event.status !== 'trashed' &&
    event.createdBy !== uid
  );
}

const text = (value: unknown, max = 200): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** Curated events waiting for the signed-in account's verified address (titles and dates only). */
export async function listMyClaimableEventsHandler(
  request: CallableRequest,
  deps: ClaimDeps
): Promise<ClaimableListing> {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
  deps.enforceRateLimit(request as never, 'listMyClaimableEvents', CLAIM_RATE_LIMITS.list);
  const account = await signedInVerifiedUser(request, deps);
  if (!account) return { events: [], total: 0 };
  const { user, email } = account;
  const curatorUid = await deps.getCuratorUid();
  if (curatorUid && user.uid === curatorUid) return { events: [], total: 0 };

  const events: Array<{ title: string; date: string }> = [];
  for (const { id, data } of await deps.findOrganizersByEmail(email)) {
    if (claimProofFor({ organizer: data, email }) !== 'email') continue;
    if (await refusalFor(deps, data, user.uid, curatorUid)) continue;
    for (const ev of await deps.listClaimableEventsOf(id)) {
      if (isOpenClaimableEvent(ev.data, user.uid)) {
        events.push({ title: text(ev.data.title), date: text(ev.data.date, 10) });
      }
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return { events: events.slice(0, MAX_LISTED_EVENTS), total: events.length };
}

export interface CuratedMatch {
  organizerId: string;
  title: string;
  date: string;
}

export function parseMatchInput(raw: unknown): {
  title: string;
  date: string;
  regionId: string | null;
} {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Doc;
  const title = text(data.title, 200);
  const date = text(data.date, 10);
  if (title.length < 3 || !DATE_PATTERN.test(date)) {
    throw new HttpsError('invalid-argument', 'Title and date are required.');
  }
  const regionId = data.regionId == null || data.regionId === '' ? null : data.regionId;
  if (regionId !== null && !isRegionId(regionId)) {
    throw new HttpsError('invalid-argument', 'Unknown region.');
  }
  return { title, date, regionId: regionId as string | null };
}

/**
 * Event wizard hint: up to MAX_MATCHES still-claimable curated events on the
 * same date with a similar title, of the same region or of an organizer whose
 * contact address is the account's. Title, date and organizer id only, never
 * contact data.
 */
export async function findCuratedMatchesHandler(
  request: CallableRequest,
  deps: ClaimDeps
): Promise<{ matches: CuratedMatch[] }> {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
  deps.enforceRateLimit(request as never, 'findCuratedMatches', CLAIM_RATE_LIMITS.find);
  const { title, date, regionId } = parseMatchInput(request.data);
  const account = await signedInVerifiedUser(request, deps);
  if (!account) return { matches: [] };
  const { user, email } = account;
  const curatorUid = await deps.getCuratorUid();
  if (curatorUid && user.uid === curatorUid) return { matches: [] };

  const ownOrganizers = new Set(
    (await deps.findOrganizersByEmail(email))
      .filter(({ data }) => claimProofFor({ organizer: data, email }) === 'email')
      .map(({ id }) => id)
  );
  const scored: Array<CuratedMatch & { score: number }> = [];
  for (const { data } of await deps.listClaimableEventsOn(date)) {
    if (!isOpenClaimableEvent(data, user.uid)) continue;
    const organizerId = text((data.curation as Doc).organizerRef, 128);
    if (!organizerId) continue;
    const sameRegion = regionId !== null && data.regionId === regionId;
    if (!sameRegion && !ownOrganizers.has(organizerId)) continue;
    const score = claimTitleSimilarity(title, text(data.title));
    if (score < MATCH_THRESHOLD) continue;
    scored.push({ organizerId, title: text(data.title), date: text(data.date, 10), score });
  }
  scored.sort((a, b) => b.score - a.score);
  return {
    matches: scored.slice(0, MAX_MATCHES).map(({ organizerId, title: t, date: d }) => ({
      organizerId,
      title: t,
      date: d,
    })),
  };
}

// ── Firebase wiring ──────────────────────────────────────────────────────

function firestoreDeps(): ClaimDeps {
  const db = getFirestore();
  const organizers = db.collection(IMPORT_ORGANIZERS);
  const events = db.collection('events');
  const requests = db.collection(IMPORT_CLAIM_REQUESTS);
  const records = (snap: FirebaseFirestore.QuerySnapshot): DocRecord[] =>
    snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  return {
    now: () => new Date(),
    enforceRateLimit,
    readRoleDoc,
    async getUser(uid) {
      try {
        const u = await getAuth().getUser(uid);
        return {
          uid: u.uid,
          email: u.email ?? null,
          emailVerified: u.emailVerified,
          displayName: u.displayName ?? null,
        };
      } catch (err) {
        if ((err as { code?: string })?.code === 'auth/user-not-found') return null;
        throw err;
      }
    },
    async getCuratorUid() {
      const snap = await db.doc(IMPORT_SETTINGS_DOC).get();
      const uid = snap.get('curatorUid');
      return typeof uid === 'string' && uid ? uid : null;
    },
    async getOrganizer(id) {
      const snap = await organizers.doc(id).get();
      return snap.exists ? (snap.data() ?? {}) : null;
    },
    async findOrganizerByTokenHash(hash) {
      const snap = await organizers.where('previewTokenHash', '==', hash).limit(1).get();
      return snap.empty ? null : { id: snap.docs[0].id, data: snap.docs[0].data() };
    },
    async findOrganizersByEmail(email) {
      // contactEmail is stored lower-case by the import; the account address
      // is lower-case in Firebase Auth. Both spellings are asked to be safe.
      const values = [...new Set([email, email.toLowerCase()])];
      return records(await organizers.where('contactEmail', 'in', values).limit(20).get());
    },
    async existingBlocklistIds(ids) {
      if (ids.length === 0) return [];
      const snaps = await db.getAll(...ids.map((id) => db.collection(IMPORT_BLOCKLIST).doc(id)));
      return snaps.filter((s) => s.exists).map((s) => s.id);
    },
    async listOrganizerEventIds(organizerId) {
      const snap = await events.where('curation.organizerRef', '==', organizerId).select().get();
      return snap.docs.map((d) => d.id);
    },
    async listClaimableEventsOf(organizerId) {
      return records(
        await events
          .where('curation.organizerRef', '==', organizerId)
          .where('curation.claimable', '==', true)
          .select('title', 'date', 'status', 'createdBy', 'curation')
          .limit(200)
          .get()
      );
    },
    async listClaimableEventsOn(date) {
      return records(
        await events
          .where('date', '==', date)
          .where('curation.claimable', '==', true)
          .select('title', 'date', 'status', 'createdBy', 'regionId', 'curation')
          .limit(200)
          .get()
      );
    },
    runTransaction: (fn) =>
      db.runTransaction(async (t) => {
        const writes: Array<() => void> = [];
        const tx: ClaimTransaction = {
          async getOrganizer(id) {
            const snap = await t.get(organizers.doc(id));
            return snap.exists ? (snap.data() ?? {}) : null;
          },
          async getEvents(ids) {
            if (ids.length === 0) return [];
            const snaps = await t.getAll(...ids.map((id) => events.doc(id)));
            return snaps.filter((s) => s.exists).map((s) => ({ id: s.id, data: s.data() ?? {} }));
          },
          updateOrganizer(id, patch) {
            writes.push(() => t.update(organizers.doc(id), patch));
          },
          updateEvent(id, patch) {
            writes.push(() => t.update(events.doc(id), patch));
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
    async getClaimRequest(id) {
      const snap = await requests.doc(id).get();
      return snap.exists ? (snap.data() ?? {}) : null;
    },
    async createClaimRequest(id, data) {
      await requests.doc(id).set(data);
    },
    async updateClaimRequest(id, patch) {
      await requests.doc(id).update(patch);
    },
    async addAuditEntry(entry) {
      await db.collection(AUDIT_LOG_COLLECTION).add({
        ...entry,
        createdAt: FieldValue.serverTimestamp(),
      });
    },
  };
}

export const claimCuratedEvents = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('claimCuratedEvents', request);
    const result = await claimCuratedEventsHandler(request, firestoreDeps());
    // Never log the token or the e-mail address.
    logger.info('claimCuratedEvents', {
      uid: request.auth?.uid,
      status: result.status,
      ...(result.status === 'claimed'
        ? {
            organizerIds: result.organizers.map((o) => o.organizerId),
            eventCount: result.eventCount,
          }
        : { requestId: result.requestId }),
    });
    return result;
  }
);

export const approveClaimRequest = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('approveClaimRequest', request);
    const result = await approveClaimRequestHandler(request, firestoreDeps());
    logger.info('approveClaimRequest', { actorUid: request.auth?.uid, ...result });
    return result;
  }
);

export const listMyClaimableEvents = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('listMyClaimableEvents', request);
    return listMyClaimableEventsHandler(request, firestoreDeps());
  }
);

export const findCuratedMatches = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('findCuratedMatches', request);
    return findCuratedMatchesHandler(request, firestoreDeps());
  }
);
