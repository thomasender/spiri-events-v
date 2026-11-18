// Event import ("kuratierte Events", docs/event-import.md): the client/script
// side. Synced copy of the constants and predicates of
// functions/src/eventImport.ts (guarded by tests/lib/eventImport.spec.ts) plus
// the pure core of scripts/ensure-curator-account.mjs. No Firebase imports.
import { PROD_PROJECT_ID, STAGING_PROJECT_ID } from './projectTargets.js';

export const IMPORT_ORGANIZERS = 'import_organizers';
export const IMPORT_CANDIDATES = 'import_candidates';
export const IMPORT_RUNS = 'import_runs';
export const IMPORT_BLOCKLIST = 'import_blocklist';
export const IMPORT_OUTREACH = 'outreach';
export const IMPORT_SETTINGS_DOC = 'app_settings/import';

export const IMPORT_REGION_IDS = Object.freeze(['zuerich', 'tirol', 'berlin']);
export const LEGAL_FORMS = Object.freeze(['company', 'verein', 'individual', 'unknown']);
export const CONSENT_STATES = Object.freeze([
  'none',
  'asked',
  'manual_ok',
  'sync_ok',
  'declined',
  'claimed',
]);
export const SYNC_MODES = Object.freeze([
  'curated_once',
  'sync_consented',
  'self_managed',
  'declined',
]);
export const SOURCE_TYPES = Object.freeze(['jsonld', 'ical', 'api', 'llm', 'manual']);
export const CANDIDATE_STATUSES = Object.freeze([
  'found',
  'reviewed',
  'published',
  'rejected',
  'duplicate',
]);
export const OUTREACH_STATUSES = Object.freeze(['queued', 'sent', 'bounced', 'replied', 'failed']);
export const BLOCKLIST_KINDS = Object.freeze(['email', 'domain']);
export const PUBLISHABLE_CONSENT_STATES = Object.freeze(['manual_ok', 'sync_ok', 'claimed']);

function curationOf(event) {
  if (!event || typeof event !== 'object') return null;
  const curation = event.curation;
  return curation && typeof curation === 'object' ? curation : null;
}

/** The event was imported by the curation team (it carries `curation`). */
export function isCuratedEvent(event) {
  return curationOf(event) !== null;
}

/**
 * A curated event whose organizer has not consented yet (no
 * `curation.consentAt`): never public (calendar, ICS, sitemap, prerender,
 * Instagram).
 */
export function isCuratedWithoutConsent(event) {
  const curation = curationOf(event);
  return curation !== null && curation.consentAt == null;
}

// ── Curator account (scripts/ensure-curator-account.mjs) ─────────────

export const CURATOR_DEFAULT_EMAIL = 'curator@thetribe.at';
export const CURATOR_DISPLAY_NAME = 'tribe Redaktion';
export const CURATOR_SLUG = 'tribe-redaktion';

/**
 * CLI options of ensure-curator-account. Default project tribe-vbg-staging;
 * any other project is refused unless `--allow-prod` is given, and then only
 * the production id. Dry run unless `--apply`.
 */
export function resolveCuratorAccountOptions(argv) {
  const args = [...argv];
  const opts = {
    projectId: STAGING_PROJECT_ID,
    email: CURATOR_DEFAULT_EMAIL,
    apply: false,
    allowProd: false,
  };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--allow-prod') opts.allowProd = true;
    else if (arg === '--project' || arg === '--email') {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`${arg} braucht einen Wert`);
      if (arg === '--project') opts.projectId = value;
      else opts.email = value.trim().toLowerCase();
    } else throw new Error(`Unbekannte Option: ${arg}`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opts.email)) {
    throw new Error(`Ungültige E-Mail: ${opts.email}`);
  }
  if (opts.projectId === STAGING_PROJECT_ID) return { ...opts, target: 'staging' };
  if (opts.projectId === PROD_PROJECT_ID && opts.allowProd) {
    return { ...opts, target: 'production' };
  }
  throw new Error(
    `Projekt "${opts.projectId}" verweigert: ensure-curator-account schreibt nur nach ${STAGING_PROJECT_ID}` +
      (opts.projectId === PROD_PROJECT_ID ? ' (Produktion nur mit --allow-prod)' : '')
  );
}

/** `app_settings/import` as the script writes it. */
export function buildImportSettingsDoc(curatorUid, { now }) {
  if (!curatorUid) throw new Error('curatorUid fehlt');
  return { curatorUid, updatedAt: now };
}
