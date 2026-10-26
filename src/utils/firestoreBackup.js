// Pure core of scripts/export-firestore.mjs: a trustworthy Firestore BACKUP.
// No Firebase / fs imports (the script injects a fetcher and fs functions), so
// Vitest covers paging, counting, manifest and the "never touch the prerender
// snapshot" guard without an emulator.
//
// Fetcher interface (all async):
//   listRootCollections()          -> string[]            top-level collection ids
//   listPage(collPath, pageToken)  -> { docs: [{ path, data }], nextPageToken }
//   listDocumentPaths(collPath)    -> string[]            incl. docs without fields
//   listSubcollections(docPath)    -> string[]
//   countDocs(collPath)            -> number              server-side count
//
// Every collection (top level and every subcollection under every doc, found by
// traversal, not by a hard-coded list) is read page by page and its fetched
// size is compared with a separate server-side count. Any error or mismatch
// makes runBackup throw: there is then no manifest and no `exportedAt`.
import { PROD_PROJECT_ID, DEFAULT_EMULATOR_HOST } from './regionMigration.js';

export const PAGE_SIZE = 1000;
export const BACKUP_ROOT_DIR = 'backups';
export const MANIFEST_NAME = 'manifest.json';
export const FORMAT = 'firestore-backup-v1';
/** Collections that must exist and be non-empty in a production backup. */
export const REQUIRED_PRODUCTION_COLLECTIONS = ['events', 'users'];

// --- Value encoding (Firestore REST "typed" JSON, restorable without loss) ---

export function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    // NaN / Infinity are not valid JSON numbers; keep them as strings.
    return { doubleValue: Number.isFinite(value) ? value : String(value) };
  }
  if (typeof value === 'bigint') return { integerValue: value.toString() };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value.toDate === 'function' && 'nanoseconds' in value) {
    // Firestore Timestamp: keep nanosecond precision.
    const base = value
      .toDate()
      .toISOString()
      .replace(/\.\d+Z$/, '');
    const nanos = String(value.nanoseconds).padStart(9, '0');
    return { timestampValue: `${base}.${nanos}Z` };
  }
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') {
    return { geoPointValue: { latitude: value.latitude, longitude: value.longitude } };
  }
  if (typeof value.path === 'string' && value.firestore) return { referenceValue: value.path };
  if (value instanceof Uint8Array) return { bytesValue: Buffer.from(value).toString('base64') };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  throw new Error(`Nicht unterstuetzter Wert: ${String(value)}`);
}

export function encodeFields(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data ?? {})) fields[key] = encodeValue(value);
  return fields;
}

// --- Traversal ---------------------------------------------------------------

/** 'users/abc/publicProfile' -> 'users/{}/publicProfile' (one file per group). */
export function schemaPathOf(collectionPath) {
  return collectionPath
    .split('/')
    .map((part, i) => (i % 2 === 1 ? '{}' : part))
    .join('/');
}

/** File name of a group: 'users/{}/publicProfile' -> 'users.publicProfile.json'. */
export function fileNameOf(schemaPath) {
  return schemaPath.replace(/\/\{\}\//g, '.') + '.json';
}

/** Reads one collection completely (all pages). Throws if count and fetch differ. */
export async function fetchCollection(fetcher, collectionPath) {
  const docs = [];
  const seen = new Set();
  let token = null;
  do {
    const page = await fetcher.listPage(collectionPath, token);
    for (const doc of page.docs) {
      if (seen.has(doc.path)) {
        throw new Error(`${collectionPath}: Dokument doppelt geliefert: ${doc.path}`);
      }
      seen.add(doc.path);
      docs.push(doc);
    }
    token = page.nextPageToken || null;
    if (page.docs.length === 0 && token) {
      throw new Error(`${collectionPath}: leere Seite mit weiterem Seiten-Token (Endlosschleife?)`);
    }
  } while (token);
  const counted = await fetcher.countDocs(collectionPath);
  if (counted !== docs.length) {
    throw new Error(
      `${collectionPath}: Zaehlung (${counted}) passt nicht zu gelesenen Dokumenten (${docs.length}); ` +
        'wurde waehrend des Exports geschrieben? Erneut ausfuehren.'
    );
  }
  return docs;
}

/**
 * Exports everything. Returns { groups, summary } where groups maps a schema
 * path to [{ path, fields }]. Throws on ANY error or count mismatch.
 */
export async function runBackup(fetcher, { requiredCollections = [], onProgress } = {}) {
  const groups = new Map();
  const summary = {};
  const queue = [...(await fetcher.listRootCollections())].sort();
  for (const req of requiredCollections) {
    if (!queue.includes(req)) throw new Error(`Pflicht-Collection fehlt: ${req}`);
  }
  while (queue.length) {
    const collectionPath = queue.shift();
    const docs = await fetchCollection(fetcher, collectionPath);
    const key = schemaPathOf(collectionPath);
    const list = groups.get(key) ?? [];
    for (const doc of docs) list.push({ path: doc.path, fields: encodeFields(doc.data) });
    groups.set(key, list);
    summary[key] = (summary[key] ?? 0) + docs.length;
    onProgress?.(collectionPath, docs.length);
    // listDocumentPaths also returns "missing" docs (no fields, but with
    // subcollections, e.g. users/{uid}/publicProfile without a users/{uid} doc).
    for (const docPath of await fetcher.listDocumentPaths(collectionPath)) {
      for (const sub of await fetcher.listSubcollections(docPath)) {
        queue.push(`${docPath}/${sub}`);
      }
    }
  }
  for (const req of requiredCollections) {
    if (!summary[req]) throw new Error(`Pflicht-Collection ist leer: ${req}`);
  }
  for (const list of groups.values()) list.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { groups, summary };
}

// --- Manifest / files --------------------------------------------------------

/** Only called after runBackup succeeded and all files are written. */
export function buildManifest({ target, projectId, files, summary, now = new Date() }) {
  return {
    format: FORMAT,
    target, // 'production' | 'emulator'; the migration only accepts 'production'
    projectId,
    exportedAt: now.toISOString(),
    counts: summary,
    files,
  };
}

export function isoDay(now) {
  return now.toISOString().slice(0, 10);
}

/** backups/firestore-2026-10-13 (production) or backups/firestore-emulator-2026-10-13. */
export function backupDirName(target, now = new Date()) {
  return `firestore-${target === 'production' ? '' : 'emulator-'}${isoDay(now)}`;
}

/**
 * The backup must never land in (or above) data-export/: that folder holds the
 * committed typed snapshot read by prerender and migrate-region-ids --snapshot.
 * `rel` is the out dir relative to the repo root.
 */
export function assertSafeOutDir(rel) {
  const norm = rel.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!norm || norm.startsWith('..') || norm.startsWith('/')) {
    throw new Error(`Ausgabeordner muss im Repo unter ${BACKUP_ROOT_DIR}/ liegen: ${rel}`);
  }
  if (!norm.startsWith(`${BACKUP_ROOT_DIR}/`) || norm.split('/').includes('..')) {
    throw new Error(
      `Ausgabeordner muss unter ${BACKUP_ROOT_DIR}/ liegen (nie data-export/): ${rel}`
    );
  }
}

/**
 * Writes the backup into `<outDir>.partial`, then swaps it into place. A failed
 * run leaves an earlier backup untouched. `io` = { mkdir, writeFile, rm, rename,
 * sha256 } (node fs wrappers, injected for tests).
 */
export async function writeBackup(io, outDir, { groups, summary, target, projectId, now }) {
  const tmp = `${outDir}.partial`;
  await io.rm(tmp);
  await io.mkdir(tmp);
  const files = {};
  for (const [schemaPath, docs] of [...groups.entries()].sort()) {
    const name = fileNameOf(schemaPath);
    const body = JSON.stringify(docs, null, 2) + '\n';
    await io.writeFile(`${tmp}/${name}`, body);
    files[name] = {
      schemaPath,
      documents: docs.length,
      bytes: Buffer.byteLength(body),
      sha256: io.sha256(body),
    };
  }
  const manifest = buildManifest({ target, projectId, files, summary, now });
  await io.writeFile(`${tmp}/${MANIFEST_NAME}`, JSON.stringify(manifest, null, 2) + '\n');
  await io.rm(outDir);
  await io.rename(tmp, outDir);
  return manifest;
}

/** Restore check: files exist, hashes and document counts match the manifest. */
export function verifyBackup(readText, sha256) {
  const problems = [];
  let manifest;
  try {
    manifest = JSON.parse(readText(MANIFEST_NAME));
  } catch (err) {
    return { ok: false, problems: [`manifest.json nicht lesbar: ${err.message}`], manifest: null };
  }
  if (manifest.format !== FORMAT) problems.push(`Unbekanntes Format: ${manifest.format}`);
  if (!manifest.exportedAt) problems.push('exportedAt fehlt (Export war nicht vollstaendig)');
  const totals = {};
  for (const [name, meta] of Object.entries(manifest.files ?? {})) {
    let text;
    try {
      text = readText(name);
    } catch (err) {
      problems.push(`${name}: nicht lesbar (${err.message})`);
      continue;
    }
    if (sha256(text) !== meta.sha256) problems.push(`${name}: Pruefsumme stimmt nicht`);
    let docs;
    try {
      docs = JSON.parse(text);
    } catch {
      problems.push(`${name}: kein gueltiges JSON`);
      continue;
    }
    if (docs.length !== meta.documents) {
      problems.push(`${name}: ${docs.length} Dokumente, erwartet ${meta.documents}`);
    }
    totals[meta.schemaPath] = (totals[meta.schemaPath] ?? 0) + docs.length;
  }
  for (const [key, n] of Object.entries(manifest.counts ?? {})) {
    if ((totals[key] ?? 0) !== n) {
      problems.push(`${key}: ${totals[key] ?? 0} in Dateien, Manifest sagt ${n}`);
    }
  }
  return { ok: problems.length === 0, problems, manifest };
}

/** Latest `exportedAt` over valid production manifests (used by the migration). */
export function latestProductionExportedAt(manifests) {
  let best = null;
  for (const m of manifests) {
    if (!m || m.format !== FORMAT || m.target !== 'production') continue;
    if (m.projectId !== PROD_PROJECT_ID) continue;
    if (typeof m.exportedAt !== 'string' || Number.isNaN(new Date(m.exportedAt).getTime()))
      continue;
    if (!best || m.exportedAt > best) best = m.exportedAt;
  }
  return best;
}

// --- CLI options --------------------------------------------------------------

/**
 * Default: emulator. Production only with `--project spirieventsvbg` (and never
 * with FIRESTORE_EMULATOR_HOST set). `--verify <dir>` only reads files.
 */
export function resolveExportOptions(argv, { env = {} } = {}) {
  const args = [...argv];
  const opts = { project: null, verify: null, outDir: null };
  while (args.length) {
    const arg = args.shift();
    if (!['--project', '--verify', '--out-dir'].includes(arg)) {
      throw new Error(`Unbekannte Option: ${arg}`);
    }
    const value = args.shift();
    if (!value || value.startsWith('--')) throw new Error(`${arg} braucht einen Wert`);
    if (arg === '--project') opts.project = value;
    else if (arg === '--verify') opts.verify = value;
    else opts.outDir = value;
  }
  if (opts.verify) {
    if (opts.project || opts.outDir) throw new Error('--verify nimmt keine weiteren Optionen');
    return { ...opts, target: 'verify' };
  }
  if (opts.project !== null && opts.project !== PROD_PROJECT_ID) {
    throw new Error(`Unbekanntes Projekt "${opts.project}" (nur ${PROD_PROJECT_ID} erlaubt)`);
  }
  if (opts.project === null) {
    return {
      ...opts,
      target: 'emulator',
      emulatorHost: env.FIRESTORE_EMULATOR_HOST || DEFAULT_EMULATOR_HOST,
    };
  }
  if (env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST ist gesetzt, aber --project spirieventsvbg verlangt: unklares Ziel, Abbruch'
    );
  }
  return { ...opts, target: 'production' };
}
