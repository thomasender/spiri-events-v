/**
 * Event import, tickets 5 + 6 (docs/event-import.md, "Preview, consent and
 * outreach"): the private preview link, the organizer's consent, the ONE
 * outreach mail and the deletion of unanswered data.
 *
 *   createPreviewLink({ organizerId, regenerate? })               Super-Admin
 *   getImportPreview({ token })                                   anyone (rate-limited)
 *   submitImportConsent({ token, action, scopes?, wordingVersion }) anyone (rate-limited)
 *   sendOutreachMail({ organizerId, testRecipient?, force? })     Super-Admin
 *   purgeExpiredImportData (daily) / planOrganizerPurge           backend
 *
 * The handlers take their Firebase access as `deps` (importConsentFunctions.ts
 * wires Firestore, Storage and Mailgun), so tests/lib/importConsent.spec.ts
 * covers them without an emulator.
 *
 * Security / privacy model:
 * - The link carries a random token (32 bytes, base64url). Only its SHA-256
 *   (`previewTokenHash`) and the expiry (`previewTokenExpiresAt`, 7 days) are
 *   stored on the organizer. A wrong, unknown or expired token always gets the
 *   same generic error, so the endpoint tells nothing about which part failed.
 * - The preview returns only what the organizer published themselves: name and
 *   website, and their curated events (facts, link, the image URL on their own
 *   site if isImageUrlAllowed). No contact address, no internal ids, nothing of
 *   other organizers. Each view is logged (time, image URLs shown), no IP.
 * - Consent is written only here (Admin SDK); the rules refuse any client
 *   change of `consentRecord` / `curation`. Events go `pending -> approved`
 *   only with `scopes.event === true`. Every action is idempotent and audited.
 * - One mail only: the outreach log doc `outreach/mail` is claimed before
 *   sending, a second call is refused. There is no reminder anywhere.
 * - Outside production no real organizer address is ever used: a test
 *   recipient is required and the subject starts with "[TEST]". On production
 *   the mail only goes out while the Super-Admin switch app_settings/importOutreach
 *   (productionEnabled, default off) is on, and at most `dailyLimit` real mails per day.
 */
import { randomBytes } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertSuperAdmin, type RoleDocReader } from './staffRoles';
import type { enforceRateLimit as EnforceRateLimit } from './rateLimit';
import {
  blocklistId,
  hashPreviewToken,
  isBlocked,
  isImageUrlAllowed,
  normalizeBlocklistValue,
  type ConsentState,
  type LegalForm,
  type SyncMode,
} from './eventImport';
import {
  IMPORT_RETENTION_DAYS,
  OUTREACH_TEMPLATE_VERSION,
  renderOutreachMail,
  type OutreachMail,
} from './importOutreachMail';

type Doc = Record<string, unknown>;

/**
 * Version of the consent texts on the preview page. KEEP IN SYNC with
 * CONSENT_WORDING_VERSION in src/utils/importConsent.js
 * (tests/lib/importConsent.spec.ts compares both). Bump it whenever the
 * meaning of the texts changes: a stale page is then refused.
 */
export const CONSENT_WORDING_VERSION = '2026-11-v1';

export const PREVIEW_TOKEN_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
export const PREVIEW_TOKEN_TTL_MS = PREVIEW_TOKEN_TTL_DAYS * DAY_MS;
export const IMPORT_RETENTION_MS = IMPORT_RETENTION_DAYS * DAY_MS;

/** Subcollection of import_organizers/{id}: one doc per preview view. */
export const IMPORT_PREVIEW_VIEWS = 'previewViews';
/** Fixed doc id of the one outreach mail (import_organizers/{id}/outreach/mail). */
export const OUTREACH_DOC_ID = 'mail';
/**
 * Path of the preview page. Below /vorschau (noindex headers, robots.txt, analytics
 * redaction), but not /vorschau/<token> itself: that is the pre-entry preview
 * (docs/pre-entries.md), whose tokens look the same.
 */
export const PREVIEW_PATH = '/vorschau/import';
/** Query parameter that opens the preview with "Ablehnen" preselected. */
export const DECLINE_QUERY = 'aktion=ablehnen';
/** Static privacy page of the import (src/pages/LegalPage.jsx). */
export const IMPORT_PRIVACY_PATH = '/datenschutz-import';

/** Actor recorded for writes the organizer triggers through the preview link. */
export const PREVIEW_ACTOR = 'import-preview';

export const PROD_PROJECT_ID = 'spirieventsvbg';

/**
 * Real outreach mails on production are controlled by `app_settings/importOutreach`
 * `{ productionEnabled, dailyLimit }` (Super-Admin writes, default OFF and a small limit), so the
 * kill switch needs no deploy. Outside production a real address is never used at all.
 */
export const OUTREACH_DAILY_LIMIT_DEFAULT = 10;
/** Hard ceiling in code: the setting can never raise the limit above this. */
export const OUTREACH_DAILY_LIMIT_MAX = 50;

export interface OutreachSettings {
  productionEnabled: boolean;
  dailyLimit: number;
}

/** Missing or malformed settings mean: off, default limit. The limit is clamped to 1..MAX. */
export function normalizeOutreachSettings(raw: unknown): OutreachSettings {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Doc;
  const n = typeof d.dailyLimit === 'number' && Number.isFinite(d.dailyLimit) ? d.dailyLimit : NaN;
  return {
    productionEnabled: d.productionEnabled === true,
    dailyLimit: Number.isNaN(n)
      ? OUTREACH_DAILY_LIMIT_DEFAULT
      : Math.min(OUTREACH_DAILY_LIMIT_MAX, Math.max(1, Math.floor(n))),
  };
}

/** "2026-11-24" in Vienna: the day a real mail counts for. */
export function outreachDayKey(nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowMs));
}

export const CONSENT_ACTIONS = ['approve_once', 'approve_sync', 'self_manage', 'decline'] as const;
export type ConsentAction = (typeof CONSENT_ACTIONS)[number];

export interface ConsentScopes {
  event: boolean;
  images: boolean;
  persons: boolean;
}

const NO_SCOPES: ConsentScopes = { event: false, images: false, persons: false };

const GENERIC_LINK_ERROR = 'Dieser Link ist ungültig oder abgelaufen.';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ORGANIZER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const READ_LIMIT = { maxAttempts: 30, windowMs: 10 * 60 * 1000 };
const CONSENT_LIMIT = { maxAttempts: 10, windowMs: 10 * 60 * 1000 };

// ── Records (times as epoch millis) ──────────────────────────────────────

export interface OrganizerRecord {
  id: string;
  name: string;
  website: string;
  contactEmail: string | null;
  legalForm: LegalForm;
  regionId: string;
  consent: ConsentState;
  syncMode: SyncMode;
  previewTokenHash: string | null;
  previewTokenExpiresAtMs: number | null;
  deleteAfterMs: number | null;
  consentRecord: { action?: string; scopes?: Partial<ConsentScopes> } | null;
}

/** An events doc with `curation.organizerRef` == the organizer. */
export interface CuratedEvent {
  id: string;
  data: Doc;
}

/** An import_candidates doc of the organizer. */
export interface CandidateDoc {
  id: string;
  data: Doc;
}

// ── Token ────────────────────────────────────────────────────────────────

/** 32 random bytes, base64url: 43 characters. */
export function generatePreviewToken(): string {
  return randomBytes(32).toString('base64url');
}

/** `previewTokenHash`: the one implementation lives in eventImport.ts (also used by the claim). */
export { hashPreviewToken };

/** The one error for a malformed, unknown or expired link. */
export function invalidLinkError(): HttpsError {
  return new HttpsError('not-found', GENERIC_LINK_ERROR);
}

export function isPreviewTokenValid(organizer: OrganizerRecord | null, nowMs: number): boolean {
  return (
    !!organizer &&
    !!organizer.previewTokenHash &&
    organizer.previewTokenExpiresAtMs != null &&
    organizer.previewTokenExpiresAtMs > nowMs
  );
}

export function previewUrlFor(origin: string, token: string): string {
  return `${origin}${PREVIEW_PATH}/${token}`;
}

export function declineUrlFor(origin: string, token: string): string {
  return `${previewUrlFor(origin, token)}?${DECLINE_QUERY}`;
}

// ── Public preview payload ───────────────────────────────────────────────

export interface PreviewEvent {
  /** Position in this list only (no Firestore id). */
  key: string;
  title: string;
  date: string;
  endDate: string;
  time: string;
  endTime: string;
  place: string;
  city: string;
  isOnline: boolean;
  contribution: string;
  fee: number | null;
  feeMax: number | null;
  priceCurrency: string | null;
  link: string;
  category: string;
  /** Plain text (the event stores escaped <p> HTML). */
  description: string;
  /** URL on the organizer's own site (hotlinked by the browser), or null. */
  imageUrl: string | null;
  published: boolean;
}

export interface ImportPreview {
  organizer: { name: string; website: string };
  consent: ConsentState;
  syncMode: SyncMode;
  scopes: ConsentScopes | null;
  wordingVersion: string;
  retentionDays: number;
  expiresAt: string;
  events: PreviewEvent[];
}

const s = (value: unknown, max = 500): string =>
  typeof value === 'string' ? value.slice(0, max) : '';
const n = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** The stored description HTML as plain text (paragraphs kept). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Events the organizer sees and decides about: curated, pending or approved. */
export function previewableEvents(events: CuratedEvent[]): CuratedEvent[] {
  return events
    .filter((e) => e.data.status === 'pending' || e.data.status === 'approved')
    .sort((a, b) => s(a.data.date).localeCompare(s(b.data.date)));
}

/** Image URL of an event: the candidate's URL, only if it lies on the source page's site. */
export function previewImageUrl(event: CuratedEvent, candidates: CandidateDoc[]): string | null {
  const candidate = candidates.find((c) => c.data.eventId === event.id);
  if (!candidate) return null;
  const url = candidate.data.imageUrl;
  const curation = (event.data.curation ?? {}) as Doc;
  const source = candidate.data.sourceUrl ?? curation.sourceUrl;
  return isImageUrlAllowed(url, source) ? (url as string) : null;
}

export function toPreviewEvent(
  event: CuratedEvent,
  index: number,
  candidates: CandidateDoc[]
): PreviewEvent {
  const d = event.data;
  return {
    key: `e${index + 1}`,
    title: s(d.title, 200),
    date: s(d.date, 10),
    endDate: s(d.endDate, 10),
    time: s(d.time, 5),
    endTime: s(d.endTime, 5),
    place: s(d.place, 200),
    city: s(d.city, 120),
    isOnline: d.isOnline === true,
    contribution: s(d.contribution, 20),
    fee: n(d.fee),
    feeMax: n(d.feeMax),
    priceCurrency: typeof d.priceCurrency === 'string' ? d.priceCurrency : null,
    link: s(d.link, 2000),
    category: s(d.category, 40),
    description: htmlToPlainText(s(d.description, 20000)).slice(0, 5000),
    imageUrl: previewImageUrl(event, candidates),
    published: d.status === 'approved',
  };
}

function storedScopes(organizer: OrganizerRecord): ConsentScopes | null {
  const scopes = organizer.consentRecord?.scopes;
  if (!scopes) return null;
  return {
    event: scopes.event === true,
    images: scopes.images === true,
    persons: scopes.persons === true,
  };
}

export function buildImportPreview(
  organizer: OrganizerRecord,
  events: CuratedEvent[],
  candidates: CandidateDoc[]
): ImportPreview {
  const shown = organizer.consent === 'declined' ? [] : previewableEvents(events);
  return {
    organizer: { name: s(organizer.name, 200), website: s(organizer.website, 500) },
    consent: organizer.consent,
    syncMode: organizer.syncMode,
    scopes: storedScopes(organizer),
    wordingVersion: CONSENT_WORDING_VERSION,
    retentionDays: IMPORT_RETENTION_DAYS,
    expiresAt: new Date(organizer.previewTokenExpiresAtMs ?? 0).toISOString(),
    events: shown.map((e, i) => toPreviewEvent(e, i, candidates)),
  };
}

// ── Consent ──────────────────────────────────────────────────────────────

export interface ConsentInput {
  token: string;
  action: ConsentAction;
  scopes: ConsentScopes;
  wordingVersion: string;
}

export function assertPreviewToken(raw: unknown): string {
  if (typeof raw !== 'string' || !TOKEN_PATTERN.test(raw)) throw invalidLinkError();
  return raw;
}

export function parseConsentInput(raw: unknown): ConsentInput {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Doc;
  const token = assertPreviewToken(data.token);
  const action = data.action as ConsentAction;
  if (!CONSENT_ACTIONS.includes(action)) {
    throw new HttpsError('invalid-argument', 'Unknown action.');
  }
  const rawScopes = (data.scopes && typeof data.scopes === 'object' ? data.scopes : {}) as Doc;
  for (const key of ['event', 'images', 'persons'] as const) {
    if (rawScopes[key] !== undefined && typeof rawScopes[key] !== 'boolean') {
      throw new HttpsError('invalid-argument', `scopes.${key} must be true or false.`);
    }
  }
  const isApproval = action === 'approve_once' || action === 'approve_sync';
  const scopes: ConsentScopes = isApproval
    ? {
        event: rawScopes.event === true,
        images: rawScopes.images === true,
        persons: rawScopes.persons === true,
      }
    : { ...NO_SCOPES };
  if (isApproval && !scopes.event) {
    throw new HttpsError('invalid-argument', 'The event consent is required.', {
      reason: 'event-scope-required',
    });
  }
  const wordingVersion = typeof data.wordingVersion === 'string' ? data.wordingVersion : '';
  if (wordingVersion !== CONSENT_WORDING_VERSION) {
    throw new HttpsError('failed-precondition', 'The page is outdated. Please reload it.', {
      reason: 'wording-outdated',
    });
  }
  return { token, action, scopes, wordingVersion };
}

export type ConsentDecision =
  { kind: 'apply' } | { kind: 'unchanged' } | { kind: 'refuse'; reason: 'declined' | 'claimed' };

const sameScopes = (a: ConsentScopes | null, b: ConsentScopes): boolean =>
  !!a && a.event === b.event && a.images === b.images && a.persons === b.persons;

/**
 * The consent state machine. `declined` and `claimed` are final (a declined
 * organizer can only decline again, a no-op); repeating an action with the
 * same scopes changes nothing; anything else applies (also a change of mind
 * between approve_once / approve_sync / other scopes, or a later decline,
 * which withdraws an earlier approval).
 */
export function decideConsent(
  organizer: Pick<OrganizerRecord, 'consent' | 'syncMode' | 'consentRecord'>,
  action: ConsentAction,
  scopes: ConsentScopes
): ConsentDecision {
  const { consent } = organizer;
  if (consent === 'claimed') {
    // The organizer took the events over (ticket 7). Claiming is not consent, so
    // approving stays possible (and needed for the events to go public); a
    // claimed organizer deletes their own events instead of declining here.
    if (action === 'decline') return { kind: 'refuse', reason: 'claimed' };
    if (action === 'self_manage') return { kind: 'unchanged' };
    return sameScopes(storedScopes(organizer as OrganizerRecord), scopes) &&
      organizer.consentRecord?.action === action
      ? { kind: 'unchanged' }
      : { kind: 'apply' };
  }
  if (consent === 'declined') {
    return action === 'decline' ? { kind: 'unchanged' } : { kind: 'refuse', reason: 'declined' };
  }
  const current = storedScopes(organizer as OrganizerRecord);
  if (action === 'approve_once' && consent === 'manual_ok' && sameScopes(current, scopes)) {
    return { kind: 'unchanged' };
  }
  if (action === 'approve_sync' && consent === 'sync_ok' && sameScopes(current, scopes)) {
    return { kind: 'unchanged' };
  }
  if (action === 'self_manage' && organizer.syncMode === 'self_managed') {
    return { kind: 'unchanged' };
  }
  return { kind: 'apply' };
}

/** Marker for "delete this field" in a plan (FieldValue.delete() in Firestore). */
export const DELETE_FIELD = Symbol('deleteField');
export type Patch = Record<string, unknown>;

export interface BlocklistEntry {
  id: string;
  kind: 'email' | 'domain';
}

export interface ImageCopyItem {
  eventId: string;
  imageUrl: string;
  sourceUrl: string;
}

export interface ConsentPlan {
  organizerId: string;
  organizerPatch: Patch;
  /** Dotted keys allowed (e.g. `curation.consentAt`). */
  eventUpdates: Array<{ id: string; patch: Patch }>;
  eventDeletes: string[];
  candidateUpdates: Array<{ id: string; patch: Patch }>;
  blocklist: BlocklistEntry[];
  /** Images to copy into our storage after the writes (scopes.images only). */
  imagesToCopy: ImageCopyItem[];
}

/** Hashes for the blocklist: the e-mail address and the website domain. */
export function blocklistEntriesFor(
  organizer: Pick<OrganizerRecord, 'contactEmail' | 'website'>
): BlocklistEntry[] {
  const entries: BlocklistEntry[] = [];
  const email = normalizeBlocklistValue(organizer.contactEmail ?? '');
  if (email.includes('@')) entries.push({ id: blocklistId(email), kind: 'email' });
  const domain = normalizeBlocklistValue(organizer.website ?? '');
  if (domain && !domain.includes('@') && domain.includes('.')) {
    entries.push({ id: blocklistId(domain), kind: 'domain' });
  }
  return entries.filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i);
}

/**
 * The writes of one consent action (apply decisions only). `slugs` holds the
 * free slug per pending event (resolveApprovalSlug), `curatorUid` is recorded
 * as approvedBy, so moderation logs show "tribe Redaktion" approved it.
 */
export function planConsent({
  organizer,
  events,
  candidates,
  input,
  now,
  curatorUid,
  slugs = {},
}: {
  organizer: OrganizerRecord;
  events: CuratedEvent[];
  candidates: CandidateDoc[];
  input: Pick<ConsentInput, 'action' | 'scopes' | 'wordingVersion'>;
  now: Date;
  curatorUid: string | null;
  slugs?: Record<string, string>;
}): ConsentPlan {
  const { action, scopes, wordingVersion } = input;
  const plan: ConsentPlan = {
    organizerId: organizer.id,
    organizerPatch: { updatedAt: now },
    eventUpdates: [],
    eventDeletes: [],
    candidateUpdates: [],
    blocklist: [],
    imagesToCopy: [],
  };
  const record = { at: now, wordingVersion, scopes, action };

  if (action === 'self_manage') {
    // Intent only, NOT consent: no consentRecord, events stay pending. The page
    // then opens the claim flow (/uebernehmen?claim=<token>, ticket 7), which
    // moves the events into the organizer's own account.
    plan.organizerPatch.syncMode = 'self_managed';
    plan.organizerPatch.selfManageRequestedAt = now;
    return plan;
  }

  if (action === 'decline') {
    Object.assign(plan.organizerPatch, {
      consent: 'declined',
      syncMode: 'declined',
      consentRecord: { ...record, scopes: { ...NO_SCOPES } },
      contactEmail: null,
      sourceUrls: [],
      deleteAfter: null,
    });
    plan.blocklist = blocklistEntriesFor(organizer);
    plan.eventDeletes = events.map((e) => e.id);
    plan.candidateUpdates = candidates.map((c) => ({
      id: c.id,
      patch: {
        status: 'rejected',
        rawExtract: DELETE_FIELD,
        dateQuote: DELETE_FIELD,
        imageUrl: null,
        eventId: null,
        updatedAt: now,
      },
    }));
    return plan;
  }

  // approve_once / approve_sync (parseConsentInput guarantees scopes.event).
  // A claimed organizer stays `claimed` / `self_managed`; only the record and
  // the events change.
  Object.assign(
    plan.organizerPatch,
    organizer.consent === 'claimed'
      ? { consentRecord: record, deleteAfter: null }
      : {
          consent: action === 'approve_sync' ? 'sync_ok' : 'manual_ok',
          syncMode: action === 'approve_sync' ? 'sync_consented' : 'curated_once',
          consentRecord: record,
          deleteAfter: null,
        }
  );
  if (!scopes.event) return plan;
  for (const event of events) {
    const status = event.data.status;
    if (status !== 'pending' && status !== 'approved') continue;
    const curation = (event.data.curation ?? {}) as Doc;
    const patch: Patch = { updatedAt: now };
    if (curation.consentAt == null) patch['curation.consentAt'] = now;
    if (status === 'pending') {
      patch.status = 'approved';
      patch.approvedBy = curatorUid ?? PREVIEW_ACTOR;
      patch.approvedAt = now;
      const slug = slugs[event.id];
      if (slug && slug !== event.data.slug) patch.slug = slug;
    }
    plan.eventUpdates.push({ id: event.id, patch });
    if (scopes.images && !event.data.imageUrl) {
      const imageUrl = previewImageUrl(event, candidates);
      if (imageUrl) {
        plan.imagesToCopy.push({
          eventId: event.id,
          imageUrl,
          sourceUrl: s(
            candidates.find((c) => c.data.eventId === event.id)?.data.sourceUrl ??
              curation.sourceUrl,
            2000
          ),
        });
      }
    }
  }
  return plan;
}

// ── Outreach ─────────────────────────────────────────────────────────────

export type OutreachRefusal =
  'blocklisted' | 'consent-not-none' | 'individual' | 'no-contact' | 'already-sent' | 'no-events';

/** Why the one mail must not go out, or null. Order = most important first. */
export function outreachRefusal(
  organizer: OrganizerRecord,
  {
    blocked,
    outreachExists,
    eventCount,
    force,
  }: { blocked: boolean; outreachExists: boolean; eventCount: number; force: boolean }
): OutreachRefusal | null {
  if (blocked) return 'blocklisted';
  if (outreachExists) return 'already-sent';
  if (organizer.consent !== 'none') return 'consent-not-none';
  if (organizer.legalForm === 'individual' && !force) return 'individual';
  if (!organizer.contactEmail) return 'no-contact';
  if (eventCount === 0) return 'no-events';
  return null;
}

export type RecipientDecision =
  | { ok: true; to: string; test: boolean }
  | {
      ok: false;
      reason: 'disabled-in-production' | 'test-recipient-required' | 'bad-test-recipient';
    };

/**
 * Who gets the mail. Outside production a real organizer address is NEVER
 * used: only a test recipient, and the subject says "[TEST]". On production
 * nothing goes out while the production switch (`productionEnabled`) is off.
 */
export function resolveOutreachRecipient({
  projectId,
  contactEmail,
  testRecipient,
  productionEnabled = false,
}: {
  projectId: string | undefined;
  contactEmail: string;
  testRecipient: unknown;
  productionEnabled?: boolean;
}): RecipientDecision {
  const test =
    typeof testRecipient === 'string' && testRecipient.trim()
      ? testRecipient.trim().toLowerCase()
      : null;
  if (test !== null && (!EMAIL_PATTERN.test(test) || test.length > 200)) {
    return { ok: false, reason: 'bad-test-recipient' };
  }
  if (projectId === PROD_PROJECT_ID) {
    if (!productionEnabled) return { ok: false, reason: 'disabled-in-production' };
    return test ? { ok: true, to: test, test: true } : { ok: true, to: contactEmail, test: false };
  }
  if (!test) return { ok: false, reason: 'test-recipient-required' };
  return { ok: true, to: test, test: true };
}

// ── Purge ────────────────────────────────────────────────────────────────

/** Unanswered organizers (none / asked) whose `deleteAfter` has passed. */
export function isImportDataExpired(
  organizer: Pick<OrganizerRecord, 'consent' | 'deleteAfterMs'>,
  nowMs: number
): boolean {
  return (
    (organizer.consent === 'none' || organizer.consent === 'asked') &&
    organizer.deleteAfterMs != null &&
    organizer.deleteAfterMs <= nowMs
  );
}

export interface PurgePlan {
  organizerId: string;
  /** The organizer stays as a tombstone (name, website, consent, outreach log), so it is never mailed twice. */
  organizerPatch: Patch;
  candidateDeletes: string[];
  /** Curated events that were never public (pending / draft / trashed). */
  eventDeletes: string[];
  deletePreviewViews: boolean;
}

export function planOrganizerPurge(
  organizer: OrganizerRecord,
  events: CuratedEvent[],
  candidates: CandidateDoc[],
  now: Date
): PurgePlan {
  return {
    organizerId: organizer.id,
    organizerPatch: {
      contactEmail: null,
      previewTokenHash: null,
      previewTokenExpiresAt: null,
      sourceUrls: [],
      deleteAfter: null,
      purgedAt: now,
      updatedAt: now,
    },
    candidateDeletes: candidates.map((c) => c.id),
    eventDeletes: events.filter((e) => e.data.status !== 'approved').map((e) => e.id),
    deletePreviewViews: true,
  };
}

// ── Handlers ─────────────────────────────────────────────────────────────

export interface ImportAuditEntry {
  action: 'importPreviewLink' | 'importConsent' | 'importOutreachMail' | 'importPurge';
  actorUid: string;
  organizerId: string;
  [key: string]: unknown;
}

export interface OutreachLog {
  status: 'queued' | 'sent' | 'failed';
  templateVersion: string;
  test: boolean;
  queuedAt?: Date;
  sentAt?: Date | null;
  messageId?: string | null;
  error?: string | null;
}

export interface ImportDeps {
  now: () => number;
  generateToken: () => string;
  /** Site the links point to (projectSiteOrigin). */
  siteOrigin: string;
  /** GCLOUD_PROJECT of the running functions. */
  projectId: string | undefined;
  readRoleDoc: RoleDocReader;
  enforceRateLimit: typeof EnforceRateLimit;
  getOrganizer: (id: string) => Promise<OrganizerRecord | null>;
  findOrganizerByTokenHash: (hash: string) => Promise<OrganizerRecord | null>;
  updateOrganizer: (id: string, patch: Patch) => Promise<void>;
  listCuratedEvents: (organizerId: string) => Promise<CuratedEvent[]>;
  listCandidates: (organizerId: string) => Promise<CandidateDoc[]>;
  logPreviewView: (
    organizerId: string,
    view: { at: Date; imageUrls: string[]; eventCount: number }
  ) => Promise<void>;
  addAuditEntry: (entry: ImportAuditEntry) => Promise<void>;
  getCuratorUid: () => Promise<string | null>;
  /** A slug no other approved event uses (resolveSlugForApproval on the server). */
  resolveApprovalSlug: (eventId: string, slug: string) => Promise<string>;
  applyConsentPlan: (plan: ConsentPlan) => Promise<void>;
  /** Copies consented images into our storage; never throws (best effort). */
  copyConsentedImages: (items: ImageCopyItem[]) => Promise<{ copied: number; failed: number }>;
  /** Which of these import_blocklist ids exist. */
  existingBlocklistIds: (ids: string[]) => Promise<string[]>;
  getOutreach: (organizerId: string) => Promise<OutreachLog | null>;
  /** Creates outreach/mail with status queued; false if a non-failed one exists (race). */
  claimOutreach: (organizerId: string, log: OutreachLog) => Promise<boolean>;
  updateOutreach: (organizerId: string, patch: Partial<OutreachLog>) => Promise<void>;
  /** Sends one mail (tracking off); returns the Mailgun message id. */
  sendMail: (mail: OutreachMail, meta: { organizerId: string }) => Promise<{ id: string }>;
  /** Counts one real (non-test) mail in the running totals the bounce rate is measured against. */
  recordRealSend: () => Promise<void>;
  /** `app_settings/importOutreach`, normalised (missing = off, default limit). */
  getOutreachSettings: () => Promise<OutreachSettings>;
  /** Counts one real mail for `dayKey`; false (nothing counted) once `limit` is reached. */
  takeOutreachSlot: (dayKey: string, limit: number) => Promise<boolean>;
  regionNameOf: (regionId: string) => string | null;
  /** inPhrase ("in Tirol") and country of a region, for the mail's regional wording. */
  regionMetaOf?: (regionId: string) => { inPhrase: string; country: string } | null;
}

interface CallableRequest {
  auth?: { uid?: string } | null;
  data?: unknown;
  rawRequest?: unknown;
}

function parseOrganizerId(raw: unknown): string {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Doc;
  const id = data.organizerId;
  if (typeof id !== 'string' || !ORGANIZER_ID_PATTERN.test(id)) {
    throw new HttpsError('invalid-argument', 'organizerId is required.');
  }
  return id;
}

async function organizerOrNotFound(deps: ImportDeps, id: string): Promise<OrganizerRecord> {
  const organizer = await deps.getOrganizer(id);
  if (!organizer) throw new HttpsError('not-found', 'Organizer not found.');
  return organizer;
}

/** New token on the organizer; returns the plain token (only in the link). */
async function issueToken(
  deps: ImportDeps,
  organizerId: string
): Promise<{ token: string; expiresAtMs: number }> {
  const token = deps.generateToken();
  const expiresAtMs = deps.now() + PREVIEW_TOKEN_TTL_MS;
  await deps.updateOrganizer(organizerId, {
    previewTokenHash: hashPreviewToken(token),
    previewTokenExpiresAt: new Date(expiresAtMs),
    updatedAt: new Date(deps.now()),
  });
  return { token, expiresAtMs };
}

export async function createPreviewLinkHandler(
  request: CallableRequest,
  deps: ImportDeps
): Promise<{ url: string; expiresAt: string }> {
  const actorUid = request.auth?.uid;
  await assertSuperAdmin(actorUid, deps.readRoleDoc);
  const organizerId = parseOrganizerId(request.data);
  const regenerate = (request.data as Doc | null)?.regenerate === true;
  const organizer = await organizerOrNotFound(deps, organizerId);
  if (organizer.consent === 'declined') {
    throw new HttpsError('failed-precondition', 'The organizer declined.', { reason: 'declined' });
  }
  // Only the hash is stored, so an existing link cannot be shown again: a new
  // one replaces it (and the old one stops working) only on purpose.
  if (isPreviewTokenValid(organizer, deps.now()) && !regenerate) {
    throw new HttpsError('failed-precondition', 'A valid link exists already.', {
      reason: 'link-exists',
      expiresAt: new Date(organizer.previewTokenExpiresAtMs as number).toISOString(),
    });
  }
  const { token, expiresAtMs } = await issueToken(deps, organizerId);
  await deps.addAuditEntry({
    action: 'importPreviewLink',
    actorUid: actorUid as string,
    organizerId,
    regenerated: regenerate,
  });
  return {
    url: previewUrlFor(deps.siteOrigin, token),
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

async function organizerForToken(deps: ImportDeps, rawToken: unknown): Promise<OrganizerRecord> {
  const token = assertPreviewToken(rawToken);
  const organizer = await deps.findOrganizerByTokenHash(hashPreviewToken(token));
  if (!organizer || !isPreviewTokenValid(organizer, deps.now())) throw invalidLinkError();
  return organizer;
}

export async function getImportPreviewHandler(
  request: CallableRequest,
  deps: ImportDeps
): Promise<ImportPreview> {
  deps.enforceRateLimit(request as never, 'importPreview', READ_LIMIT);
  const organizer = await organizerForToken(deps, (request.data as Doc | null)?.token);
  const [events, candidates] = await Promise.all([
    deps.listCuratedEvents(organizer.id),
    deps.listCandidates(organizer.id),
  ]);
  const preview = buildImportPreview(organizer, events, candidates);
  // Which of the organizer's images their browser was shown, and when (no IP).
  await deps.logPreviewView(organizer.id, {
    at: new Date(deps.now()),
    imageUrls: preview.events.map((e) => e.imageUrl).filter((u): u is string => !!u),
    eventCount: preview.events.length,
  });
  return preview;
}

export interface ConsentResult {
  consent: ConsentState;
  syncMode: SyncMode;
  changed: boolean;
  approvedEvents: number;
  imagesCopied: number;
}

export async function submitImportConsentHandler(
  request: CallableRequest,
  deps: ImportDeps
): Promise<ConsentResult> {
  deps.enforceRateLimit(request as never, 'importConsent', CONSENT_LIMIT);
  const data = (request.data ?? {}) as Doc;
  // Token first, so a wrong link never learns anything about the other fields.
  const organizer = await organizerForToken(deps, data.token);
  const input = parseConsentInput(data);
  return applyConsent(deps, organizer, input, PREVIEW_ACTOR);
}

/**
 * Decide and apply a consent action for an organizer (shared by the public preview page and the
 * Super-Admin's "mark as declined"). `actor` is written to the audit log.
 */
async function applyConsent(
  deps: ImportDeps,
  organizer: OrganizerRecord,
  input: ConsentInput,
  actor: string
): Promise<ConsentResult> {
  const decision = decideConsent(organizer, input.action, input.scopes);
  if (decision.kind === 'refuse') {
    throw new HttpsError('failed-precondition', 'This decision cannot be changed here.', {
      reason: decision.reason,
    });
  }
  if (decision.kind === 'unchanged') {
    return {
      consent: organizer.consent,
      syncMode: organizer.syncMode,
      changed: false,
      approvedEvents: 0,
      imagesCopied: 0,
    };
  }

  const [events, candidates, curatorUid] = await Promise.all([
    deps.listCuratedEvents(organizer.id),
    deps.listCandidates(organizer.id),
    deps.getCuratorUid(),
  ]);
  const slugs: Record<string, string> = {};
  if (input.action === 'approve_once' || input.action === 'approve_sync') {
    for (const event of events) {
      const slug = event.data.slug;
      if (event.data.status === 'pending' && typeof slug === 'string' && slug) {
        slugs[event.id] = await deps.resolveApprovalSlug(event.id, slug);
      }
    }
  }
  const now = new Date(deps.now());
  const plan = planConsent({ organizer, events, candidates, input, now, curatorUid, slugs });
  await deps.applyConsentPlan(plan);
  const approvedEvents = plan.eventUpdates.filter((u) => u.patch.status === 'approved').length;
  await deps.addAuditEntry({
    action: 'importConsent',
    actorUid: actor,
    organizerId: organizer.id,
    consentAction: input.action,
    scopes: input.scopes,
    wordingVersion: input.wordingVersion,
    approvedEvents,
    deletedEvents: plan.eventDeletes.length,
    blocklisted: plan.blocklist.length,
  });
  const images =
    plan.imagesToCopy.length > 0
      ? await deps.copyConsentedImages(plan.imagesToCopy)
      : { copied: 0, failed: 0 };
  return {
    consent: (plan.organizerPatch.consent as ConsentState) ?? organizer.consent,
    syncMode: (plan.organizerPatch.syncMode as SyncMode) ?? organizer.syncMode,
    changed: true,
    approvedEvents,
    imagesCopied: images.copied,
  };
}

/**
 * Super-Admin: mark an organizer as declined, e.g. after a "Nein" reply by mail. Same effect as the
 * decline link in the mail (data deleted, blocklist, no further mail). Idempotent.
 */
export async function declineOrganizerHandler(
  request: CallableRequest,
  deps: ImportDeps
): Promise<ConsentResult> {
  const actorUid = request.auth?.uid;
  await assertSuperAdmin(actorUid, deps.readRoleDoc);
  const organizerId = parseOrganizerId(request.data);
  const organizer = await organizerOrNotFound(deps, organizerId);
  const input: ConsentInput = {
    token: '',
    action: 'decline',
    scopes: { ...NO_SCOPES },
    wordingVersion: CONSENT_WORDING_VERSION,
  };
  return applyConsent(deps, organizer, input, actorUid as string);
}

export interface OutreachResult {
  sent: true;
  to: string;
  test: boolean;
  messageId: string;
  previewExpiresAt: string;
}

export async function sendOutreachMailHandler(
  request: CallableRequest,
  deps: ImportDeps
): Promise<OutreachResult> {
  const actorUid = request.auth?.uid;
  await assertSuperAdmin(actorUid, deps.readRoleDoc);
  const organizerId = parseOrganizerId(request.data);
  const data = (request.data ?? {}) as Doc;
  const force = data.force === true;
  const organizer = await organizerOrNotFound(deps, organizerId);

  // The address, its domain and the website domain, each with parent domains (isBlocked).
  const candidateIds = [
    ...new Set([...blocklistEntriesFor(organizer).map((b) => b.id), ...parentDomainIds(organizer)]),
  ];
  const existing = candidateIds.length ? await deps.existingBlocklistIds(candidateIds) : [];
  const blocked = isBlocked(
    { email: organizer.contactEmail, website: organizer.website },
    existing
  );
  const outreach = await deps.getOutreach(organizerId);
  const events = previewableEvents(await deps.listCuratedEvents(organizerId));
  const refusal = outreachRefusal(organizer, {
    blocked,
    outreachExists: !!outreach && outreach.status !== 'failed',
    eventCount: events.length,
    force,
  });
  if (refusal) {
    throw new HttpsError('failed-precondition', `Outreach refused: ${refusal}.`, {
      reason: refusal,
    });
  }
  const settings = await deps.getOutreachSettings();
  const recipient = resolveOutreachRecipient({
    projectId: deps.projectId,
    contactEmail: organizer.contactEmail as string,
    testRecipient: data.testRecipient,
    productionEnabled: settings.productionEnabled,
  });
  if (!recipient.ok) {
    throw new HttpsError('failed-precondition', `Outreach refused: ${recipient.reason}.`, {
      reason: recipient.reason,
    });
  }

  const nowMs = deps.now();
  // Only real mails count towards the daily limit (test mails go to our own address).
  if (
    !recipient.test &&
    !(await deps.takeOutreachSlot(outreachDayKey(nowMs), settings.dailyLimit))
  ) {
    throw new HttpsError('failed-precondition', 'Outreach refused: daily-limit.', {
      reason: 'daily-limit',
    });
  }
  const claimed = await deps.claimOutreach(organizerId, {
    status: 'queued',
    templateVersion: OUTREACH_TEMPLATE_VERSION,
    test: recipient.test,
    queuedAt: new Date(nowMs),
    sentAt: null,
    messageId: null,
    error: null,
  });
  if (!claimed) {
    throw new HttpsError('failed-precondition', 'Outreach refused: already-sent.', {
      reason: 'already-sent',
    });
  }

  const { token, expiresAtMs } = await issueToken(deps, organizerId);
  const deleteAfterMs = nowMs + IMPORT_RETENTION_MS;
  const mail = renderOutreachMail({
    to: recipient.to,
    organizerName: organizer.name,
    website: organizer.website,
    contactEmail: organizer.contactEmail as string,
    regionName: deps.regionNameOf(organizer.regionId),
    regionIn: deps.regionMetaOf?.(organizer.regionId)?.inPhrase ?? null,
    country: deps.regionMetaOf?.(organizer.regionId)?.country ?? null,
    events: events.map((e) => ({
      title: s(e.data.title, 200),
      date: s(e.data.date, 10),
      link: s(e.data.link, 2000) || s(((e.data.curation ?? {}) as Doc).sourceUrl, 2000),
    })),
    previewUrl: previewUrlFor(deps.siteOrigin, token),
    declineUrl: declineUrlFor(deps.siteOrigin, token),
    privacyUrl: `${deps.siteOrigin}${IMPORT_PRIVACY_PATH}`,
    linkValidUntil: new Date(expiresAtMs).toISOString(),
    deleteAfter: new Date(deleteAfterMs).toISOString(),
    test: recipient.test,
    assetBase: deps.siteOrigin,
  });

  let messageId: string;
  try {
    ({ id: messageId } = await deps.sendMail(mail, { organizerId }));
  } catch (err) {
    await deps.updateOutreach(organizerId, {
      status: 'failed',
      error: err instanceof Error ? err.message.slice(0, 500) : 'send failed',
    });
    throw new HttpsError('internal', 'The mail could not be sent.');
  }
  await deps.updateOutreach(organizerId, {
    status: 'sent',
    sentAt: new Date(deps.now()),
    messageId,
  });
  if (!recipient.test) await deps.recordRealSend();
  await deps.updateOrganizer(organizerId, {
    consent: 'asked',
    deleteAfter: new Date(deleteAfterMs),
    updatedAt: new Date(deps.now()),
  });
  await deps.addAuditEntry({
    action: 'importOutreachMail',
    actorUid: actorUid as string,
    organizerId,
    test: recipient.test,
    templateVersion: OUTREACH_TEMPLATE_VERSION,
    messageId,
  });
  return {
    sent: true,
    to: recipient.to,
    test: recipient.test,
    messageId,
    previewExpiresAt: new Date(expiresAtMs).toISOString(),
  };
}

/** Blocklist ids of the parent domains (e.g. example.at for events.example.at). */
function parentDomainIds(organizer: Pick<OrganizerRecord, 'contactEmail' | 'website'>): string[] {
  const ids = new Set<string>();
  const email = normalizeBlocklistValue(organizer.contactEmail ?? '');
  const domains = [
    email.includes('@') ? (email.split('@').pop() ?? '') : '',
    normalizeBlocklistValue(organizer.website ?? ''),
  ];
  for (const domain of domains) {
    const labels = domain.split('.').filter(Boolean);
    for (let i = 0; i < labels.length - 1; i += 1) ids.add(blocklistId(labels.slice(i).join('.')));
  }
  return [...ids];
}
