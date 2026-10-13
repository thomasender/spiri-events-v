// Pure core of scripts/migrate-region-ids.mjs (ticket 8): decides which
// document needs which update, and checks the production guard. No Firebase
// imports, so Vitest can cover it without an emulator.
import { DEFAULT_REGION_ID, isRegionSlug } from './regions.js';

export const PROD_PROJECT_ID = 'spirieventsvbg';
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
 *  - production only with `--project spirieventsvbg`, and never while
 *    FIRESTORE_EMULATOR_HOST is set (that would be ambiguous)
 *  - writes only with `--apply`
 *  - production + `--apply` needs a backup from today, or `--force`
 *  - `--snapshot` works on the JSON snapshot files only (no Firestore)
 */
export function resolveOptions(argv, { env = {}, backupExportedAt = null, now = new Date() } = {}) {
  const known = new Set([
    '--apply',
    '--dry-run',
    '--force',
    '--snapshot',
    '--project',
    '--snapshot-dir',
  ]);
  const args = [...argv];
  const opts = { apply: false, force: false, snapshot: false, project: null, snapshotDir: null };
  let dryRunFlag = false;
  while (args.length) {
    const arg = args.shift();
    if (!known.has(arg)) throw new Error(`Unbekannte Option: ${arg}`);
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--dry-run') dryRunFlag = true;
    else if (arg === '--force') opts.force = true;
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
    return { ...opts, target: 'snapshot', dryRun: !opts.apply };
  }

  if (opts.project !== null && opts.project !== PROD_PROJECT_ID) {
    throw new Error(`Unbekanntes Projekt "${opts.project}" (nur ${PROD_PROJECT_ID} erlaubt)`);
  }
  if (opts.project === null) {
    return {
      ...opts,
      target: 'emulator',
      dryRun: !opts.apply,
      emulatorHost: env.FIRESTORE_EMULATOR_HOST || DEFAULT_EMULATOR_HOST,
    };
  }
  if (env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST ist gesetzt, aber --project spirieventsvbg verlangt: unklares Ziel, Abbruch'
    );
  }
  const backupOk = isBackupFromToday(backupExportedAt, now);
  if (opts.apply && !backupOk && !opts.force) {
    throw new Error(
      'Kein Export von heute gefunden (data-export/firestore-export/manifest.json exportedAt). ' +
        'Erst `node scripts/export-firestore.mjs` ausfuehren oder bewusst --force setzen.'
    );
  }
  return { ...opts, target: 'production', dryRun: !opts.apply, backupOk };
}

// --- Snapshot files (data-export/firestore-export/*.json) -------------------
// Two shapes exist: typed values ({ stringValue: 'x' }, written by
// scripts/refresh-prerender-data.mjs; arrays stay plain arrays of typed values)
// and plain values (written by scripts/export-firestore.mjs). New fields follow
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
