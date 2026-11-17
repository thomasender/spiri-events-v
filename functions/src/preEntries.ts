/**
 * Pre-entered events ("Events vorab eintragen", Trello 6afb1116, docs/pre-entries.md).
 *
 *   preEntryAdmin({ action, ... })      Super-Admin / Regions-Moderator:in of the event's region
 *   preEntryOrganizer({ action, token }) anyone with a link token (claim: signed in)
 *   preEntriesDaily                      scheduler: log expiry, delete old expired / rejected entries
 *
 * Feature flag app_settings/preEntries.mode ('off' | 'admins' | 'all'), checked
 * here on every call: 'admins' = Super-Admins only, 'all' = all staff. With
 * 'off' the links stop working and only Super-Admins can still list / delete
 * (DSGVO clean-up).
 *
 * Security model (like moderatorInvites.ts): a link carries a random token (32
 * bytes, base64url); only its SHA-256 is stored in `pre_entry_tokens/{hash}`.
 * Every "Kontaktieren" issues a fresh token, so the moderator always has a link
 * to paste while only hashes are stored; all preview tokens of an entry share
 * its expiry and are revoked together. A takeover token (after publishing
 * without a profile) works once.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import { parseStaffRole, readRoleDoc, type RoleDocReader, type StaffRole } from './staffRoles';
import { enforceRateLimit } from './rateLimit';
import { requestSiteOrigin } from './siteOrigin';
import {
  buildPreEntryModeratorNoticePayload,
  buildPreEntryOrganizerMessagePayload,
  type EmailPayload,
  type PreEntryNoticeKind,
} from './emailTemplates';
import {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_EU_BASE,
  MAILGUN_FROM,
  MAILGUN_REPLY_TO,
  isMailgunDryRun,
  sendMailgunMessage,
} from './mailgun';
import { SYSTEM_UID } from './systemAccount';
import {
  COMMENT_MAX,
  CONTACT_ATTEMPTS_MAX,
  CONTACT_CHANNELS,
  DAY_MS,
  NOTE_MAX,
  PRE_ENTRIES_COLLECTION,
  PRE_ENTRY_LIMITS,
  PRE_ENTRY_SETTINGS_DOC,
  PRE_ENTRY_TOKENS_COLLECTION,
  PreEntryInputError,
  SERVER_TIME,
  TEMPLATE_KEYS,
  appendCapped,
  buildClaimEventPatch,
  buildHandOverEventPatch,
  buildPublishEventPatch,
  canOrganizerClaim,
  canOrganizerPublish,
  canOrganizerReject,
  dailyActionFor,
  daysLeft,
  eventDeletableWithEntry,
  fromPreEntryRecord,
  generatePreEntryToken,
  hashPreEntryToken,
  isPreviewExpired,
  isWellFormedToken,
  normalizeContact,
  normalizeText,
  parsePreEntrySettings,
  previewEventData,
  staffMayUsePreEntries,
  toPreEntryRecord,
  toTokenRecord,
  withLog,
  type ContactChannel,
  type LogEntry,
  type PreEntryRecord,
  type PreEntrySettings,
  type TemplateKey,
  type TokenKind,
  type TokenRecord,
  type TokenState,
  tokenState,
} from './preEntriesLogic';

if (getApps().length === 0) {
  initializeApp();
}

const STAGING_PROJECT_ID = 'tribe-vbg-staging';
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SUBJECT_MAX = 200;
const MESSAGE_MAX = 5000;

const ADMIN_LIMIT = { maxAttempts: 120, windowMs: 10 * 60 * 1000 };
const VIEW_LIMIT = { maxAttempts: 60, windowMs: 10 * 60 * 1000 };
const ACTION_LIMIT = { maxAttempts: 20, windowMs: 10 * 60 * 1000 };

// ── Dependencies (injected, so the handlers are unit-tested without Firebase) ──

type Doc = Record<string, unknown>;

export interface PreEntryTx {
  getEntry(eventId: string): Promise<PreEntryRecord | null>;
  getEvent(eventId: string): Promise<Doc | null>;
  getToken(id: string): Promise<TokenRecord | null>;
  setEntry(entry: PreEntryRecord): void;
  deleteEntry(eventId: string): void;
  updateEvent(eventId: string, patch: Doc): void;
  deleteEvent(eventId: string): void;
  setToken(id: string, token: TokenRecord): void;
  updateToken(id: string, patch: Partial<TokenRecord>): void;
  deleteToken(id: string): void;
}

export interface UserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
}

export interface PreEntryDeps {
  readRoleDoc: RoleDocReader;
  now: () => number;
  generateToken: () => string;
  /** Site the links point to (the staging site on staging, else the caller's domain). */
  baseUrl: string;
  getSettings: () => Promise<PreEntrySettings>;
  runTransaction: <T>(fn: (tx: PreEntryTx) => Promise<T>) => Promise<T>;
  listEntries: () => Promise<PreEntryRecord[]>;
  listTokenIds: (eventId: string) => Promise<string[]>;
  getEvents: (ids: string[]) => Promise<Record<string, Doc | null>>;
  getUser: (uid: string) => Promise<UserInfo | null>;
  /** Sends one mail; throws on failure. */
  sendMail: (payload: EmailPayload) => Promise<void>;
  enforceRateLimit: typeof enforceRateLimit;
}

interface CallableRequest {
  auth?: { uid?: string; token?: Record<string, unknown> } | null;
  data?: unknown;
  rawRequest?: unknown;
}

// ── Helpers ──────────────────────────────────────────────────────────────

export function preEntryBaseUrl(
  request: CallableRequest,
  env: Record<string, string | undefined> = process.env
): string {
  if (env.GCLOUD_PROJECT === STAGING_PROJECT_ID) return `https://${STAGING_PROJECT_ID}.web.app`;
  return requestSiteOrigin(request as never);
}

export function previewUrlFor(token: string, baseUrl: string): string {
  return `${baseUrl}/vorschau/${encodeURIComponent(token)}`;
}

function adminUrl(baseUrl: string): string {
  return `${baseUrl}/admin?tab=vorab`;
}

function assertEventId(raw: unknown): string {
  if (typeof raw !== 'string' || !EVENT_ID_PATTERN.test(raw)) {
    throw new HttpsError('invalid-argument', 'Invalid event id.');
  }
  return raw;
}

function input<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof PreEntryInputError) throw new HttpsError('invalid-argument', err.message);
    throw err;
  }
}

function regionOf(event: Doc): string {
  return typeof event.regionId === 'string' && event.regionId ? event.regionId : 'vorarlberg';
}

function mayManageRegion(role: StaffRole, regionId: string): boolean {
  return role.kind === 'superAdmin' || role.regionIds.includes(regionId);
}

function displayNameOf(user: UserInfo | null): string {
  return (user?.displayName || user?.email || 'Team').trim().slice(0, 120);
}

function intDays(raw: unknown, [min, max]: readonly [number, number]): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min || raw > max) {
    throw new HttpsError('invalid-argument', 'Invalid number of days.');
  }
  return raw;
}

async function notifyModerator(
  deps: PreEntryDeps,
  entry: PreEntryRecord,
  kind: PreEntryNoticeKind,
  eventTitle: string,
  comment?: string
): Promise<void> {
  try {
    const moderator = await deps.getUser(entry.createdBy);
    if (!moderator?.email) return;
    await deps.sendMail(
      buildPreEntryModeratorNoticePayload({
        recipient: moderator.email,
        kind,
        eventTitle,
        comment: comment ?? null,
        adminUrl: adminUrl(deps.baseUrl),
      })
    );
  } catch (err) {
    // Best effort: the organizer's action stands even if the mail fails.
    logger.error('pre-entry moderator notice failed', { eventId: entry.eventId, kind, err });
  }
}

// ── Staff ────────────────────────────────────────────────────────────────

interface StaffContext {
  uid: string;
  role: StaffRole;
  name: string;
  settings: PreEntrySettings;
}

async function staffContext(
  request: CallableRequest,
  deps: PreEntryDeps,
  { allowWhenOff = false } = {}
): Promise<StaffContext> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
  const role = parseStaffRole(await deps.readRoleDoc(uid));
  if (!role) throw new HttpsError('permission-denied', 'Staff only.');
  const settings = await deps.getSettings();
  const allowed =
    staffMayUsePreEntries(settings.mode, role.kind) || (allowWhenOff && role.kind === 'superAdmin');
  if (!allowed) throw new HttpsError('failed-precondition', 'Pre-entries are switched off.');
  const user = await deps.getUser(uid);
  return { uid, role, name: displayNameOf(user), settings };
}

/** Loads entry + event in the transaction and checks the region. */
async function loadManaged(
  tx: PreEntryTx,
  ctx: StaffContext,
  eventId: string
): Promise<{ entry: PreEntryRecord; event: Doc | null }> {
  const entry = await tx.getEntry(eventId);
  if (!entry) throw new HttpsError('not-found', 'Pre-entry not found.');
  if (!mayManageRegion(ctx.role, entry.regionId)) {
    throw new HttpsError('permission-denied', 'Not your region.');
  }
  return { entry, event: await tx.getEvent(eventId) };
}

function logBy(ctx: StaffContext, now: number, type: LogEntry['type'], detail?: string): LogEntry {
  return { atMs: now, type, by: ctx.uid, byName: ctx.name, ...(detail ? { detail } : {}) };
}

function issueToken(
  tx: PreEntryTx,
  deps: PreEntryDeps,
  eventId: string,
  kind: TokenKind,
  createdBy: string,
  now: number
): string {
  const token = deps.generateToken();
  tx.setToken(hashPreEntryToken(token), {
    eventId,
    kind,
    createdAtMs: now,
    createdBy,
    usedAtMs: null,
  });
  return token;
}

export interface PreEntryListRow extends Omit<PreEntryRecord, 'log'> {
  log: LogEntry[];
  event: {
    exists: boolean;
    title: string;
    date: string;
    time: string;
    slug: string | null;
    status: string | null;
    ownedBySystem: boolean;
    updatedAtMs: number | null;
    place: string;
    city: string;
    isOnline: boolean;
    category: string;
    /** First ~150 characters of the description as plain text (for message templates). */
    excerpt: string;
  };
}

export function descriptionExcerpt(html: unknown, max = 150): string {
  const text = typeof html === 'string' ? html.replace(/<[^>]*>/g, ' ') : '';
  const plain = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()} …`;
}

function eventSummary(event: Doc | null): PreEntryListRow['event'] {
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    exists: Boolean(event),
    title: s(event?.title),
    date: s(event?.date),
    time: s(event?.time),
    slug: typeof event?.slug === 'string' ? event.slug : null,
    status: typeof event?.status === 'string' ? event.status : null,
    ownedBySystem: event?.createdBy === SYSTEM_UID,
    updatedAtMs: typeof event?.updatedAtMs === 'number' ? event.updatedAtMs : null,
    place: s(event?.place),
    city: s(event?.city),
    isOnline: event?.isOnline === true,
    category: s(event?.category),
    excerpt: descriptionExcerpt(event?.description),
  };
}

export async function preEntryAdminHandler(
  request: CallableRequest,
  deps: PreEntryDeps
): Promise<Record<string, unknown>> {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const action = data.action;
  const lenient = action === 'list' || action === 'delete';
  const ctx = await staffContext(request, deps, { allowWhenOff: lenient });
  deps.enforceRateLimit(request as never, 'preEntryAdmin', ADMIN_LIMIT);
  const now = deps.now();

  switch (action) {
    case 'list': {
      const entries = (await deps.listEntries()).filter((e) =>
        mayManageRegion(ctx.role, e.regionId)
      );
      const events = await deps.getEvents(entries.map((e) => e.eventId));
      const rows: PreEntryListRow[] = entries.map((e) => ({
        ...e,
        event: eventSummary(events[e.eventId] ?? null),
      }));
      return { rows, settings: ctx.settings, now };
    }

    case 'create': {
      const eventId = assertEventId(data.eventId);
      const contact = input(() => normalizeContact(data.contact));
      const note = input(() => normalizeText(data.note, NOTE_MAX));
      const validDays =
        intDays(data.validDays, PRE_ENTRY_LIMITS.validDays) ?? ctx.settings.validDays;
      return deps.runTransaction(async (tx) => {
        if (await tx.getEntry(eventId)) {
          throw new HttpsError('already-exists', 'This event is already a pre-entry.');
        }
        const event = await tx.getEvent(eventId);
        if (!event) throw new HttpsError('not-found', 'Event not found.');
        // The moderator saved the event as her own draft (images uploaded); only
        // she can hand it over, and only while nobody reviewed it.
        if (event.createdBy !== ctx.uid || event.status !== 'draft') {
          throw new HttpsError('failed-precondition', 'Only your own draft can be pre-entered.');
        }
        const regionId = regionOf(event);
        if (!mayManageRegion(ctx.role, regionId)) {
          throw new HttpsError('permission-denied', 'Not your region.');
        }
        const organizerName = String(
          (event.organizer as Doc | undefined)?.name ?? contact.name ?? ''
        ).trim();
        const entry: PreEntryRecord = {
          eventId,
          regionId,
          status: 'draft',
          contact: { ...contact, name: contact.name || organizerName },
          note,
          createdBy: ctx.uid,
          createdByName: ctx.name,
          createdAtMs: now,
          expiresAtMs: now + validDays * DAY_MS,
          linksRevokedAtMs: null,
          firstViewedAtMs: null,
          lastViewedAtMs: null,
          viewCount: 0,
          lastContactAtMs: null,
          contactAttempts: [],
          organizerComment: '',
          lastReactionAtMs: null,
          publishedAtMs: null,
          publishedBy: null,
          rejectedAtMs: null,
          claimedAtMs: null,
          claimedBy: null,
          claimedName: '',
          checkedOutBy: null,
          expiredLoggedAtMs: null,
          log: [],
        };
        entry.log = [logBy(ctx, now, 'created')];
        tx.updateEvent(eventId, buildHandOverEventPatch(event));
        const token = issueToken(tx, deps, eventId, 'preview', ctx.uid, now);
        tx.setEntry(entry);
        return {
          eventId,
          previewUrl: previewUrlFor(token, deps.baseUrl),
          expiresAtMs: entry.expiresAtMs,
        };
      });
    }

    case 'update': {
      const eventId = assertEventId(data.eventId);
      const contact = input(() => normalizeContact(data.contact));
      const note = input(() => normalizeText(data.note, NOTE_MAX));
      return deps.runTransaction(async (tx) => {
        const { entry } = await loadManaged(tx, ctx, eventId);
        tx.setEntry({
          ...entry,
          contact,
          note,
          log: withLog(entry, logBy(ctx, now, 'contact_updated')),
        });
        return { ok: true };
      });
    }

    case 'issueLink': {
      const eventId = assertEventId(data.eventId);
      const kind: TokenKind = data.kind === 'takeover' ? 'takeover' : 'preview';
      return deps.runTransaction(async (tx) => {
        const { entry, event } = await loadManaged(tx, ctx, eventId);
        if (!event) throw new HttpsError('not-found', 'Event not found.');
        if (entry.status === 'claimed' || entry.status === 'rejected') {
          throw new HttpsError('failed-precondition', 'This pre-entry is closed.');
        }
        if (kind === 'preview' && entry.status === 'published') {
          throw new HttpsError('failed-precondition', 'Already published: send a takeover link.');
        }
        let next = { ...entry };
        // "Neu erzeugen": an expired preview starts a new period.
        if (kind === 'preview' && isPreviewExpired(entry, now)) {
          next = {
            ...next,
            expiresAtMs: now + ctx.settings.validDays * DAY_MS,
            expiredLoggedAtMs: null,
            log: withLog(next, logBy(ctx, now, 'extended', `${ctx.settings.validDays}`)),
          };
        }
        const token = issueToken(tx, deps, eventId, kind, ctx.uid, now);
        next.log = withLog(next, logBy(ctx, now, 'link_issued', kind));
        tx.setEntry(next);
        return {
          url: previewUrlFor(token, deps.baseUrl),
          kind,
          expiresAtMs: next.expiresAtMs,
        };
      });
    }

    case 'extend': {
      const eventId = assertEventId(data.eventId);
      const days = intDays(data.days, PRE_ENTRY_LIMITS.validDays) ?? ctx.settings.validDays;
      return deps.runTransaction(async (tx) => {
        const { entry } = await loadManaged(tx, ctx, eventId);
        const expiresAtMs = Math.max(entry.expiresAtMs, now) + days * DAY_MS;
        tx.setEntry({
          ...entry,
          expiresAtMs,
          expiredLoggedAtMs: null,
          log: withLog(entry, logBy(ctx, now, 'extended', `${days}`)),
        });
        return { expiresAtMs };
      });
    }

    case 'revoke': {
      const eventId = assertEventId(data.eventId);
      return deps.runTransaction(async (tx) => {
        const { entry } = await loadManaged(tx, ctx, eventId);
        tx.setEntry({
          ...entry,
          linksRevokedAtMs: now,
          log: withLog(entry, logBy(ctx, now, 'revoked')),
        });
        return { ok: true };
      });
    }

    case 'logContact':
    case 'sendEmail': {
      const eventId = assertEventId(data.eventId);
      const channel: ContactChannel =
        action === 'sendEmail'
          ? 'email'
          : (CONTACT_CHANNELS as readonly string[]).includes(data.channel as string)
            ? (data.channel as ContactChannel)
            : 'other';
      const template: TemplateKey | null = (TEMPLATE_KEYS as readonly string[]).includes(
        data.template as string
      )
        ? (data.template as TemplateKey)
        : null;
      let mail: EmailPayload | null = null;
      if (action === 'sendEmail') {
        const subject = input(() => normalizeText(data.subject, SUBJECT_MAX));
        const text = input(() => normalizeText(data.text, MESSAGE_MAX));
        if (!subject || !text) throw new HttpsError('invalid-argument', 'Subject and text needed.');
        // Recipient read below, inside the region check.
        mail = { to: '', subject, text, html: '' };
      }
      const result = await deps.runTransaction(async (tx) => {
        const { entry } = await loadManaged(tx, ctx, eventId);
        if (mail && !entry.contact.email) {
          throw new HttpsError('failed-precondition', 'No e-mail address for this organizer.');
        }
        return { entry };
      });
      if (mail) {
        try {
          await deps.sendMail(
            buildPreEntryOrganizerMessagePayload({
              recipient: result.entry.contact.email,
              subject: mail.subject,
              text: mail.text,
            })
          );
        } catch (err) {
          logger.error('pre-entry organizer mail failed', { eventId, err });
          throw new HttpsError('unavailable', 'The e-mail could not be sent.');
        }
      }
      return deps.runTransaction(async (tx) => {
        const { entry } = await loadManaged(tx, ctx, eventId);
        const attempt = { channel, template, atMs: now, by: ctx.uid, byName: ctx.name };
        tx.setEntry({
          ...entry,
          status: entry.status === 'draft' ? 'contacted' : entry.status,
          lastContactAtMs: now,
          contactAttempts: appendCapped(entry.contactAttempts, attempt, CONTACT_ATTEMPTS_MAX),
          log: withLog(
            entry,
            logBy(ctx, now, 'contacted', `${channel}${template ? `:${template}` : ''}`)
          ),
        });
        return { ok: true, emailSent: Boolean(mail) };
      });
    }

    case 'setStatus': {
      const eventId = assertEventId(data.eventId);
      const status = data.status;
      if (status !== 'draft' && status !== 'contacted' && status !== 'rejected') {
        throw new HttpsError('invalid-argument', 'Unknown status.');
      }
      const comment = input(() => normalizeText(data.comment, COMMENT_MAX));
      return deps.runTransaction(async (tx) => {
        const { entry } = await loadManaged(tx, ctx, eventId);
        if (entry.status === 'published' || entry.status === 'claimed') {
          throw new HttpsError('failed-precondition', 'Already published.');
        }
        tx.setEntry({
          ...entry,
          status,
          ...(status === 'rejected'
            ? { rejectedAtMs: now, organizerComment: comment || entry.organizerComment }
            : {}),
          log: withLog(entry, logBy(ctx, now, 'status_set', status)),
        });
        return { ok: true };
      });
    }

    case 'publish': {
      // The organizer agreed outside the system ("Passt so" per WhatsApp).
      const eventId = assertEventId(data.eventId);
      return deps.runTransaction(async (tx) => {
        const { entry, event } = await loadManaged(tx, ctx, eventId);
        if (!event || event.status !== 'draft' || entry.status === 'claimed') {
          throw new HttpsError('failed-precondition', 'Cannot be published.');
        }
        if (entry.status === 'published') return { ok: true };
        tx.updateEvent(eventId, buildPublishEventPatch(ctx.uid));
        tx.setEntry({
          ...entry,
          status: 'published',
          publishedAtMs: now,
          publishedBy: ctx.uid,
          checkedOutBy: null,
          log: withLog(entry, logBy(ctx, now, 'published', 'moderator')),
        });
        return { ok: true, slug: typeof event.slug === 'string' ? event.slug : null };
      });
    }

    case 'checkout':
    case 'checkin': {
      const eventId = assertEventId(data.eventId);
      return deps.runTransaction(async (tx) => {
        const { entry, event } = await loadManaged(tx, ctx, eventId);
        if (!event) throw new HttpsError('not-found', 'Event not found.');
        if (action === 'checkout') {
          if (
            event.createdBy !== SYSTEM_UID ||
            event.status !== 'draft' ||
            (entry.status !== 'draft' && entry.status !== 'contacted')
          ) {
            throw new HttpsError('failed-precondition', 'Only unpublished pre-entries.');
          }
          tx.updateEvent(eventId, { createdBy: ctx.uid, updatedAt: SERVER_TIME });
          tx.setEntry({
            ...entry,
            checkedOutBy: ctx.uid,
            log: withLog(entry, logBy(ctx, now, 'checked_out')),
          });
          return { ok: true };
        }
        const holder = entry.checkedOutBy;
        if (!holder || event.createdBy !== holder) return { ok: true };
        if (holder !== ctx.uid && ctx.role.kind !== 'superAdmin') {
          throw new HttpsError('permission-denied', 'Checked out by someone else.');
        }
        tx.updateEvent(eventId, { ...buildHandOverEventPatch(event), status: 'draft' });
        tx.setEntry({
          ...entry,
          checkedOutBy: null,
          log: withLog(entry, logBy(ctx, now, 'checked_in')),
        });
        return { ok: true };
      });
    }

    case 'delete': {
      const eventId = assertEventId(data.eventId);
      const tokenIds = await deps.listTokenIds(eventId);
      return deps.runTransaction(async (tx) => {
        const { entry, event } = await loadManaged(tx, ctx, eventId);
        const deleteEvent = eventDeletableWithEntry(entry, event);
        if (deleteEvent) tx.deleteEvent(eventId);
        tokenIds.forEach((id) => tx.deleteToken(id));
        tx.deleteEntry(eventId);
        return { ok: true, eventDeleted: deleteEvent };
      });
    }

    default:
      throw new HttpsError('invalid-argument', 'Unknown action.');
  }
}

// ── Organizer (token) ────────────────────────────────────────────────────

export interface PreviewResult {
  state: TokenState | 'gone';
  kind: TokenKind | null;
  expiresAtMs: number | null;
  daysLeft: number | null;
  canPublish: boolean;
  canReject: boolean;
  canClaim: boolean;
  event: Record<string, unknown> | null;
  eventStatus: string | null;
}

const GONE: PreviewResult = {
  state: 'gone',
  kind: null,
  expiresAtMs: null,
  daysLeft: null,
  canPublish: false,
  canReject: false,
  canClaim: false,
  event: null,
  eventStatus: null,
};

async function loadByToken(
  tx: PreEntryTx,
  token: string
): Promise<{
  tokenId: string;
  record: TokenRecord;
  entry: PreEntryRecord;
  event: Doc;
} | null> {
  const tokenId = hashPreEntryToken(token);
  const record = await tx.getToken(tokenId);
  if (!record) return null;
  const entry = await tx.getEntry(record.eventId);
  const event = entry ? await tx.getEvent(record.eventId) : null;
  if (!entry || !event) return null;
  return { tokenId, record, entry, event };
}

export async function preEntryOrganizerHandler(
  request: CallableRequest,
  deps: PreEntryDeps
): Promise<Record<string, unknown>> {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const action = data.action;
  deps.enforceRateLimit(
    request as never,
    action === 'view' ? 'preEntryView' : 'preEntryAction',
    action === 'view' ? VIEW_LIMIT : ACTION_LIMIT
  );
  if (!isWellFormedToken(data.token)) {
    throw new HttpsError('invalid-argument', 'Invalid link.');
  }
  const token = data.token;
  const settings = await deps.getSettings();
  if (settings.mode === 'off') return { ...GONE };
  const now = deps.now();

  if (action === 'view') {
    const outcome = await deps.runTransaction(async (tx) => {
      const found = await loadByToken(tx, token);
      if (!found) return { result: { ...GONE }, firstView: null };
      const { record, entry, event } = found;
      const state = tokenState(entry, record, now);
      const result: PreviewResult = {
        state,
        kind: record.kind,
        expiresAtMs: record.kind === 'preview' ? entry.expiresAtMs : null,
        daysLeft: record.kind === 'preview' ? daysLeft(entry.expiresAtMs, now) : null,
        canPublish: canOrganizerPublish(state, record.kind),
        canReject: canOrganizerReject(state, record.kind),
        canClaim: canOrganizerClaim(state),
        event: state === 'revoked' || state === 'expired' ? null : previewEventData(event),
        eventStatus: typeof event.status === 'string' ? event.status : null,
      };
      if (state !== 'open' && state !== 'published') return { result, firstView: null };
      const firstView = entry.firstViewedAtMs == null;
      tx.setEntry({
        ...entry,
        firstViewedAtMs: entry.firstViewedAtMs ?? now,
        lastViewedAtMs: now,
        viewCount: entry.viewCount + 1,
        log: firstView ? withLog(entry, { atMs: now, type: 'viewed', by: 'organizer' }) : entry.log,
      });
      return { result, firstView: firstView ? entry : null };
    });
    if (outcome.firstView) {
      await notifyModerator(
        deps,
        outcome.firstView,
        'viewed',
        String(outcome.result.event?.title ?? '')
      );
    }
    return outcome.result as unknown as Record<string, unknown>;
  }

  if (action === 'publish') {
    if (data.rightsConfirmed !== true) {
      throw new HttpsError('invalid-argument', 'Please confirm that you may publish this event.');
    }
    const outcome = await deps.runTransaction(async (tx) => {
      const found = await loadByToken(tx, token);
      if (!found) throw new HttpsError('not-found', 'Link not found.');
      const { record, entry, event } = found;
      const state = tokenState(entry, record, now);
      if (!canOrganizerPublish(state, record.kind) || event.status !== 'draft') {
        throw new HttpsError('failed-precondition', `Link state: ${state}.`);
      }
      // Unchanged content prepared by the moderator: live at once, like an approval.
      tx.updateEvent(entry.eventId, buildPublishEventPatch(entry.createdBy));
      const takeover = issueToken(tx, deps, entry.eventId, 'takeover', 'organizer', now);
      tx.setEntry({
        ...entry,
        status: 'published',
        publishedAtMs: now,
        publishedBy: 'organizer',
        lastReactionAtMs: now,
        checkedOutBy: null,
        log: withLog(entry, { atMs: now, type: 'published', by: 'organizer' }),
      });
      return {
        entry,
        title: String(event.title ?? ''),
        slug: typeof event.slug === 'string' ? event.slug : null,
        takeover,
      };
    });
    await notifyModerator(deps, outcome.entry, 'published', outcome.title);
    return {
      ok: true,
      publicUrl: outcome.slug ? `${deps.baseUrl}/event/${outcome.slug}` : null,
      takeoverUrl: previewUrlFor(outcome.takeover, deps.baseUrl),
    };
  }

  if (action === 'reject') {
    const comment = input(() => normalizeText(data.comment, COMMENT_MAX));
    const outcome = await deps.runTransaction(async (tx) => {
      const found = await loadByToken(tx, token);
      if (!found) throw new HttpsError('not-found', 'Link not found.');
      const { record, entry, event } = found;
      const state = tokenState(entry, record, now);
      if (!canOrganizerReject(state, record.kind)) {
        throw new HttpsError('failed-precondition', `Link state: ${state}.`);
      }
      tx.setEntry({
        ...entry,
        status: 'rejected',
        rejectedAtMs: now,
        organizerComment: comment,
        lastReactionAtMs: now,
        log: withLog(entry, {
          atMs: now,
          type: 'rejected',
          by: 'organizer',
          ...(comment ? { detail: comment.slice(0, 200) } : {}),
        }),
      });
      return { entry, title: String(event.title ?? '') };
    });
    await notifyModerator(deps, outcome.entry, 'rejected', outcome.title, comment);
    return { ok: true };
  }

  if (action === 'claim') {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Please sign in first.');
    if (uid === SYSTEM_UID) throw new HttpsError('permission-denied', 'Not allowed.');
    const user = await deps.getUser(uid);
    if (!user) throw new HttpsError('not-found', 'Account not found.');
    const publish = data.publish === true;
    if (publish && data.rightsConfirmed !== true) {
      throw new HttpsError('invalid-argument', 'Please confirm that you may publish this event.');
    }
    const outcome = await deps.runTransaction(async (tx) => {
      const found = await loadByToken(tx, token);
      if (!found) throw new HttpsError('not-found', 'Link not found.');
      const { tokenId, record, entry, event } = found;
      const state = tokenState(entry, record, now);
      if (!canOrganizerClaim(state)) {
        throw new HttpsError('failed-precondition', `Link state: ${state}.`);
      }
      const publishNow =
        publish && canOrganizerPublish(state, record.kind) && event.status === 'draft';
      const patch = {
        ...buildClaimEventPatch(event, {
          uid,
          email: user.email,
          photoURL: user.photoURL ?? null,
        }),
        ...(publishNow
          ? {
              status: 'approved',
              approvedBy: entry.createdBy,
              approvedAt: SERVER_TIME,
              instagramConsent: false,
            }
          : {}),
      };
      tx.updateEvent(entry.eventId, patch);
      if (record.kind === 'takeover') tx.updateToken(tokenId, { usedAtMs: now });
      const name = displayNameOf(user);
      let log = withLog(entry, { atMs: now, type: 'claimed', by: uid, byName: name });
      log = appendCapped(
        log,
        {
          atMs: now,
          type: 'owner_changed',
          by: uid,
          byName: name,
          detail: `${String(event.createdBy ?? '')} -> ${uid}`,
        },
        200
      );
      if (publishNow) {
        log = appendCapped(log, { atMs: now, type: 'published', by: uid, byName: name }, 200);
      }
      tx.setEntry({
        ...entry,
        status: 'claimed',
        claimedAtMs: now,
        claimedBy: uid,
        claimedName: name,
        lastReactionAtMs: now,
        checkedOutBy: null,
        ...(publishNow ? { publishedAtMs: now, publishedBy: uid } : {}),
        log,
      });
      return {
        entry,
        title: String(event.title ?? ''),
        status: publishNow ? 'approved' : String(event.status ?? ''),
        slug: typeof event.slug === 'string' ? event.slug : null,
      };
    });
    await notifyModerator(deps, outcome.entry, 'claimed', outcome.title);
    return {
      ok: true,
      eventId: outcome.entry.eventId,
      eventStatus: outcome.status,
      slug: outcome.slug,
    };
  }

  throw new HttpsError('invalid-argument', 'Unknown action.');
}

// ── Scheduler ────────────────────────────────────────────────────────────

export async function preEntriesDailyHandler(
  deps: PreEntryDeps
): Promise<{ markedExpired: number; deleted: number }> {
  const settings = await deps.getSettings();
  const now = deps.now();
  let markedExpired = 0;
  let deleted = 0;
  for (const listed of await deps.listEntries()) {
    const action = dailyActionFor(listed, settings, now);
    if (action === 'none') continue;
    const tokenIds = action === 'delete' ? await deps.listTokenIds(listed.eventId) : [];
    await deps.runTransaction(async (tx) => {
      const entry = await tx.getEntry(listed.eventId);
      if (!entry || dailyActionFor(entry, settings, now) !== action) return;
      if (action === 'markExpired') {
        tx.setEntry({
          ...entry,
          expiredLoggedAtMs: now,
          log: withLog(entry, { atMs: now, type: 'expired', by: 'system' }),
        });
        markedExpired += 1;
        return;
      }
      const event = await tx.getEvent(entry.eventId);
      if (eventDeletableWithEntry(entry, event) && event?.status !== 'approved') {
        tx.deleteEvent(entry.eventId);
      }
      tokenIds.forEach((id) => tx.deleteToken(id));
      tx.deleteEntry(entry.eventId);
      deleted += 1;
    });
  }
  return { markedExpired, deleted };
}

// ── Firebase wiring ──────────────────────────────────────────────────────

function withServerTime(patch: Doc): Doc {
  return Object.fromEntries(
    Object.entries(patch).map(([k, v]) => [k, v === SERVER_TIME ? FieldValue.serverTimestamp() : v])
  );
}

function eventToDoc(data: Doc): Doc {
  const updatedAt = data.updatedAt as { toMillis?: () => number } | undefined;
  return {
    ...data,
    updatedAtMs: typeof updatedAt?.toMillis === 'function' ? updatedAt.toMillis() : null,
  };
}

async function sendViaMailgun(payload: EmailPayload): Promise<void> {
  if (isMailgunDryRun(process.env)) {
    logger.info('MAILGUN dry-run: would send pre-entry mail', {
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

function firestoreDeps(request: CallableRequest | null): PreEntryDeps {
  const db = getFirestore();
  const entries = db.collection(PRE_ENTRIES_COLLECTION);
  const tokens = db.collection(PRE_ENTRY_TOKENS_COLLECTION);
  const events = db.collection('events');
  return {
    readRoleDoc,
    now: () => Date.now(),
    generateToken: generatePreEntryToken,
    baseUrl: request ? preEntryBaseUrl(request) : preEntryBaseUrl({}),
    async getSettings() {
      const snap = await db.doc(`app_settings/${PRE_ENTRY_SETTINGS_DOC}`).get();
      return parsePreEntrySettings(snap.exists ? snap.data() : null);
    },
    runTransaction: (fn) =>
      db.runTransaction(async (t) => {
        const writes: Array<() => void> = [];
        const tx: PreEntryTx = {
          async getEntry(eventId) {
            const snap = await t.get(entries.doc(eventId));
            return snap.exists ? toPreEntryRecord(eventId, snap.data() ?? {}) : null;
          },
          async getEvent(eventId) {
            const snap = await t.get(events.doc(eventId));
            return snap.exists ? eventToDoc(snap.data() ?? {}) : null;
          },
          async getToken(id) {
            const snap = await t.get(tokens.doc(id));
            return snap.exists ? toTokenRecord(snap.data() ?? {}) : null;
          },
          setEntry(entry) {
            writes.push(() => t.set(entries.doc(entry.eventId), fromPreEntryRecord(entry)));
          },
          deleteEntry(eventId) {
            writes.push(() => t.delete(entries.doc(eventId)));
          },
          updateEvent(eventId, patch) {
            writes.push(() => t.update(events.doc(eventId), withServerTime(patch)));
          },
          deleteEvent(eventId) {
            writes.push(() => t.delete(events.doc(eventId)));
          },
          setToken(id, token) {
            writes.push(() => t.create(tokens.doc(id), { ...token }));
          },
          updateToken(id, patch) {
            writes.push(() => t.update(tokens.doc(id), { ...patch }));
          },
          deleteToken(id) {
            writes.push(() => t.delete(tokens.doc(id)));
          },
        };
        const result = await fn(tx);
        // All reads happen before any write, as Firestore transactions require.
        writes.forEach((w) => w());
        return result;
      }),
    async listEntries() {
      const snap = await entries.get();
      return snap.docs.map((d) => toPreEntryRecord(d.id, d.data()));
    },
    async listTokenIds(eventId) {
      const snap = await tokens.where('eventId', '==', eventId).get();
      return snap.docs.map((d) => d.id);
    },
    async getEvents(ids) {
      const out: Record<string, Doc | null> = {};
      if (ids.length === 0) return out;
      const snaps = await db.getAll(...ids.map((id) => events.doc(id)));
      snaps.forEach((snap) => {
        out[snap.id] = snap.exists ? eventToDoc(snap.data() ?? {}) : null;
      });
      return out;
    },
    async getUser(uid) {
      try {
        const user = await getAuth().getUser(uid);
        let displayName = user.displayName ?? null;
        let photoURL = user.photoURL ?? null;
        const profile = await db.doc(`users/${uid}/publicProfile/data`).get();
        if (profile.exists) {
          const p = profile.data() ?? {};
          if (typeof p.displayName === 'string' && p.displayName.trim())
            displayName = p.displayName;
          if (typeof p.photoURL === 'string' && p.photoURL) photoURL = p.photoURL;
        }
        return { uid, email: user.email ?? null, displayName, photoURL };
      } catch (err) {
        if ((err as { code?: string })?.code === 'auth/user-not-found') return null;
        throw err;
      }
    },
    sendMail: sendViaMailgun,
    enforceRateLimit,
  };
}

const MAIL_SECRETS = [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM, MAILGUN_REPLY_TO];

export const preEntryAdmin = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, secrets: MAIL_SECRETS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('preEntryAdmin', request);
    const result = await preEntryAdminHandler(request, firestoreDeps(request));
    const action = (request.data as { action?: unknown } | null)?.action;
    if (action !== 'list') {
      logger.info('preEntryAdmin', { uid: request.auth?.uid, action });
    }
    return result;
  }
);

export const preEntryOrganizer = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, secrets: MAIL_SECRETS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('preEntryOrganizer', request);
    return preEntryOrganizerHandler(request, firestoreDeps(request));
  }
);

export const preEntriesDaily = onSchedule(
  { region: 'europe-west3', schedule: 'every day 04:20', timeZone: 'Europe/Vienna' },
  async () => {
    const result = await preEntriesDailyHandler(firestoreDeps(null));
    logger.info('preEntriesDaily', result);
  }
);
