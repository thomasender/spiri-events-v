// Event import ("kuratierte Events", docs/event-import.md): the pure core of
// scripts/import-curated-events.mjs. No Firebase, no I/O: the script reads the
// existing documents, hands them to `planIngest` and writes the plan.
//
// The helpers fingerprint / blocklist / image URL check come from
// eventImportServer.js, a synced copy of functions/src/eventImport.ts (drift test:
// tests/lib/eventImportIngest.spec.ts).
import { fingerprint, isBlocked, isImageUrlAllowed, normalizeTitle } from './eventImportServer.js';
import { PROD_PROJECT_ID, STAGING_PROJECT_ID } from './projectTargets.js';
import { CATEGORY_COLORS } from './categoryColors.js';
import { STATIC_REGION_SLUGS } from './regions.js';
import { LEGAL_FORMS, SOURCE_TYPES } from './eventImport.js';

export const GENERIC_CATEGORY = 'Sonstiges';
/** Titles at least this similar (0-1) on the same day count as the same event. */
export const FUZZY_TITLE_THRESHOLD = 0.8;
const SOCIAL_HOSTS = ['instagram.com', 'facebook.com', 'fb.com', 'fb.me', 'fbcdn.net'];

// ── CLI options ───────────────────────────────────────────────────────

/**
 * CLI options of import-curated-events. Default project tribe-vbg-staging;
 * any other project is refused (production only with `--allow-prod`, same as
 * ensure-curator-account). Dry run unless `--apply`.
 */
export function resolveImportOptions(argv) {
  const args = [...argv];
  const opts = { files: [], projectId: STAGING_PROJECT_ID, apply: false, allowProd: false };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--dry-run') opts.apply = false;
    else if (arg === '--allow-prod') opts.allowProd = true;
    else if (arg === '--file' || arg === '--project') {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`${arg} braucht einen Wert`);
      if (arg === '--file') opts.files.push(value);
      else opts.projectId = value;
    } else throw new Error(`Unbekannte Option: ${arg}`);
  }
  if (opts.files.length === 0) throw new Error('Mindestens eine --file <json> angeben');
  if (opts.projectId === STAGING_PROJECT_ID) return { ...opts, target: 'staging' };
  if (opts.projectId === PROD_PROJECT_ID && opts.allowProd) {
    return { ...opts, target: 'production' };
  }
  throw new Error(
    `Projekt "${opts.projectId}" verweigert: import-curated-events schreibt nur nach ${STAGING_PROJECT_ID}` +
      (opts.projectId === PROD_PROJECT_ID ? ' (Produktion nur mit --allow-prod)' : '')
  );
}

// ── Small helpers ─────────────────────────────────────────────────────

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function parseUrl(value) {
  try {
    return new URL(String(value ?? '').trim());
  } catch {
    return null;
  }
}

function isSocialHost(hostname) {
  const host = hostname.toLowerCase();
  return SOCIAL_HOSTS.some((s) => host === s || host.endsWith(`.${s}`));
}

/** https URL on a normal website (never Instagram / Facebook), else ''. */
function webUrl(value) {
  const url = parseUrl(value);
  if (!url || url.protocol !== 'https:' || isSocialHost(url.hostname)) return '';
  return url.toString();
}

/** A real calendar date `YYYY-MM-DD`, else false. */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today (YYYY-MM-DD) in Europe/Vienna. */
export function viennaToday(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(now);
}

/** Host of a website without "www." ('' when unparsable). */
export function websiteHost(website) {
  const url = parseUrl(website);
  return url ? url.hostname.toLowerCase().replace(/^www\./, '') : '';
}

/** Deterministic `import_organizers` id from the website host ("yanantintribe.com" -> "yanantintribe-com"). */
export function organizerIdFromWebsite(website) {
  const host = websiteHost(website);
  return host ? host.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : '';
}

// ── Category mapping ──────────────────────────────────────────────────

const CATEGORY_NAMES = Object.keys(CATEGORY_COLORS);

// Keyword -> existing category (never a new one). Checked in order.
const CATEGORY_KEYWORDS = [
  [/\b(yoga|asana|vinyasa|hatha|yin)\b/, 'Yoga'],
  [/\b(breath\w*|atem\w*|pranayama|holotrop\w*)\b/, 'Breathwork'],
  [/\b(meditat\w*|mindful\w*|achtsam\w*|zazen|zen|vipassana|stille)\b/, 'Meditation'],
  [/\b(sound\w*|klang\w*|gong\w*|handpan|schalen)\b/, 'Soundhealing'],
  [/\b(kirtan|mantra\w*|sing\w*|chant\w*|chor|choir|gesang)\b/, 'Singen'],
  [/\b(dance|tanz\w*|ecstatic|5\s?rhythms|movement|bewegung)\b/, 'Tanz'],
  [/\b(coach\w*)\b/, 'Coaching'],
  [/\b(body\s?work|k[oö]rper\w*|massage|somatic\w*|feldenkrais|tre)\b/, 'Körperarbeit'],
  [/\b(ern[aä]hr\w*|nutrition|fasten|kochen)\b/, 'Ernährung'],
  [/\b(therap\w*|heilung|healing)\b/, 'Therapie'],
];

function keywordCategory(value) {
  const t = normalizeTitle(value);
  for (const [pattern, name] of CATEGORY_KEYWORDS) if (pattern.test(t)) return name;
  return null;
}

/**
 * Nearest EXISTING category (CATEGORY_COLORS) for a free-text guess: exact
 * name (case-insensitive), then keywords of the guess, then keywords of the
 * title, else the most generic one ("Sonstiges"). Never creates a category.
 */
export function mapCategory(categoryGuess, title = '') {
  const guess = normalizeTitle(categoryGuess);
  const exact = CATEGORY_NAMES.find((name) => normalizeTitle(name) === guess);
  if (exact) return exact;
  return keywordCategory(categoryGuess) ?? keywordCategory(title) ?? GENERIC_CATEGORY;
}

// ── Similarity ────────────────────────────────────────────────────────

function bigrams(s) {
  const grams = new Map();
  for (let i = 0; i < s.length - 1; i += 1) {
    const g = s.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

/** 0-1 similarity of two titles (Dice on bigrams of the normalised titles; containment counts high). */
export function titleSimilarity(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  const total = Math.max(na.length - 1, 0) + Math.max(nb.length - 1, 0);
  let score = total === 0 ? 0 : (2 * overlap) / total;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (short.length >= 10 && long.includes(short)) score = Math.max(score, 0.9);
  return score;
}

/** Same day, similar title, and not two different start times. */
export function isFuzzyDuplicate(a, b, threshold = FUZZY_TITLE_THRESHOLD) {
  if (!a.date || a.date !== b.date) return false;
  if (a.time && b.time && a.time !== b.time) return false;
  return titleSimilarity(a.title, b.title) >= threshold;
}

// ── Validation ────────────────────────────────────────────────────────

/**
 * Shape check of a discovery file. Returns `{ ok, errors, region, organizers,
 * candidates }`; file-level problems (no region, not a JSON object) give
 * ok=false, per-organizer / per-candidate problems are checked in
 * `validateOrganizer` / `validateCandidate`.
 */
export function validateDiscoveryFile(raw) {
  const errors = [];
  if (!isObject(raw)) return { ok: false, errors: ['Datei ist kein JSON-Objekt'] };
  if (typeof raw.region !== 'string' || !STATIC_REGION_SLUGS.includes(raw.region)) {
    errors.push(`Unbekannte region: ${JSON.stringify(raw.region)}`);
  }
  if (!Array.isArray(raw.organizers)) errors.push('organizers fehlt (Liste erwartet)');
  if (!Array.isArray(raw.candidates)) errors.push('candidates fehlt (Liste erwartet)');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    region: raw.region,
    organizers: raw.organizers,
    candidates: raw.candidates,
  };
}

/** `{ ok:true, organizer }` (normalised) or `{ ok:false, reason }`. */
export function validateOrganizer(raw) {
  if (!isObject(raw)) return { ok: false, reason: 'invalid-organizer' };
  const key = text(raw.key, 100);
  const name = text(raw.name, 200);
  const website = webUrl(raw.website);
  const id = organizerIdFromWebsite(website);
  if (!key || !name || !id) return { ok: false, reason: 'invalid-organizer' };
  const legalForm = LEGAL_FORMS.includes(raw.legalForm) ? raw.legalForm : 'unknown';
  const email = text(raw.contactEmail, 200).toLowerCase();
  const sourceUrls = (Array.isArray(raw.sourceUrls) ? raw.sourceUrls : [])
    .map(webUrl)
    .filter(Boolean);
  return {
    ok: true,
    organizer: {
      key,
      id,
      name,
      website,
      legalForm,
      contactEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
      sourceUrls: [...new Set(sourceUrls)],
    },
  };
}

/**
 * `{ ok:true, candidate }` (normalised facts) or `{ ok:false, reason }`.
 * Rejected: no title, no dateQuote, no https source page (Instagram /
 * Facebook never), no real date, a date that is not in the future. A bad
 * image URL does not fail the candidate: it is dropped (`imageDropped`).
 */
export function validateCandidate(raw, { today }) {
  if (!isObject(raw)) return { ok: false, reason: 'invalid-candidate' };
  const title = text(raw.title, 200);
  if (!title) return { ok: false, reason: 'missing-title' };
  if (!text(raw.dateQuote, 500)) return { ok: false, reason: 'missing-dateQuote' };
  const sourceUrl = webUrl(raw.sourceUrl);
  if (!sourceUrl) return { ok: false, reason: 'invalid-sourceUrl' };
  const date = typeof raw.date === 'string' ? raw.date.trim() : '';
  if (!isIsoDate(date)) return { ok: false, reason: 'invalid-date' };
  if (date <= today) return { ok: false, reason: 'past-date' };
  const endDate = isIsoDate(raw.endDate) && raw.endDate > date ? raw.endDate : '';
  const time = /^\d{2}:\d{2}$/.test(raw.time ?? '') ? raw.time : '';
  const endTime = /^\d{2}:\d{2}$/.test(raw.endTime ?? '') ? raw.endTime : '';

  let imageUrl = null;
  let imageDropped = false;
  if (raw.imageUrl != null && raw.imageUrl !== '') {
    if (isImageUrlAllowed(raw.imageUrl, sourceUrl)) imageUrl = String(raw.imageUrl).trim();
    else imageDropped = true;
  }

  const contribution = ['free', 'donation', 'fee', 'unknown'].includes(raw.contribution)
    ? raw.contribution
    : 'unknown';
  const fee =
    contribution === 'fee' && typeof raw.fee === 'number' && raw.fee >= 0 && raw.fee <= 100000
      ? raw.fee
      : null;
  const confidence =
    typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
      ? Math.min(1, Math.max(0, raw.confidence))
      : 0;

  return {
    ok: true,
    imageDropped,
    candidate: {
      organizerKey: text(raw.organizerKey, 100),
      title,
      date,
      time,
      endTime,
      endDate,
      place: text(raw.place, 200),
      city: text(raw.city, 120),
      contribution,
      fee,
      priceCurrency: ['EUR', 'CHF'].includes(raw.currency) ? raw.currency : null,
      description: text(raw.description, 5000),
      link: webUrl(raw.link) || sourceUrl,
      imageUrl,
      categoryGuess: text(raw.categoryGuess, 60),
      sourceUrl,
      sourceType: SOURCE_TYPES.includes(raw.sourceType) ? raw.sourceType : 'llm',
      dateQuote: text(raw.dateQuote, 500),
      confidence,
    },
  };
}

// ── Planning ──────────────────────────────────────────────────────────

/** Doc id of an `import_candidates` doc: derived from the fingerprint, so a rerun finds it again. */
export function candidateIdOf(fp) {
  return fp.slice(0, 40);
}

function organizerDoc(o, regionId, now) {
  return {
    name: o.name,
    website: o.website,
    ...(o.contactEmail ? { contactEmail: o.contactEmail } : {}),
    legalForm: o.legalForm,
    regionId,
    consent: 'none',
    syncMode: 'curated_once',
    sourceUrls: o.sourceUrls,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * What to write for one organizer: `create`, `update` (only fields that are
 * new: more source URLs, a contact e-mail that was missing) or `unchanged`.
 * Consent, syncMode and legalForm of an existing organizer are never touched.
 */
export function planOrganizer(o, regionId, existing, now) {
  if (!existing) return { id: o.id, action: 'create', data: organizerDoc(o, regionId, now) };
  const changes = {};
  const have = Array.isArray(existing.sourceUrls) ? existing.sourceUrls : [];
  const merged = [...new Set([...have, ...o.sourceUrls])];
  if (merged.length !== have.length) changes.sourceUrls = merged;
  if (!existing.contactEmail && o.contactEmail) {
    changes.contactEmail = o.contactEmail;
  }
  if (Object.keys(changes).length === 0) return { id: o.id, action: 'unchanged', data: {} };
  return { id: o.id, action: 'update', data: { ...changes, updatedAt: now } };
}

/**
 * The whole ingest of one discovery file as a plan (no writes):
 *
 *   organizers  { id, action: create|update|unchanged, data }
 *   candidates  { id, data }          new import_candidates docs (status found / duplicate)
 *   skipped     { reason, title, organizerKey, detail? }
 *   counts      per outcome
 *
 * ctx: { now, today, blockedIds:Set, existingOrganizers:Map<id,doc>,
 *        existingCandidates:Map<id,doc>, existingEvents:[{id,title,date,time?}],
 *        districtOf(city): string }
 *
 * Idempotent: a candidate whose id (fingerprint) already exists is skipped
 * ('exists'), so a second run on the same file plans no new candidate.
 */
export function planIngest(file, ctx) {
  const {
    now,
    today,
    blockedIds = new Set(),
    existingOrganizers = new Map(),
    existingCandidates = new Map(),
    existingEvents = [],
    districtOf = () => '',
  } = ctx;
  const checked = validateDiscoveryFile(file);
  if (!checked.ok) return { ok: false, errors: checked.errors };
  const regionId = checked.region;

  const counts = {
    organizersFile: checked.organizers.length,
    organizersCreate: 0,
    organizersUpdate: 0,
    organizersUnchanged: 0,
    organizersInvalid: 0,
    organizersBlocked: 0,
    candidatesFile: checked.candidates.length,
    accepted: 0,
    duplicates: 0,
    imageDropped: 0,
  };
  const skipped = [];
  const skip = (reason, c, detail) => {
    skipped.push({
      reason,
      title: text(c?.title, 120),
      organizerKey: text(c?.organizerKey, 100),
      ...(detail ? { detail } : {}),
    });
  };

  // Organizers: validate, blocklist (e-mail and website domain), plan upsert.
  const organizers = new Map(); // key -> validated organizer
  const organizerPlans = [];
  const blockedKeys = new Set();
  for (const raw of checked.organizers) {
    const result = validateOrganizer(raw);
    if (!result.ok) {
      counts.organizersInvalid += 1;
      continue;
    }
    const o = result.organizer;
    // Blocklist: the contact address, its domain and the website domain (also parent domains).
    if (isBlocked({ email: o.contactEmail, website: o.website }, blockedIds)) {
      counts.organizersBlocked += 1;
      blockedKeys.add(o.key);
      continue;
    }
    organizers.set(o.key, o);
    const plan = planOrganizer(o, regionId, existingOrganizers.get(o.id), now);
    organizerPlans.push({ ...plan, key: o.key });
    if (plan.action === 'create') counts.organizersCreate += 1;
    else if (plan.action === 'update') counts.organizersUpdate += 1;
    else counts.organizersUnchanged += 1;
  }

  // Everything a new candidate is compared with: events of the region, candidates of
  // the region (not already marked duplicate), and what this run accepts so far.
  const knownFingerprints = new Set(
    [...existingCandidates.values()].map((c) => c.fingerprint).filter(Boolean)
  );
  const pool = [
    ...existingEvents.map((e) => ({
      kind: 'event',
      id: e.id,
      title: e.title,
      date: e.date,
      time: e.time,
    })),
    ...[...existingCandidates.entries()]
      .filter(([, c]) => c.status !== 'duplicate')
      .map(([id, c]) => ({
        kind: 'candidate',
        id,
        title: c.rawExtract?.title ?? '',
        date: c.rawExtract?.date ?? '',
        time: c.rawExtract?.time,
      })),
  ];

  const candidates = [];
  for (const raw of checked.candidates) {
    if (blockedKeys.has(text(raw?.organizerKey, 100))) {
      skip('blocked', raw);
      continue;
    }
    const organizer = organizers.get(text(raw?.organizerKey, 100));
    if (!organizer) {
      skip('unknown-organizer', raw);
      continue;
    }
    const result = validateCandidate(raw, { today });
    if (!result.ok) {
      skip(result.reason, raw);
      continue;
    }
    const c = result.candidate;
    if (result.imageDropped) counts.imageDropped += 1;

    const fp = fingerprint(c.sourceUrl, c.date, c.title);
    const id = candidateIdOf(fp);
    if (existingCandidates.has(id) || knownFingerprints.has(fp)) {
      skip('exists', c);
      continue;
    }
    knownFingerprints.add(fp);

    const match = pool.find((p) => isFuzzyDuplicate(c, p));
    const bezirk = c.city ? districtOf(c.city) : '';
    const data = {
      regionId,
      organizerRef: organizer.id,
      sourceUrl: c.sourceUrl,
      sourceType: c.sourceType,
      dateQuote: c.dateQuote,
      rawExtract: {
        title: c.title,
        date: c.date,
        ...(c.time ? { time: c.time } : {}),
        ...(c.endTime ? { endTime: c.endTime } : {}),
        ...(c.endDate ? { endDate: c.endDate } : {}),
        place: c.place,
        city: c.city,
        ...(bezirk ? { bezirk } : {}),
        contribution: c.contribution,
        ...(c.fee !== null ? { fee: c.fee } : {}),
        ...(c.priceCurrency && c.contribution === 'fee' ? { priceCurrency: c.priceCurrency } : {}),
        description: c.description,
        link: c.link,
        category: mapCategory(c.categoryGuess, c.title),
      },
      fingerprint: fp,
      confidence: c.confidence,
      status: match ? 'duplicate' : 'found',
      eventId: null,
      imageUrl: c.imageUrl,
      ...(match ? { duplicateOf: { kind: match.kind, id: match.id } } : {}),
      fetchedAt: now,
    };
    candidates.push({ id, data });
    if (match) {
      counts.duplicates += 1;
      skip('duplicate', c, `${match.kind} ${match.id}`);
    } else {
      counts.accepted += 1;
      pool.push({ kind: 'candidate', id, title: c.title, date: c.date, time: c.time });
    }
  }

  return { ok: true, regionId, organizers: organizerPlans, candidates, skipped, counts };
}

/** Skip reasons -> number, for the summary table. */
export function countSkipReasons(skipped) {
  const out = {};
  for (const s of skipped) out[s.reason] = (out[s.reason] ?? 0) + 1;
  return out;
}
