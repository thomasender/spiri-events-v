// Pure core of scripts/migrate-region-ids.mjs (ticket 8): decides which
// document needs which update, and checks the production guard. No Firebase
// imports, so Vitest can cover it without an emulator.
import { DEFAULT_REGION_ID, isRegionSlug } from './regions.js';
import { REGION_MIGRATION_MARKER } from './regionQueries.js';
import {
  PROD_PROJECT_ID,
  STAGING_PROJECT_ID,
  assertUnambiguousEnv,
  realTargetFor,
} from './projectTargets.js';

export { PROD_PROJECT_ID, STAGING_PROJECT_ID, REGION_MIGRATION_MARKER };
export const DEFAULT_EMULATOR_HOST = '127.0.0.1:8181';
export const MAX_BATCH_SIZE = 400;

const isMissing = (value) => value === undefined || value === null || value === '';

/**
 * Update for one `events/{id}` doc. Every status (approved, pending, draft,
 * rejected, trashed) and every series doc is treated the same: only a missing
 * `regionId` is filled in. A present but unknown value is left alone and
 * reported, never silently overwritten.
 * @returns {{ kind: 'migrate', update: { regionId: string } } | { kind: 'already' } | { kind: 'invalid', value: unknown }}
 */
export function planEventUpdate(data) {
  const value = data?.regionId;
  if (isMissing(value)) return { kind: 'migrate', update: { regionId: DEFAULT_REGION_ID } };
  if (isRegionSlug(value)) return { kind: 'already' };
  return { kind: 'invalid', value };
}

/**
 * Update for one profile doc (`users/{uid}` or `users/{uid}/publicProfile/data`).
 * Listed or not, every profile gets `directoryRegionIds: ['vorarlberg']` when it
 * has none (missing, not an array or empty). The old Bezirk list
 * `directoryRegions` is not touched.
 */
export function planProfileUpdate(data) {
  const value = data?.directoryRegionIds;
  if (isMissing(value) || (Array.isArray(value) && value.length === 0)) {
    return { kind: 'migrate', update: { directoryRegionIds: [DEFAULT_REGION_ID] } };
  }
  if (Array.isArray(value) && value.length > 0 && value.every(isRegionSlug)) {
    return { kind: 'already' };
  }
  return { kind: 'invalid', value };
}

/**
 * Plans the whole migration.
 * @param {Array<{ path: string, data: object, type: 'event' | 'profile' }>} docs
 */
export function planMigration(docs) {
  const updates = [];
  const invalid = [];
  let already = 0;
  for (const doc of docs) {
    const plan = doc.type === 'event' ? planEventUpdate(doc.data) : planProfileUpdate(doc.data);
    if (plan.kind === 'migrate')
      updates.push({ path: doc.path, type: doc.type, update: plan.update });
    else if (plan.kind === 'already') already++;
    else invalid.push({ path: doc.path, type: doc.type, value: plan.value });
  }
  return { total: docs.length, already, updates, invalid };
}

// --- Completion marker (app_settings/regionMigration) -----------------------
// The app switches its public lists to region-scoped Firestore queries only
// while this doc says `complete: true` (src/utils/regionQueries.js). It is
// written at the end of a successful --apply, and only when the control read
// finds nothing left: a doc without the field, or with a value the app reads
// differently from what a query matches (invalid), would be missing from the
// region queries. --revert deletes it before touching any field.

/** Firestore path of the marker doc. */
export const REGION_MIGRATION_MARKER_PATH = `${REGION_MIGRATION_MARKER.collection}/${REGION_MIGRATION_MARKER.id}`;

/**
 * Decides from a control-read plan (planMigration result) whether the marker
 * may be written. `reason` is a short German text for the script output.
 */
export function decideMigrationMarker(plan) {
  const open = plan?.updates?.length ?? 0;
  const invalid = plan?.invalid?.length ?? 0;
  if (!plan || !Array.isArray(plan.updates) || !Array.isArray(plan.invalid)) {
    return { write: false, reason: 'kein Kontroll-Lesen' };
  }
  if (open > 0 || invalid > 0) {
    return {
      write: false,
      reason: `noch offen ${open}, ungueltig ${invalid} (erst beheben, dann erneut --apply)`,
    };
  }
  return { write: true, reason: `alle ${plan.total} Dokumente haben das Feld` };
}

/** Marker doc content; `completedAt` is a server timestamp in the script. */
export function buildMigrationMarker(plan, completedAt) {
  return { complete: true, completedAt, checkedDocs: plan.total };
}

// --- Revert (--revert) -------------------------------------------------------
// Undoes exactly what the migration writes and nothing else: a field is
// removed only when it still holds the migration's value. Anything else was
// set by someone after the migration and stays.

/** The field the migration writes per doc type, and the exact value it writes. */
export const MIGRATION_FIELDS = Object.freeze({
  event: { field: 'regionId', value: DEFAULT_REGION_ID },
  profile: { field: 'directoryRegionIds', value: [DEFAULT_REGION_ID] },
});

const hasOwn = (obj, key) =>
  obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);

function isMigrationValue(type, value) {
  if (type === 'event') return value === MIGRATION_FIELDS.event.value;
  return Array.isArray(value) && value.length === 1 && value[0] === DEFAULT_REGION_ID;
}

/**
 * Revert decision for one doc.
 * @returns {{ kind: 'revert', field: string } | { kind: 'missing' } | { kind: 'different', value: unknown }}
 */
export function planRevertDoc(type, data) {
  const { field } = MIGRATION_FIELDS[type === 'event' ? 'event' : 'profile'];
  if (!hasOwn(data, field)) return { kind: 'missing' };
  const value = data[field];
  if (isMigrationValue(type, value)) return { kind: 'revert', field };
  return { kind: 'different', value };
}

/**
 * Plans the revert of the whole migration. `reverts` lists the field to
 * delete per doc; `different` docs are reported and left untouched.
 * @param {Array<{ path: string, data: object, type: 'event' | 'profile' }>} docs
 */
export function planRevert(docs) {
  const reverts = [];
  const different = [];
  let missing = 0;
  for (const doc of docs) {
    const plan = planRevertDoc(doc.type, doc.data);
    if (plan.kind === 'revert') reverts.push({ path: doc.path, type: doc.type, field: plan.field });
    else if (plan.kind === 'missing') missing++;
    else different.push({ path: doc.path, type: doc.type, value: plan.value });
  }
  return { total: docs.length, reverts, different, missing };
}

export function chunk(items, size = MAX_BATCH_SIZE) {
  if (!(size > 0)) throw new Error('chunk size must be positive');
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const VIENNA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Vienna',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** True when `exportedAt` (ISO string) is on the same Vienna calendar day as `now`. */
export function isBackupFromToday(exportedAt, now = new Date()) {
  if (typeof exportedAt !== 'string' || !exportedAt) return false;
  const at = new Date(exportedAt);
  if (Number.isNaN(at.getTime())) return false;
  return VIENNA_DAY.format(at) === VIENNA_DAY.format(now);
}

/**
 * Parses argv and decides the target. Throws on anything ambiguous, so the
 * script never reaches production by accident.
 *  - default: emulator, dry-run
 *  - real projects only with `--project spirieventsvbg` (production) or
 *    `--project tribe-vbg-staging` (staging); any other id is refused, and so
 *    is an emulator host or a different GCLOUD_PROJECT in the environment
 *  - writes only with `--apply`
 *  - production + `--apply` needs a backup from today, or `--force`;
 *    staging is disposable and needs none
 *  - `--revert` undoes the migration (same targets, guards and dry-run default)
 *  - `--snapshot` works on the JSON snapshot files only (no Firestore)
 */
export function resolveOptions(argv, { env = {}, backupExportedAt = null, now = new Date() } = {}) {
  const known = new Set([
    '--apply',
    '--dry-run',
    '--force',
    '--revert',
    '--snapshot',
    '--project',
    '--snapshot-dir',
  ]);
  const args = [...argv];
  const opts = {
    apply: false,
    force: false,
    revert: false,
    snapshot: false,
    project: null,
    snapshotDir: null,
  };
  let dryRunFlag = false;
  while (args.length) {
    const arg = args.shift();
    if (!known.has(arg)) throw new Error(`Unbekannte Option: ${arg}`);
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--dry-run') dryRunFlag = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--revert') opts.revert = true;
    else if (arg === '--snapshot') opts.snapshot = true;
    else {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`${arg} braucht einen Wert`);
      if (arg === '--project') opts.project = value;
      else opts.snapshotDir = value;
    }
  }
  if (opts.apply && dryRunFlag) throw new Error('--apply und --dry-run schliessen sich aus');
  if (opts.snapshotDir && !opts.snapshot)
    throw new Error('--snapshot-dir nur zusammen mit --snapshot');

  if (opts.snapshot) {
    if (opts.project) throw new Error('--snapshot arbeitet nur mit Dateien, ohne --project');
    if (opts.revert) throw new Error('--revert gibt es nur fuer Firestore, nicht mit --snapshot');
    return { ...opts, target: 'snapshot', dryRun: !opts.apply };
  }

  if (opts.project === null) {
    return {
      ...opts,
      target: 'emulator',
      projectId: PROD_PROJECT_ID,
      dryRun: !opts.apply,
      emulatorHost: env.FIRESTORE_EMULATOR_HOST || DEFAULT_EMULATOR_HOST,
    };
  }
  const target = realTargetFor(opts.project);
  assertUnambiguousEnv(opts.project, env);
  if (target === 'staging') {
    // Staging is disposable: no backup needed, --force has no meaning.
    return { ...opts, target, projectId: STAGING_PROJECT_ID, dryRun: !opts.apply };
  }
  const backupOk = isBackupFromToday(backupExportedAt, now);
  if (opts.apply && !backupOk && !opts.force) {
    throw new Error(
      'Kein Produktions-Backup von heute gefunden (backups/*/manifest.json exportedAt). ' +
        'Erst `node scripts/export-firestore.mjs --project spirieventsvbg` ausfuehren oder bewusst --force setzen.'
    );
  }
  return {
    ...opts,
    target: 'production',
    projectId: PROD_PROJECT_ID,
    dryRun: !opts.apply,
    backupOk,
  };
}

// --- Snapshot files (data-export/firestore-export/*.json) -------------------
// Two shapes exist: typed values ({ stringValue: 'x' }, written by
// scripts/refresh-prerender-data.mjs; arrays stay plain arrays of typed values)
// and plain values (older exports). New fields follow
// the shape of the doc they are added to.

const TYPED_KEYS = [
  'stringValue',
  'integerValue',
  'doubleValue',
  'booleanValue',
  'nullValue',
  'timestampValue',
  'mapValue',
  'arrayValue',
  'referenceValue',
];

function isTypedValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && TYPED_KEYS.includes(keys[0]);
}

export function isTypedSnapshotDoc(doc) {
  return Object.entries(doc || {}).some(([k, v]) => k !== 'id' && isTypedValue(v));
}

function unwrapString(value) {
  if (isTypedValue(value)) return 'stringValue' in value ? value.stringValue : undefined;
  return value;
}

function unwrapStringArray(value) {
  if (isTypedValue(value) && 'arrayValue' in value) value = value.arrayValue?.values ?? [];
  if (!Array.isArray(value)) return isTypedValue(value) && 'nullValue' in value ? null : value;
  return value.map(unwrapString);
}

/** Returns the snapshot doc with `regionId` added when missing (same object when unchanged). */
export function migrateSnapshotEvent(doc) {
  const plan = planEventUpdate({ regionId: unwrapString(doc?.regionId) });
  if (plan.kind !== 'migrate') return doc;
  const { regionId } = plan.update;
  return { ...doc, regionId: isTypedSnapshotDoc(doc) ? { stringValue: regionId } : regionId };
}

/** Returns the snapshot profile doc with `directoryRegionIds` added when missing. */
export function migrateSnapshotProfile(doc) {
  const plan = planProfileUpdate({
    directoryRegionIds: unwrapStringArray(doc?.directoryRegionIds),
  });
  if (plan.kind !== 'migrate') return doc;
  const ids = plan.update.directoryRegionIds;
  return {
    ...doc,
    directoryRegionIds: isTypedSnapshotDoc(doc) ? ids.map((id) => ({ stringValue: id })) : ids,
  };
}

/** Migrates an array of snapshot docs; `changed` counts docs that got a field. */
export function migrateSnapshotDocs(docs, type) {
  const fn = type === 'event' ? migrateSnapshotEvent : migrateSnapshotProfile;
  let changed = 0;
  const out = (Array.isArray(docs) ? docs : []).map((doc) => {
    const next = fn(doc);
    if (next !== doc) changed++;
    return next;
  });
  return { docs: out, changed };
}
