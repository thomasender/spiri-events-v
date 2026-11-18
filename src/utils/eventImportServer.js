// Node-only synced copy of the pure helpers of functions/src/eventImport.ts that
// scripts need (fingerprint, blocklist, image URL check). Plain JS because Node
// cannot load the TypeScript module (functions/package.json is commonjs).
// tests/lib/eventImportIngest.spec.ts fails on drift. Uses node:crypto: do not
// import this from browser code (src/utils/eventImport.js is the browser-safe part).
import { createHash } from 'node:crypto';

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// ── Fingerprint ───────────────────────────────────────────────────────

const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref)$/i;

/**
 * Source URL in a stable form: lower-case host without "www.", no fragment,
 * no tracking parameters, remaining parameters sorted, no trailing slash,
 * http and https treated alike. Unparsable input is trimmed and lower-cased.
 */
export function normalizeSourceUrl(sourceUrl) {
  const raw = String(sourceUrl ?? '').trim();
  let url;
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
export function normalizeTitle(title) {
  return String(title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** YYYY-MM-DD from an ISO date or date-time; anything else trimmed. */
function normalizeDate(date) {
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
export function fingerprint(sourceUrl, date, title) {
  return sha256Hex(
    [normalizeSourceUrl(sourceUrl), normalizeDate(date), normalizeTitle(title)].join('\n')
  );
}

// ── Blocklist ─────────────────────────────────────────────────────────

/** Lower-cased e-mail address or domain (without "www." / leading "@"). */
export function normalizeBlocklistValue(emailOrDomain) {
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

export function blocklistKind(emailOrDomain) {
  return normalizeBlocklistValue(emailOrDomain).includes('@') ? 'email' : 'domain';
}

/**
 * Doc id in import_blocklist: sha256 (hex) of the lower-cased e-mail or
 * domain. The plain address is never stored.
 */
export function blocklistId(emailOrDomain) {
  const value = normalizeBlocklistValue(emailOrDomain);
  if (!value) throw new Error('blocklistId needs an e-mail address or domain');
  return sha256Hex(value);
}

/** Domain of an e-mail address or website URL ('' when there is none). */
function domainOf(value) {
  const normalized = normalizeBlocklistValue(value ?? '');
  if (!normalized) return '';
  return normalized.includes('@') ? normalized.split('@').pop() || '' : normalized;
}

/**
 * Whether an organizer is on the blocklist: its e-mail address, the e-mail
 * domain or the website domain (also a parent domain of it) is in
 * `blockedIds` (doc ids of import_blocklist).
 */
export function isBlocked({ email, website }, blockedIds) {
  const ids = blockedIds instanceof Set ? blockedIds : new Set(blockedIds);
  if (ids.size === 0) return false;
  const candidates = new Set();
  const mail = normalizeBlocklistValue(email ?? '');
  if (mail.includes('@')) candidates.add(mail);
  for (const domain of [domainOf(email), domainOf(website)]) {
    const labels = domain.split('.').filter(Boolean);
    for (let i = 0; i < labels.length - 1; i += 1) candidates.add(labels.slice(i).join('.'));
  }
  return [...candidates].some((value) => ids.has(sha256Hex(value)));
}

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

function isIpHost(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[');
}

/** Registrable host ("example.co.at" for "events.example.co.at"), or '' for IPs / single labels. */
export function registrableHost(hostname) {
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

function parseHttpsUrl(value) {
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
export function isImageUrlAllowed(imageUrl, sourcePageUrl) {
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
