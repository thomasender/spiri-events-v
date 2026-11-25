/**
 * Event import ("kuratierte Events", docs/event-import.md): pure model and
 * helpers. No Firebase imports, so tests/lib/eventImport.spec.ts runs without
 * an emulator. The client/script side (constants, isCuratedEvent,
 * isCuratedWithoutConsent) is a synced copy in src/utils/eventImport.js,
 * guarded by the same spec.
 *
 * Super-Admins curate events of inactive regions found on the web. The events
 * are owned by a shared curator account (`app_settings/import.curatorUid`) and
 * carry `curation`. NOTHING curated is public before the organizer consented:
 * the event stays `pending` until the backend has written
 * `curation.consentAt`, and every public path also checks
 * isCuratedWithoutConsent() explicitly.
 *
 * Privacy: hashes only for preview tokens and the blocklist, no image is
 * copied to our storage before consent (candidates keep the source URL), no
 * personal names on the event.
 */
import { createHash } from 'crypto';

export const IMPORT_ORGANIZERS = 'import_organizers';
export const IMPORT_CANDIDATES = 'import_candidates';
export const IMPORT_RUNS = 'import_runs';
export const IMPORT_BLOCKLIST = 'import_blocklist';
/** Subcollection of import_organizers/{id}: one doc per outreach mail. */
export const IMPORT_OUTREACH = 'outreach';
/** `app_settings/import`: `{ curatorUid }`, written by scripts/ensure-curator-account.mjs. */
export const IMPORT_SETTINGS_DOC = 'app_settings/import';

/** Regions the import is built for (inactive regions; staging only for now). */
export const IMPORT_REGION_IDS = ['zuerich', 'tirol', 'berlin'] as const;

export const LEGAL_FORMS = ['company', 'verein', 'individual', 'unknown'] as const;
export type LegalForm = (typeof LEGAL_FORMS)[number];

export const CONSENT_STATES = [
  'none',
  'asked',
  'manual_ok',
  'sync_ok',
  'declined',
  'claimed',
] as const;
export type ConsentState = (typeof CONSENT_STATES)[number];

export const SYNC_MODES = ['curated_once', 'sync_consented', 'self_managed', 'declined'] as const;
export type SyncMode = (typeof SYNC_MODES)[number];

export const SOURCE_TYPES = ['jsonld', 'ical', 'api', 'llm', 'manual'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const CANDIDATE_STATUSES = [
  'found',
  'reviewed',
  'published',
  'rejected',
  'duplicate',
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const OUTREACH_STATUSES = ['queued', 'sent', 'bounced', 'replied', 'failed'] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const BLOCKLIST_KINDS = ['email', 'domain'] as const;
export type BlocklistKind = (typeof BLOCKLIST_KINDS)[number];

/** Consent states in which a curated event may go public. */
export const PUBLISHABLE_CONSENT_STATES: readonly ConsentState[] = [
  'manual_ok',
  'sync_ok',
  'claimed',
];

/** `events/{id}.curation`. Written only by the Admin SDK (the rules forbid any client change). */
export interface EventCuration {
  /** Id in import_organizers. */
  organizerRef: string;
  sourceUrl: string;
  importedAt: Date;
  /** The organizer may take the event over into an own account. */
  claimable: boolean;
  /** Set only by the backend once the organizer consented; until then the event is never public. */
  consentAt?: Date | null;
}

export interface ImportOrganizer {
  name: string;
  website?: string;
  /** Functional address only (info@, kontakt@), never a personal one. */
  contactEmail?: string;
  legalForm: LegalForm;
  regionId: string;
  consent: ConsentState;
  syncMode: SyncMode;
}

/** What the extractor found on the source page (facts only). */
export interface CandidateExtract {
  title?: string;
  date?: string;
  time?: string;
  endTime?: string;
  endDate?: string;
  place?: string;
  city?: string;
  /** District (Bezirk / Landkreis) of the place as in the register, when known. */
  bezirk?: string;
  lat?: number | null;
  lng?: number | null;
  isOnline?: boolean;
  contribution?: string;
  fee?: number | null;
  feeMax?: number | null;
  priceCurrency?: string;
  description?: string;
  link?: string;
  category?: string;
}

export interface ImportCandidate {
  regionId: string;
  organizerRef: string;
  sourceUrl: string;
  sourceType?: SourceType;
  rawExtract?: CandidateExtract;
  /** URL on the organizer's site only; never copied to our storage before consent. */
  imageUrl?: string | null;
  /** Individuals are excluded from the pilot: accepting needs an explicit `force`. */
  pilotExcluded?: boolean;
}

type Doc = Record<string, unknown>;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * `import_organizers.previewTokenHash`: sha256 (hex) of the plain preview
 * token. Only the hash is stored; the token travels in the outreach mail.
 */
export function hashPreviewToken(token: string): string {
  return sha256Hex(String(token ?? ''));
}

// ── Fingerprint ───────────────────────────────────────────────────────

const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref)$/i;

/**
 * Source URL in a stable form: lower-case host without "www.", no fragment,
 * no tracking parameters, remaining parameters sorted, no trailing slash,
 * http and https treated alike. Unparsable input is trimmed and lower-cased.
 */
export function normalizeSourceUrl(sourceUrl: string): string {
  const raw = String(sourceUrl ?? '').trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return raw.toLowerCase();
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  const path = url.pathname.replace(/\/+$/, '');
  return `${host}${url.port ? `:${url.port}` : ''}${path}${query}`;
}

/** Title for comparison: Unicode-normalised, lower-case, no accents/punctuation, single spaces. */
export function normalizeTitle(title: string): string {
  return String(title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function titleBigrams(title: string): string[] {
  const text = normalizeTitle(title).replace(/ /g, '');
  if (text.length < 2) return text ? [text] : [];
  const grams: string[] = [];
  for (let i = 0; i < text.length - 1; i += 1) grams.push(text.slice(i, i + 2));
  return grams;
}

/**
 * Similarity 0..1 of two event titles for the claim dedupe hint
 * (findCuratedMatches): Sørensen-Dice over character bigrams of the
 * normalised titles, so case, accents, punctuation and spacing do not matter.
 */
export function claimTitleSimilarity(a: string, b: string): number {
  const x = titleBigrams(a);
  const y = titleBigrams(b);
  if (x.length === 0 || y.length === 0) return 0;
  if (normalizeTitle(a) === normalizeTitle(b)) return 1;
  const counts = new Map<string, number>();
  for (const g of x) counts.set(g, (counts.get(g) ?? 0) + 1);
  let common = 0;
  for (const g of y) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      common += 1;
      counts.set(g, n - 1);
    }
  }
  return (2 * common) / (x.length + y.length);
}

/** YYYY-MM-DD from an ISO date or date-time; anything else trimmed. */
function normalizeDate(date: string): string {
  const raw = String(date ?? '').trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return match ? match[1] : raw;
}

/**
 * Stable sha256 (hex) of source URL, date and title, used to recognise the
 * same event across runs (import_candidates.fingerprint). Cosmetic
 * differences (tracking parameters, www., case, accents, punctuation, time
 * of day) do not change it.
 */
export function fingerprint(sourceUrl: string, date: string, title: string): string {
  return sha256Hex(
    [normalizeSourceUrl(sourceUrl), normalizeDate(date), normalizeTitle(title)].join('\n')
  );
}

// ── Blocklist ─────────────────────────────────────────────────────────

/** Lower-cased e-mail address or domain (without "www." / leading "@"). */
export function normalizeBlocklistValue(emailOrDomain: string): string {
  const value = String(emailOrDomain ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  if (value.includes('@')) return value;
  return value
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '')
    .replace(/\.$/, '');
}

export function blocklistKind(emailOrDomain: string): BlocklistKind {
  return normalizeBlocklistValue(emailOrDomain).includes('@') ? 'email' : 'domain';
}

/**
 * Doc id in import_blocklist: sha256 (hex) of the lower-cased e-mail or
 * domain. The plain address is never stored.
 */
export function blocklistId(emailOrDomain: string): string {
  const value = normalizeBlocklistValue(emailOrDomain);
  if (!value) throw new Error('blocklistId needs an e-mail address or domain');
  return sha256Hex(value);
}

/** Domain of an e-mail address or website URL ('' when there is none). */
function domainOf(value: string | null | undefined): string {
  const normalized = normalizeBlocklistValue(value ?? '');
  if (!normalized) return '';
  return normalized.includes('@') ? normalized.split('@').pop() || '' : normalized;
}

/**
 * Whether an organizer is on the blocklist: its e-mail address, the e-mail
 * domain or the website domain (also a parent domain of it) is in
 * `blockedIds` (doc ids of import_blocklist).
 */
export function isBlocked(
  { email, website }: { email?: string | null; website?: string | null },
  blockedIds: Iterable<string>
): boolean {
  const ids = blockedIds instanceof Set ? (blockedIds as Set<string>) : new Set(blockedIds);
  if (ids.size === 0) return false;
  const candidates = new Set<string>();
  const mail = normalizeBlocklistValue(email ?? '');
  if (mail.includes('@')) candidates.add(mail);
  for (const domain of [domainOf(email), domainOf(website)]) {
    const labels = domain.split('.').filter(Boolean);
    for (let i = 0; i < labels.length - 1; i += 1) candidates.add(labels.slice(i).join('.'));
  }
  return [...candidates].some((value) => ids.has(sha256Hex(value)));
}

// ── Curated events ────────────────────────────────────────────────────

function curationOf(event: unknown): Doc | null {
  if (!event || typeof event !== 'object') return null;
  const curation = (event as Doc).curation;
  return curation && typeof curation === 'object' ? (curation as Doc) : null;
}

/** The event was imported by the curation team (it carries `curation`). */
export function isCuratedEvent(event: unknown): boolean {
  return curationOf(event) !== null;
}

/**
 * A curated event nobody has claimed yet (`curation.claimable !== false`): it is
 * still owned by the curator account and has no organizer address, so there is
 * nobody to mail about its review / deletion. After the claim `claimable` is
 * false and the event behaves like a normal one.
 */
export function isUnclaimedCuratedEvent(event: unknown): boolean {
  const curation = curationOf(event);
  return curation !== null && curation.claimable !== false;
}

/**
 * A curated event whose organizer has not consented yet
 * (no `curation.consentAt`). Such an event must never be public: no
 * calendar, ICS, sitemap, prerender, Instagram.
 */
export function isCuratedWithoutConsent(event: unknown): boolean {
  const curation = curationOf(event);
  return curation !== null && curation.consentAt == null;
}

/**
 * Whether an approved event may count towards region activation
 * (functions/src/regionActivation.ts). Curated events count only once the
 * organizer consented. NOT wired up yet: activation still counts every
 * approved event (docs/event-import.md, "Region activation").
 */
export function countsForActivation(event: unknown): boolean {
  return !isCuratedWithoutConsent(event);
}

// ── Image URL allowlist ───────────────────────────────────────────────

/**
 * Suffixes under which every label belongs to someone else: the registrable
 * host is one label more. Covers the ccTLD second levels of our countries
 * and common site builders/hosters (no full Public Suffix List, no
 * dependency).
 */
const MULTI_LABEL_SUFFIXES = new Set([
  'co.at',
  'or.at',
  'ac.at',
  'gv.at',
  'priv.at',
  'co.uk',
  'org.uk',
  'ac.uk',
  'com.de',
  'wixsite.com',
  'jimdosite.com',
  'jimdofree.com',
  'jimdo.com',
  'blogspot.com',
  'wordpress.com',
  'github.io',
  'webflow.io',
  'netlify.app',
  'vercel.app',
  'web.app',
  'firebaseapp.com',
  'squarespace.com',
  'weebly.com',
  'strikingly.com',
  'carrd.co',
]);

/** Hosts whose images are never taken (social networks and their CDNs). */
const BLOCKED_IMAGE_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'facebook.com', 'instagram.com'];

function isIpHost(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[');
}

/** Registrable host ("example.co.at" for "events.example.co.at"), or '' for IPs / single labels. */
export function registrableHost(hostname: string): string {
  const host = String(hostname ?? '')
    .toLowerCase()
    .replace(/\.$/, '');
  if (!host || isIpHost(host)) return '';
  const labels = host.split('.');
  if (labels.length < 2) return '';
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_LABEL_SUFFIXES.has(lastTwo)) {
    return labels.length >= 3 ? labels.slice(-3).join('.') : '';
  }
  return lastTwo;
}

function parseHttpsUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Whether an image URL may be stored on a candidate (as a URL, never a
 * copy): https only, no credentials, the host equals the source page's
 * registrable host or is a subdomain of it, and it is not a social-network
 * host or CDN (Instagram, Facebook, fbcdn, scontent*).
 */
export function isImageUrlAllowed(imageUrl: unknown, sourcePageUrl: unknown): boolean {
  const image = parseHttpsUrl(imageUrl);
  const page = parseHttpsUrl(sourcePageUrl);
  if (!image || !page) return false;
  if (image.username || image.password) return false;
  const host = image.hostname.toLowerCase().replace(/\.$/, '');
  if (isIpHost(host) || host === 'localhost') return false;
  if (host.split('.').some((label) => label.startsWith('scontent'))) return false;
  if (BLOCKED_IMAGE_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
    return false;
  }
  const base = registrableHost(page.hostname);
  if (!base) return false;
  return host === base || host.endsWith(`.${base}`);
}

// ── Candidate -> event ────────────────────────────────────────────────

/** `unspecified` = "Keine Angabe": only imported events (the organizer's page names no price). */
const CONTRIBUTIONS = ['free', 'donation', 'fee', 'unspecified'];
const CURRENCIES = ['EUR', 'CHF'];
const DEFAULT_CATEGORY = 'Sonstiges';
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;

const str = (value: unknown, max = 500): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const isoDate = (value: unknown): string => {
  const s = str(value, 40);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
};
const hhmm = (value: unknown): string => {
  const s = str(value, 10);
  return /^\d{2}:\d{2}$/.test(s) ? s : '';
};
const num = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain text -> the rich-text HTML the event form stores (one <p> per paragraph). */
function textToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function httpsLink(value: unknown): string {
  const url = parseHttpsUrl(str(value, 2000).replace(/^http:\/\//i, 'https://'));
  return url ? url.toString() : '';
}

/**
 * The organizer name shown on a curated event: only an organisation's name
 * (company / Verein). A private person's name is not shown before they
 * consented, so individuals and unknown legal forms get no name.
 */
export function curatedOrganizerName(
  organizer: Pick<ImportOrganizer, 'name' | 'legalForm'>
): string {
  return organizer.legalForm === 'company' || organizer.legalForm === 'verein'
    ? str(organizer.name, 120)
    : '';
}

/**
 * events/{id} data for a reviewed candidate, in the shape the event form
 * writes (src/components/EventFormWizard.jsx buildEventData), status
 * 'pending', owned by the curator account. Facts and the source link only:
 * no image fields, no personal names, no e-mail (so no app mail reaches the
 * organizer before consent). `slug` and server timestamps are left to the
 * caller; `now` becomes createdAt and curation.importedAt.
 */
export function candidateToEventData(
  candidate: ImportCandidate,
  organizer: ImportOrganizer,
  curatorUid: string,
  { now = new Date() }: { now?: Date } = {}
): Doc {
  if (!curatorUid) throw new Error('candidateToEventData needs the curator uid');
  const x = candidate.rawExtract ?? {};
  const sourceUrl = httpsLink(candidate.sourceUrl);
  if (!sourceUrl) throw new Error('candidate needs an https sourceUrl');
  const title = str(x.title, MAX_TITLE);
  const date = isoDate(x.date);
  if (!title || !date) throw new Error('candidate needs a title and a date (YYYY-MM-DD)');

  // No price on the organizer's page: "Keine Angabe", never "free".
  const contribution = CONTRIBUTIONS.includes(str(x.contribution))
    ? str(x.contribution)
    : 'unspecified';
  const fee = contribution === 'fee' ? num(x.fee, 0, 100000) : null;
  const feeMax = contribution === 'fee' && fee !== null ? num(x.feeMax, fee, 100000) : null;
  const isOnline = x.isOnline === true;
  const endDate = isoDate(x.endDate);
  const lat = isOnline ? null : num(x.lat, -90, 90);
  const lng = isOnline ? null : num(x.lng, -180, 180);

  return {
    title,
    date,
    time: hhmm(x.time),
    endTime: hhmm(x.endTime),
    endDate: endDate && endDate > date ? endDate : '',
    place: isOnline ? '' : str(x.place, 200),
    city: isOnline ? '' : str(x.city, 120),
    bezirk: isOnline ? '' : str(x.bezirk, 80),
    isOnline,
    ...(lat !== null && lng !== null ? { lat, lng } : {}),
    contribution,
    fee,
    feeMax,
    priceCurrency:
      contribution === 'fee'
        ? CURRENCIES.includes(str(x.priceCurrency))
          ? str(x.priceCurrency)
          : 'EUR'
        : null,
    feeNote: '',
    firstSessionFree: false,
    description: textToHtml(str(x.description, MAX_DESCRIPTION)),
    link: httpsLink(x.link) || sourceUrl,
    recurrence: 'none',
    recurrenceEndDate: '',
    customDates: [],
    exceptionDates: [],
    category: str(x.category, 40) || DEFAULT_CATEGORY,
    regionId: candidate.regionId,
    organizer: { name: curatedOrganizerName(organizer), email: '' },
    kontakt: '',
    kontaktMessenger: [],
    registration: '',
    instagramConsent: false,
    status: 'pending',
    createdBy: curatorUid,
    createdAt: now,
    curation: {
      organizerRef: candidate.organizerRef,
      sourceUrl,
      importedAt: now,
      claimable: true,
      // The picture's link on the organizer's page, shown to staff while the event is pending (never
      // copied, never public: EventCoverImage only uses it while `consentAt` is missing).
      ...(httpsLink(candidate.imageUrl) ? { sourceImageUrl: httpsLink(candidate.imageUrl) } : {}),
      // The source named no usable price: 'free' above is only the form default, so the review
      // must check the price before anything is approved.
      ...(CONTRIBUTIONS.includes(str(x.contribution)) ? {} : { priceUnknown: true }),
    },
  };
}
