// Pure core of scripts/mirror-prod-to-staging.mjs: copies the PRODUCTION
// Firestore into the STAGING project with all personal data sanitized, so the
// regionId migration can be rehearsed on realistic data. No firebase / fs
// imports (the script injects a fetcher and a writer), so Vitest covers the
// allowlist, the sanitizer, the leak scan and the target guard without an
// emulator.
//
// Safety model, in order of importance:
//   1. Target guard: only `tribe-vbg-staging` may ever be written. Checked in
//      option resolution and again before the first write (applyMirror).
//   2. ALLOWLIST: every known schema path has a policy (copy / drop). Unknown
//      collections are not copied and not even read (only counted), and the
//      collections that hold secrets or personal records are never read at all.
//   3. Leak scan: after sanitizing, every string of every output doc is checked
//      for foreign e-mail addresses and phone numbers; a hit aborts the run.
import { createHash } from 'node:crypto';
import {
  PROD_PROJECT_ID,
  DEFAULT_EMULATOR_HOST,
  MAX_BATCH_SIZE,
  chunk,
} from './regionMigration.js';
import { fetchCollection, schemaPathOf } from './firestoreBackup.js';

export const STAGING_PROJECT_ID = 'tribe-vbg-staging';
export { PROD_PROJECT_ID, MAX_BATCH_SIZE };

export const FAKE_EMAIL_DOMAIN = 'example.invalid';
export const FAKE_PHONE = '+43 000 0000000';
export const NAME_PREFIX = 'Testperson';

// --- Target guard ---------------------------------------------------------------

/** Throws unless `projectId` is exactly the staging project. */
export function assertStagingTarget(projectId) {
  if (projectId !== STAGING_PROJECT_ID) {
    const prod = projectId === PROD_PROJECT_ID ? ' (das ist PRODUKTION)' : '';
    throw new Error(
      `Schreiben verweigert: Zielprojekt "${projectId}"${prod}; erlaubt ist nur ${STAGING_PROJECT_ID}`
    );
  }
}

/**
 * CLI options. Source (production) and target (staging) are hard-coded: there
 * is deliberately no --project flag. `--emulator [host]` points BOTH at the
 * emulator (separate project namespaces there) for tests.
 */
export function resolveMirrorOptions(argv, { env = {} } = {}) {
  const args = [...argv];
  const opts = { apply: false, emulator: false, emulatorHost: null };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--emulator') {
      opts.emulator = true;
      if (args[0] && !args[0].startsWith('--')) opts.emulatorHost = args.shift();
    } else if (arg === '--project') {
      throw new Error('--project gibt es nicht: Quelle und Ziel sind fest verdrahtet');
    } else throw new Error(`Unbekannte Option: ${arg}`);
  }
  if (!opts.emulator && env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST ist gesetzt, aber --emulator fehlt: unklares Ziel, Abbruch'
    );
  }
  // why: an ambient default project pointing at production must never steer a write
  for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
    if (!opts.emulator && env[key] === PROD_PROJECT_ID) {
      throw new Error(`${key}=${PROD_PROJECT_ID} ist gesetzt: unklares Ziel, Abbruch`);
    }
  }
  if (opts.emulator) opts.emulatorHost = opts.emulatorHost || DEFAULT_EMULATOR_HOST;
  const resolved = {
    ...opts,
    sourceProjectId: PROD_PROJECT_ID,
    targetProjectId: STAGING_PROJECT_ID,
  };
  assertStagingTarget(resolved.targetProjectId); // check #1
  return resolved;
}

// --- Allowlist ------------------------------------------------------------------

const drop = (why) => ({ action: 'drop', why });
const copy = (why, extra = {}) => ({ action: 'copy', why, ...extra });

/**
 * schema path -> policy. A schema path that is not listed is UNKNOWN: it is
 * neither read nor copied, only counted and reported.
 * `nameKeys`: keys (at any depth) whose string value is a person name and gets
 * pseudonymised. `contactKeys`: free-text contact fields. Everything else is
 * copied as is, except the generic rules in sanitizeValue (e-mail/phone keys,
 * secret keys, free-text scrubbing).
 */
export const MIRROR_POLICY = {
  // --- dropped: secrets / personal records, never even read ---
  admin_users: drop('roles of real staff accounts; staging has no Auth users anyway'),
  admin_audit_log: drop('audit trail with admin uids/emails and free text'),
  calendarFeedTokens: drop('secret per-user calendar tokens'),
  instagram_private: drop('Instagram access token'),
  instagram_posts: drop(
    'post audit records incl. API errors/permalinks; not needed for the migration'
  ),
  feedback: drop('free-text user feedback incl. contact data'),
  member_lists: drop('member lists (names, e-mail addresses)'),
  donors: drop('donor records incl. payment/mollie ids'),
  'events/{}/messages': drop('private organizer <-> admin conversations (free text, names)'),

  // --- copied (sanitized) ---
  events: copy(
    // why: titles, descriptions, dates, slugs, regionId, bezirk, status stay: the migration needs real content
    'organizer + contact are personal; everything else is realistic content',
    {
      nameKeys: ['firstName', 'lastName', 'name', 'organizerName', 'contactName', 'ownerName'],
      contactKeys: ['kontakt'],
    }
  ),
  users: copy(
    // why: users/{uid} holds displayName, bio, contact and notification flags; no e-mail (that lives in Auth)
    'profile: display name + contact are personal',
    { nameKeys: ['displayName', 'name', 'contactName'], contactKeys: ['contact'] }
  ),
  'users/{}/publicProfile': copy('public mirror of the profile: display name is pseudonymised', {
    nameKeys: ['displayName', 'name'],
  }),
  'users/{}/favorites': copy('only { createdAt } per favorited event id'),
  categories: copy('shared taxonomy, no personal data'),
  regions: copy(
    'region config; contactEmail is replaced by the generic e-mail rule (no real mail from staging)'
  ),
  themes: copy('saved CSS themes, no personal data'),
  app_settings: copy(
    // why: `instagram` (kill switch / token metadata) and unknown docs (e.g. last_build) stay out
    'only the theme docs',
    { docs: ['theme', 'activeTheme'] }
  ),
  helpers: copy('Mithelfer registry: `name` is a real person', { nameKeys: ['name'] }),
};

/** Root collections / docs that --apply empties in STAGING before writing. */
export function wipeTargets() {
  const collections = [];
  const documents = [];
  for (const [schema, policy] of Object.entries(MIRROR_POLICY)) {
    if (policy.action !== 'copy' || schema.includes('/')) continue;
    if (policy.docs) for (const id of policy.docs) documents.push(`${schema}/${id}`);
    else collections.push(schema);
  }
  return { collections, documents };
}

// --- Sanitizer ------------------------------------------------------------------

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** Deterministic: same address (case-insensitive) -> same fake address. */
export function fakeEmail(original) {
  return `user-${sha256(String(original).trim().toLowerCase()).slice(0, 10)}@${FAKE_EMAIL_DOMAIN}`;
}

export function pseudonymizeName(original, kind = 'full') {
  const text = String(original).trim();
  if (!text) return original;
  const hex = sha256(text.toLowerCase()).slice(0, 4);
  if (kind === 'firstName') return NAME_PREFIX;
  if (kind === 'lastName') return hex;
  return `${NAME_PREFIX} ${hex}`;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const PHONE_RE = /(?:\+|\b00)\d[\d\s().\/-]{5,}\d|\b0\d[\d\s().\/-]{6,}\d/g;
const DATE_LIKE_RE = /\d{1,2}\.\d{1,2}\.(?:\d{2,4})?/;
const URL_RE = /^https?:\/\/\S+$/i;
const WA_RE = /(wa\.me|whatsapp\.com)/i;

const isFakeEmail = (match) => match.toLowerCase().endsWith(`@${FAKE_EMAIL_DOMAIN}`);

function isPhoneMatch(match) {
  const digits = match.replace(/\D/g, '').length;
  if (match.startsWith('+') || match.startsWith('00')) return digits >= 8 && digits <= 15;
  return digits >= 9 && digits <= 15 && !DATE_LIKE_RE.test(match);
}

/** Phone numbers in a string; plain http(s) URLs only count for WhatsApp links. */
export function findPhones(text) {
  const clean = text.split(FAKE_PHONE).join('');
  if (URL_RE.test(clean) && !WA_RE.test(clean)) return [];
  return (clean.match(PHONE_RE) ?? []).filter(isPhoneMatch);
}

/** Free text: foreign e-mails -> fake e-mail, phone numbers -> FAKE_PHONE. */
export function scrubString(text) {
  let out = text.replace(EMAIL_RE, (m) => (isFakeEmail(m) ? m : fakeEmail(m)));
  if (findPhones(out).length) {
    out = out.replace(PHONE_RE, (m) => (isPhoneMatch(m) ? FAKE_PHONE : m));
  }
  return out;
}

// why: auth/push tokens, ip addresses, mollie ids and payment info must never reach staging
const SECRET_KEY_RE =
  /token|secret|password|passwd|api[-_]?key|authorization|fcm|mollie|payment|iban|(^|[-_])ip([-_]?address)?$/i;
const EMAIL_KEY_RE = /e-?mail/i;
const PHONE_KEY_RE = /phone|telefon|^tel$|mobile|handy|whatsapp/i;
const GOOGLE_PHOTO_RE = /googleusercontent\.com/i;

const isPlainObject = (v) =>
  v !== null &&
  typeof v === 'object' &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/**
 * Sanitizes one value. Only plain objects/arrays are walked; Timestamps,
 * GeoPoints, references, Dates, bytes pass through untouched (same instance).
 * `removed` collects the key paths that were dropped.
 */
export function sanitizeValue(value, key, policy, removed, path, scrub = scrubString) {
  if (typeof value === 'string') {
    if (!value.trim()) return value;
    if (PHONE_KEY_RE.test(key)) return FAKE_PHONE;
    if (EMAIL_KEY_RE.test(key)) return value.includes('@') ? scrub(value) : fakeEmail(value);
    if (policy.nameKeys?.includes(key)) {
      return pseudonymizeName(value, key === 'firstName' || key === 'lastName' ? key : 'full');
    }
    // why: Google profile pictures are photos of real people; Storage URLs are kept
    if (/photoURL/i.test(key) && GOOGLE_PHOTO_RE.test(value)) return null;
    const scrubbed = scrub(value);
    // why: the contact field is free text that is often just a name
    if (policy.contactKeys?.includes(key) && scrubbed === value && !URL_RE.test(value)) {
      return pseudonymizeName(value);
    }
    return scrubbed;
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => sanitizeValue(v, key, policy, removed, `${path}[${i}]`, scrub));
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const childPath = path ? `${path}.${k}` : k;
      if (SECRET_KEY_RE.test(k)) {
        removed.push(childPath);
        continue;
      }
      out[k] = sanitizeValue(v, k, policy, removed, childPath, scrub);
    }
    return out;
  }
  return value;
}

/** Sanitizes one document of a schema path with a copy policy. */
export function sanitizeDoc(schemaPath, data, { scrub } = {}) {
  const policy = MIRROR_POLICY[schemaPath];
  if (!policy || policy.action !== 'copy') throw new Error(`Keine Copy-Policy fuer ${schemaPath}`);
  const removed = [];
  const out = sanitizeValue(data ?? {}, '', policy, removed, '', scrub);
  return { data: out, removed };
}

// --- Leak scan ------------------------------------------------------------------

/**
 * Deep scan of sanitized docs. Returns [{ path, field }] (never the value).
 * Independent of the sanitizer: it flags foreign e-mails and phone numbers
 * wherever they remain, whatever the field is called.
 */
export function scanLeaks(docs) {
  const hits = [];
  const scanString = (text, docPath, field) => {
    const foreign = (text.match(EMAIL_RE) ?? []).some((m) => !isFakeEmail(m));
    if (foreign || findPhones(text).length) hits.push({ path: docPath, field });
  };
  const walk = (value, docPath, field) => {
    if (typeof value === 'string') scanString(value, docPath, field);
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, docPath, `${field}[${i}]`));
    else if (isPlainObject(value)) {
      for (const [k, v] of Object.entries(value)) {
        const child = field ? `${field}.${k}` : k;
        scanString(k, docPath, `${child} (Feldname)`);
        walk(v, docPath, child);
      }
    }
  };
  for (const doc of docs) walk(doc.data, doc.path, '');
  return hits;
}

// --- Plan (read + sanitize in memory) -------------------------------------------

const lastSegment = (path) => path.split('/').pop();
const bump = (obj, key, n = 1) => {
  obj[key] = (obj[key] ?? 0) + n;
};

/**
 * Reads the source through the injected fetcher (get/list/count only), applies
 * the allowlist and sanitizes. Dropped and unknown collections are only counted.
 * Returns { docs, copied, dropped, unknown, removedFields }.
 */
export async function buildMirror(fetcher, { onProgress, scrub } = {}) {
  const docs = [];
  const copied = {};
  const dropped = {}; // schema or schema/docId -> { why, count }
  const unknown = {};
  const removedFields = {};
  const count = async (path) => {
    try {
      return await fetcher.countDocs(path);
    } catch {
      return null;
    }
  };
  const queue = [...(await fetcher.listRootCollections())].sort();
  while (queue.length) {
    const collectionPath = queue.shift();
    const schema = schemaPathOf(collectionPath);
    const policy = MIRROR_POLICY[schema];
    if (!policy) {
      bump(unknown, schema, (await count(collectionPath)) ?? 0);
      continue;
    }
    if (policy.action === 'drop') {
      const n = (await count(collectionPath)) ?? 0;
      dropped[schema] = { why: policy.why, count: (dropped[schema]?.count ?? 0) + n };
      continue;
    }
    const fetched = await fetchCollection(fetcher, collectionPath);
    const allowed = (path) => !policy.docs || policy.docs.includes(lastSegment(path));
    for (const doc of fetched) {
      if (!allowed(doc.path)) {
        const key = `${schema}/${lastSegment(doc.path)}`;
        dropped[key] = { why: 'not on the doc allowlist', count: (dropped[key]?.count ?? 0) + 1 };
        continue;
      }
      const result = sanitizeDoc(schema, doc.data, { scrub });
      for (const field of result.removed) bump(removedFields, `${schema}: ${field}`);
      docs.push({ path: doc.path, data: result.data });
      bump(copied, schema);
    }
    onProgress?.(collectionPath, fetched.length);
    // Includes "missing" docs (no fields) that only exist for their subcollections.
    for (const docPath of await fetcher.listDocumentPaths(collectionPath)) {
      if (!allowed(docPath)) continue;
      for (const sub of await fetcher.listSubcollections(docPath)) queue.push(`${docPath}/${sub}`);
    }
  }
  docs.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { docs, copied, dropped, unknown, removedFields };
}

// --- Apply (staging only) -------------------------------------------------------

/**
 * writer = { projectId(), deleteCollection(name), deleteDocument(path), commit(ops) }
 * where ops = [{ path, data }] (<= MAX_BATCH_SIZE). The target is re-checked
 * here with the id of the INITIALIZED app (check #2) and before every commit.
 */
export async function applyMirror(writer, docs, { onWipe, onBatch } = {}) {
  assertStagingTarget(writer.projectId());
  const { collections, documents } = wipeTargets();
  for (const name of collections) {
    assertStagingTarget(writer.projectId());
    await writer.deleteCollection(name);
    onWipe?.(name);
  }
  for (const path of documents) {
    assertStagingTarget(writer.projectId());
    await writer.deleteDocument(path);
    onWipe?.(path);
  }
  let written = 0;
  for (const ops of chunk(docs, MAX_BATCH_SIZE)) {
    assertStagingTarget(writer.projectId());
    await writer.commit(ops);
    written += ops.length;
    onBatch?.(written, docs.length);
  }
  return written;
}

// --- Report ---------------------------------------------------------------------

export function formatReport({ docs, copied, dropped, unknown, removedFields }, leaks) {
  const lines = [];
  lines.push('Kopiert (bereinigt):');
  for (const [k, n] of Object.entries(copied).sort()) lines.push(`  ${k}: ${n}`);
  lines.push(`  gesamt: ${docs.length} Dokumente`);
  lines.push('Verworfen (nicht kopiert; ganze Collections werden nicht gelesen):');
  const droppedEntries = Object.entries(dropped).sort();
  if (!droppedEntries.length) lines.push('  (nichts)');
  for (const [k, v] of droppedEntries) lines.push(`  ${k}: ${v.count} (${v.why})`);
  lines.push('Unbekannte Collections (NICHT kopiert):');
  const unknownEntries = Object.entries(unknown).sort();
  if (!unknownEntries.length) lines.push('  (keine)');
  for (const [k, n] of unknownEntries) lines.push(`  ${k}: ${n}`);
  lines.push('Entfernte Felder (Tokens, IPs, Zahlungsdaten):');
  const removedEntries = Object.entries(removedFields).sort();
  if (!removedEntries.length) lines.push('  (keine)');
  for (const [k, n] of removedEntries) lines.push(`  ${k}: ${n}x`);
  lines.push(
    leaks.length === 0
      ? 'Leak-Scan: sauber (keine fremden E-Mail-Adressen oder Telefonnummern).'
      : `Leak-Scan: ${leaks.length} TREFFER`
  );
  for (const hit of leaks) lines.push(`  ${hit.path} -> ${hit.field}`);
  return lines;
}
