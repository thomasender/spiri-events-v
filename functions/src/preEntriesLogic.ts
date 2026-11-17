/**
 * Pure logic of the pre-entry feature ("Events vorab eintragen", Trello 6afb1116,
 * docs/pre-entries.md). No Firebase imports, so Vitest covers it directly.
 *
 * Data model (server-only collections, firestore.rules deny every client):
 *   pre_entries/{eventId}        contact data, status, link expiry, contacts, log
 *   pre_entry_tokens/{sha256}    { eventId, kind: 'preview' | 'takeover', createdAtMs, ... }
 * The event itself stays `events/{eventId}` with status 'draft', createdBy =
 * SYSTEM_UID and preEntry: true. Contact data NEVER goes into the event doc
 * (it becomes public once approved).
 */
import { createHash, randomBytes } from 'node:crypto';
import { SYSTEM_UID } from './systemAccount';

export const PRE_ENTRIES_COLLECTION = 'pre_entries';
export const PRE_ENTRY_TOKENS_COLLECTION = 'pre_entry_tokens';
export const PRE_ENTRY_SETTINGS_DOC = 'preEntries';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Placeholder for FieldValue.serverTimestamp(), replaced in the Firestore wiring. */
export const SERVER_TIME = '__serverTime__';

export const PRE_ENTRY_MODES = ['off', 'admins', 'all'] as const;
export type PreEntryMode = (typeof PRE_ENTRY_MODES)[number];

/**
 * KEEP IN SYNC with PRE_ENTRY_DEFAULTS / PRE_ENTRY_LIMITS in src/utils/preEntries.js
 * (tests/lib/preEntries.spec.ts compares both).
 */
export const PRE_ENTRY_DEFAULTS = {
  validDays: 14,
  reminderDays: 4,
  autoDeleteDays: 30,
} as const;

export const PRE_ENTRY_LIMITS = {
  validDays: [1, 60],
  reminderDays: [1, 30],
  autoDeleteDays: [0, 365],
} as const;

export interface PreEntrySettings {
  mode: PreEntryMode;
  validDays: number;
  reminderDays: number;
  /** Days after expiry / rejection until the scheduler deletes the entry; 0 = never. */
  autoDeleteDays: number;
}

function clampInt(value: unknown, [min, max]: readonly [number, number], fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const n = Math.round(value);
  if (n < min || n > max) return fallback;
  return n;
}

/** app_settings/preEntries -> settings; a missing doc means off with the defaults. */
export function parsePreEntrySettings(data: unknown): PreEntrySettings {
  const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const mode = (PRE_ENTRY_MODES as readonly string[]).includes(d.mode as string)
    ? (d.mode as PreEntryMode)
    : 'off';
  return {
    mode,
    validDays: clampInt(d.validDays, PRE_ENTRY_LIMITS.validDays, PRE_ENTRY_DEFAULTS.validDays),
    reminderDays: clampInt(
      d.reminderDays,
      PRE_ENTRY_LIMITS.reminderDays,
      PRE_ENTRY_DEFAULTS.reminderDays
    ),
    autoDeleteDays: clampInt(
      d.autoDeleteDays,
      PRE_ENTRY_LIMITS.autoDeleteDays,
      PRE_ENTRY_DEFAULTS.autoDeleteDays
    ),
  };
}

export type StaffKind = 'superAdmin' | 'regionModerator';

/** 'all': every staff member; 'admins': Super-Admins only; 'off': nobody. */
export function staffMayUsePreEntries(mode: PreEntryMode, kind: StaffKind | null): boolean {
  if (!kind) return false;
  if (mode === 'all') return true;
  if (mode === 'admins') return kind === 'superAdmin';
  return false;
}

// ── Tokens ────────────────────────────────────────────────────────────────

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** 32 random bytes, base64url: 43 characters. */
export function generatePreEntryToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Doc id of a token: the hex SHA-256 of it. Only the hash is stored. */
export function hashPreEntryToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isWellFormedToken(raw: unknown): raw is string {
  return typeof raw === 'string' && TOKEN_PATTERN.test(raw);
}

export type TokenKind = 'preview' | 'takeover';

export interface TokenRecord {
  eventId: string;
  kind: TokenKind;
  createdAtMs: number;
  createdBy: string;
  usedAtMs?: number | null;
}

// ── Contact data ─────────────────────────────────────────────────────────

export interface PreEntryContact {
  name: string;
  contactPerson: string;
  organization: string;
  email: string;
  phone: string;
  other: string;
}

export const CONTACT_LIMITS: Record<keyof PreEntryContact, number> = {
  name: 120,
  contactPerson: 120,
  organization: 120,
  email: 200,
  phone: 40,
  other: 300,
};
export const NOTE_MAX = 2000;
export const COMMENT_MAX = 1000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9 ()/.-]{5,40}$/;

export class PreEntryInputError extends Error {}

/** Trims, checks lengths and formats; needs at least one way to reach the organizer. */
export function normalizeContact(raw: unknown): PreEntryContact {
  const d = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = {} as PreEntryContact;
  for (const key of Object.keys(CONTACT_LIMITS) as Array<keyof PreEntryContact>) {
    const value = typeof d[key] === 'string' ? (d[key] as string).trim().replace(/\s+/g, ' ') : '';
    if (value.length > CONTACT_LIMITS[key]) {
      throw new PreEntryInputError(`Contact field ${key} is too long.`);
    }
    out[key] = value;
  }
  out.email = out.email.toLowerCase();
  if (out.email && !EMAIL_PATTERN.test(out.email)) {
    throw new PreEntryInputError('Invalid contact email.');
  }
  if (out.phone && !PHONE_PATTERN.test(out.phone)) {
    throw new PreEntryInputError('Invalid contact phone.');
  }
  if (!out.email && !out.phone && !out.other) {
    throw new PreEntryInputError('At least one way to contact the organizer is required.');
  }
  return out;
}

export function normalizeText(raw: unknown, max: number): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length > max) throw new PreEntryInputError('Text is too long.');
  return value;
}

// ── Entry, status, log ───────────────────────────────────────────────────

export type PreEntryStatus = 'draft' | 'contacted' | 'published' | 'claimed' | 'rejected';
export const PRE_ENTRY_STATUSES: readonly PreEntryStatus[] = [
  'draft',
  'contacted',
  'published',
  'claimed',
  'rejected',
];

export type ContactChannel = 'email' | 'whatsapp' | 'other';
export const CONTACT_CHANNELS: readonly ContactChannel[] = ['email', 'whatsapp', 'other'];
export type TemplateKey = 'initial' | 'reminder' | 'expiring' | 'published';
export const TEMPLATE_KEYS: readonly TemplateKey[] = [
  'initial',
  'reminder',
  'expiring',
  'published',
];

export interface ContactAttempt {
  channel: ContactChannel;
  template: TemplateKey | null;
  atMs: number;
  by: string;
  byName: string;
}

export type LogType =
  | 'created'
  | 'contact_updated'
  | 'link_issued'
  | 'extended'
  | 'revoked'
  | 'contacted'
  | 'status_set'
  | 'viewed'
  | 'published'
  | 'rejected'
  | 'claimed'
  | 'owner_changed'
  | 'checked_out'
  | 'checked_in'
  | 'expired';

export interface LogEntry {
  atMs: number;
  type: LogType;
  /** uid, 'organizer' or 'system'. */
  by: string;
  byName?: string;
  detail?: string;
}

export interface PreEntryRecord {
  eventId: string;
  regionId: string;
  status: PreEntryStatus;
  contact: PreEntryContact;
  note: string;
  createdBy: string;
  createdByName: string;
  createdAtMs: number;
  expiresAtMs: number;
  linksRevokedAtMs: number | null;
  firstViewedAtMs: number | null;
  lastViewedAtMs: number | null;
  viewCount: number;
  lastContactAtMs: number | null;
  contactAttempts: ContactAttempt[];
  organizerComment: string;
  /** Last time the organizer did something (publish, reject, claim). */
  lastReactionAtMs: number | null;
  publishedAtMs: number | null;
  publishedBy: string | null;
  rejectedAtMs: number | null;
  claimedAtMs: number | null;
  claimedBy: string | null;
  claimedName: string;
  checkedOutBy: string | null;
  expiredLoggedAtMs: number | null;
  log: LogEntry[];
}

export const LOG_MAX = 200;
export const CONTACT_ATTEMPTS_MAX = 100;

export function appendCapped<T>(list: readonly T[], item: T, max: number): T[] {
  const next = [...list, item];
  return next.length > max ? next.slice(next.length - max) : next;
}

export function withLog(entry: PreEntryRecord, log: LogEntry): LogEntry[] {
  return appendCapped(entry.log, log, LOG_MAX);
}

/** The preview link still runs: entry open (draft / contacted) and not past the expiry. */
export function isPreviewExpired(
  entry: Pick<PreEntryRecord, 'status' | 'expiresAtMs'>,
  now: number
): boolean {
  return (entry.status === 'draft' || entry.status === 'contacted') && entry.expiresAtMs <= now;
}

export type TokenState =
  'open' | 'expired' | 'revoked' | 'published' | 'claimed' | 'rejected' | 'used';

/** What a token link may do right now (preview page + every organizer action). */
export function tokenState(entry: PreEntryRecord, token: TokenRecord, now: number): TokenState {
  if (entry.status === 'claimed') return 'claimed';
  if (entry.status === 'rejected') return 'rejected';
  if (entry.linksRevokedAtMs != null && token.createdAtMs <= entry.linksRevokedAtMs) {
    return 'revoked';
  }
  if (token.kind === 'takeover' && token.usedAtMs) return 'used';
  if (entry.status === 'published') return 'published';
  if (token.kind === 'preview' && isPreviewExpired(entry, now)) return 'expired';
  // A takeover link of a not yet published entry only takes it over.
  return 'open';
}

export function canOrganizerPublish(state: TokenState, kind: TokenKind): boolean {
  return state === 'open' && kind === 'preview';
}

export function canOrganizerReject(state: TokenState, kind: TokenKind): boolean {
  return state === 'open' && kind === 'preview';
}

export function canOrganizerClaim(state: TokenState): boolean {
  return state === 'open' || state === 'published';
}

/** Whole days left (rounded up), never negative. */
export function daysLeft(expiresAtMs: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAtMs - now) / DAY_MS));
}

// ── Event patches ────────────────────────────────────────────────────────

/** Approval of the unchanged pre-entry under "Dein Tribe" (undoes a check-out). */
export function buildPublishEventPatch(approvedBy: string): Record<string, unknown> {
  return {
    status: 'approved',
    approvedBy,
    approvedAt: SERVER_TIME,
    updatedAt: SERVER_TIME,
    createdBy: SYSTEM_UID,
    instagramConsent: false,
  };
}

export interface ClaimingUser {
  uid: string;
  email: string | null;
  photoURL?: string | null;
}

/**
 * Owner change "Dein Tribe" -> organizer. The slug stays (public URL), the
 * shown organizer name stays (it was entered for this event), the hidden
 * organizer e-mail becomes the account's, so the owner mails reach the person.
 */
export function buildClaimEventPatch(
  event: Record<string, unknown>,
  user: ClaimingUser
): Record<string, unknown> {
  const organizer =
    event.organizer && typeof event.organizer === 'object'
      ? { ...(event.organizer as Record<string, unknown>) }
      : {};
  organizer.email = user.email ?? '';
  if (user.photoURL) organizer.photoURL = user.photoURL;
  return {
    createdBy: user.uid,
    preEntry: false,
    preEntryClaimedAt: SERVER_TIME,
    organizer,
    updatedAt: SERVER_TIME,
  };
}

/**
 * What the event looks like once the moderator handed it to "Dein Tribe": the
 * shown organizer name stays, the moderator's e-mail and photo go (no owner
 * mails to her, no wrong face next to the organizer's name).
 */
export function buildHandOverEventPatch(event: Record<string, unknown>): Record<string, unknown> {
  const o = (event.organizer ?? {}) as Record<string, unknown>;
  const organizer: Record<string, unknown> = { email: '' };
  for (const key of ['name', 'firstName', 'lastName']) {
    if (typeof o[key] === 'string') organizer[key] = o[key];
  }
  return {
    createdBy: SYSTEM_UID,
    preEntry: true,
    organizer,
    instagramConsent: false,
    updatedAt: SERVER_TIME,
  };
}

/** Event fields shown on the preview page (nothing about the owner or the review). */
export const PREVIEW_EVENT_FIELDS = [
  'title',
  'description',
  'date',
  'time',
  'endTime',
  'endDate',
  'place',
  'city',
  'bezirk',
  'isOnline',
  'imageUrl',
  'imageThumbUrl',
  'imageFocalPoint',
  'imageZoom',
  'category',
  'contribution',
  'fee',
  'feeMax',
  'priceCurrency',
  'feeNote',
  'firstSessionFree',
  'link',
  'kontakt',
  'registration',
  'recurrence',
  'recurrenceEndDate',
  'customDates',
  'exceptionDates',
  'regionId',
  'slug',
] as const;

function plain(value: unknown): unknown {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    if (typeof (value as { toMillis?: unknown }).toMillis === 'function') return null;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return null;
}

export function organizerNameOf(event: Record<string, unknown>): string {
  const o = (event.organizer ?? {}) as Record<string, unknown>;
  if (typeof o.name === 'string' && o.name.trim()) return o.name.trim();
  return [o.firstName, o.lastName]
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .join(' ');
}

export function previewEventData(event: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PREVIEW_EVENT_FIELDS) {
    if (event[key] !== undefined) out[key] = plain(event[key]);
  }
  out.organizerName = organizerNameOf(event);
  return out;
}

// ── Scheduler ────────────────────────────────────────────────────────────

export type DailyAction = 'none' | 'markExpired' | 'delete';

/**
 * What the daily job does with an entry: log the expiry once, and with
 * autoDeleteDays > 0 delete expired or rejected entries that many days later
 * (DSGVO: contact data of third parties is kept only as long as needed).
 * Published and claimed entries are never deleted automatically.
 */
export function dailyActionFor(
  entry: PreEntryRecord,
  settings: Pick<PreEntrySettings, 'autoDeleteDays'>,
  now: number
): DailyAction {
  const deleteAfter = settings.autoDeleteDays * DAY_MS;
  if (isPreviewExpired(entry, now)) {
    if (settings.autoDeleteDays > 0 && entry.expiresAtMs + deleteAfter <= now) return 'delete';
    return entry.expiredLoggedAtMs ? 'none' : 'markExpired';
  }
  if (
    entry.status === 'rejected' &&
    settings.autoDeleteDays > 0 &&
    entry.rejectedAtMs != null &&
    entry.rejectedAtMs + deleteAfter <= now
  ) {
    return 'delete';
  }
  return 'none';
}

/** The event may be deleted with its entry only while "Dein Tribe" (or the checked-out moderator) owns it. */
export function eventDeletableWithEntry(
  entry: Pick<PreEntryRecord, 'status' | 'checkedOutBy'>,
  event: Record<string, unknown> | null
): boolean {
  if (!event || entry.status === 'claimed') return false;
  return (
    event.createdBy === SYSTEM_UID ||
    (entry.checkedOutBy != null && event.createdBy === entry.checkedOutBy)
  );
}

// ── Record <-> Firestore data ────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const msOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export function toPreEntryRecord(eventId: string, data: Record<string, unknown>): PreEntryRecord {
  const contactRaw = (data.contact ?? {}) as Record<string, unknown>;
  const contact = Object.fromEntries(
    (Object.keys(CONTACT_LIMITS) as Array<keyof PreEntryContact>).map((k) => [
      k,
      str(contactRaw[k]),
    ])
  ) as unknown as PreEntryContact;
  return {
    eventId,
    regionId: str(data.regionId) || 'vorarlberg',
    status: (PRE_ENTRY_STATUSES as readonly string[]).includes(data.status as string)
      ? (data.status as PreEntryStatus)
      : 'draft',
    contact,
    note: str(data.note),
    createdBy: str(data.createdBy),
    createdByName: str(data.createdByName),
    createdAtMs: msOrNull(data.createdAtMs) ?? 0,
    expiresAtMs: msOrNull(data.expiresAtMs) ?? 0,
    linksRevokedAtMs: msOrNull(data.linksRevokedAtMs),
    firstViewedAtMs: msOrNull(data.firstViewedAtMs),
    lastViewedAtMs: msOrNull(data.lastViewedAtMs),
    viewCount: msOrNull(data.viewCount) ?? 0,
    lastContactAtMs: msOrNull(data.lastContactAtMs),
    contactAttempts: Array.isArray(data.contactAttempts)
      ? (data.contactAttempts as ContactAttempt[])
      : [],
    organizerComment: str(data.organizerComment),
    lastReactionAtMs: msOrNull(data.lastReactionAtMs),
    publishedAtMs: msOrNull(data.publishedAtMs),
    publishedBy: typeof data.publishedBy === 'string' ? data.publishedBy : null,
    rejectedAtMs: msOrNull(data.rejectedAtMs),
    claimedAtMs: msOrNull(data.claimedAtMs),
    claimedBy: typeof data.claimedBy === 'string' ? data.claimedBy : null,
    claimedName: str(data.claimedName),
    checkedOutBy: typeof data.checkedOutBy === 'string' ? data.checkedOutBy : null,
    expiredLoggedAtMs: msOrNull(data.expiredLoggedAtMs),
    log: Array.isArray(data.log) ? (data.log as LogEntry[]) : [],
  };
}

export function fromPreEntryRecord(entry: PreEntryRecord): Record<string, unknown> {
  const { eventId: _eventId, ...rest } = entry;
  return { ...rest };
}

export function toTokenRecord(data: Record<string, unknown>): TokenRecord | null {
  if (typeof data.eventId !== 'string' || !data.eventId) return null;
  const kind = data.kind === 'takeover' ? 'takeover' : data.kind === 'preview' ? 'preview' : null;
  if (!kind) return null;
  return {
    eventId: data.eventId,
    kind,
    createdAtMs: msOrNull(data.createdAtMs) ?? 0,
    createdBy: str(data.createdBy),
    usedAtMs: msOrNull(data.usedAtMs),
  };
}
