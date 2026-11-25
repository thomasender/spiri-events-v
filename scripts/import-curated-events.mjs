#!/usr/bin/env node
// Ingest of discovery files into the event import staging area
// (docs/event-import.md): upserts `import_organizers`, writes
// `import_candidates` (status 'found') and an `import_runs` log doc. It does
// NOT create events: a Super-Admin accepts a candidate (callable
// importAcceptCandidate), which writes the pending event.
//
//   node scripts/import-curated-events.mjs --file zuerich.json [--file tirol.json ...]
//        dry run (default): plans against EMPTY state, needs no credentials, writes nothing
//   ... --dry-run --remote   dry run that reads the existing staging data (needs credentials)
//   ... --apply              write to tribe-vbg-staging
//   ... --project <id>       only tribe-vbg-staging; spirieventsvbg (production)
//                            additionally needs --allow-prod. Any other id is refused.
//
// Needs `app_settings/import.curatorUid` when applying / reading remotely
// (run scripts/ensure-curator-account.mjs first). Idempotent: candidates get
// a deterministic id (fingerprint), so a second run on the same file writes
// nothing new. Credentials: see scripts/lib/adminRest.mjs.
import { readFileSync } from 'fs';
import { basename } from 'path';
import {
  IMPORT_BLOCKLIST,
  IMPORT_CANDIDATES,
  IMPORT_ORGANIZERS,
  IMPORT_RUNS,
  IMPORT_SETTINGS_DOC,
} from '../src/utils/eventImport.js';
import {
  countSkipReasons,
  planIngest,
  resolveImportOptions,
  viennaToday,
} from '../src/utils/eventImportIngest.js';
import { placeAssignment } from '../src/utils/placeDistrict.js';
import { preparePlaceIndex } from '../src/utils/placeSearch.js';
import { STATIC_REGIONS } from '../src/utils/regions.js';
import { createAdminRestClient, toFirestoreFields } from './lib/adminRest.mjs';

const TAG = '[import-curated-events]';
const USAGE =
  'Usage: node scripts/import-curated-events.mjs --file <json> [--file <json> ...] [--dry-run [--remote] | --apply] [--project tribe-vbg-staging | --project spirieventsvbg --allow-prod]';
const MAX_BATCH = 100;
const MAX_RUN_ERRORS = 50;

const rawArgs = process.argv.slice(2);
const remoteFlag = rawArgs.includes('--remote');
let opts;
try {
  opts = resolveImportOptions(rawArgs.filter((a) => a !== '--remote'));
} catch (err) {
  console.error(`${TAG} ${err.message}\n${USAGE}`);
  process.exit(1);
}
const remote = opts.apply || remoteFlag;

const placeIndex = preparePlaceIndex(
  JSON.parse(readFileSync(new URL('../src/data/placeIndex.json', import.meta.url), 'utf8'))
);

/** Bezirk / Landkreis of a city, only when the place lies in this file's region. */
const districtFor = (regionId) => (city) => {
  const found = placeAssignment(placeIndex, STATIC_REGIONS, city);
  return found && found.regionId === regionId ? found.bezirk : '';
};

const files = opts.files.map((path) => ({ path, json: JSON.parse(readFileSync(path, 'utf8')) }));

let client = null;
let curatorUid = null;
let blockedIds = new Set();
if (remote) {
  client = await createAdminRestClient({ target: opts.target, projectId: opts.projectId });
  console.log(
    `${TAG} Ziel: ${opts.target === 'production' ? 'PRODUKTION' : 'STAGING'} (Projekt ${client.projectId})`
  );
  const settings = await client.getDocument(IMPORT_SETTINGS_DOC);
  curatorUid = settings?.curatorUid || null;
  if (!curatorUid) {
    console.error(
      `${TAG} ${IMPORT_SETTINGS_DOC}.curatorUid fehlt: zuerst node scripts/ensure-curator-account.mjs --apply ausführen.`
    );
    process.exit(1);
  }
  blockedIds = new Set((await client.listDocuments(IMPORT_BLOCKLIST)).map((d) => d.id));
}
console.log(
  opts.apply
    ? `${TAG} --apply: schreibt Organizer, Kandidaten und Lauf-Protokoll (keine Events).`
    : `${TAG} Probelauf, nichts wird geschrieben (--apply zum Schreiben).` +
        (remote ? '' : ' Bestehende Daten und Blocklist werden NICHT gelesen (offline).')
);

const now = new Date();
const today = viennaToday(now);
const summary = [];

for (const { path, json } of files) {
  const regionId = json?.region;
  const startedAt = new Date();
  let existingOrganizers = new Map();
  let existingCandidates = new Map();
  let existingEvents = [];
  if (remote && typeof regionId === 'string') {
    existingOrganizers = new Map(
      (await client.listDocuments(IMPORT_ORGANIZERS)).map((d) => [d.id, d.data])
    );
    existingCandidates = new Map(
      (await client.queryEqual(IMPORT_CANDIDATES, 'regionId', regionId)).map((d) => [d.id, d.data])
    );
    existingEvents = (await client.queryEqual('events', 'regionId', regionId)).map((d) => ({
      id: d.id,
      title: d.data.title,
      date: d.data.date,
      time: d.data.time,
    }));
  }

  const plan = planIngest(json, {
    now,
    today,
    blockedIds,
    existingOrganizers,
    existingCandidates,
    existingEvents,
    districtOf: districtFor(regionId),
  });
  if (!plan.ok) {
    console.error(`${TAG} ${path}: ${plan.errors.join('; ')}`);
    process.exitCode = 1;
    continue;
  }

  const reasons = countSkipReasons(plan.skipped.filter((s) => s.reason !== 'duplicate'));
  summary.push({ file: basename(path), region: plan.regionId, ...plan.counts, reasons });

  const orgWrites = plan.organizers.filter((o) => o.action !== 'unchanged');
  const writes = [
    ...orgWrites.map((o) => ({
      update: { name: `${IMPORT_ORGANIZERS}/${o.id}`, fields: toFirestoreFields(o.data) },
      ...(o.action === 'update'
        ? { updateMask: { fieldPaths: Object.keys(o.data) }, currentDocument: { exists: true } }
        : { currentDocument: { exists: false } }),
    })),
    ...plan.candidates.map((c) => ({
      update: { name: `${IMPORT_CANDIDATES}/${c.id}`, fields: toFirestoreFields(c.data) },
      currentDocument: { exists: false },
    })),
  ];

  if (!opts.apply) continue;
  for (let i = 0; i < writes.length; i += MAX_BATCH) {
    await client.commit(writes.slice(i, i + MAX_BATCH));
  }
  // The run log only when the run changed something (a rerun leaves nothing behind).
  const errors = plan.skipped
    .filter((s) => !['exists', 'duplicate'].includes(s.reason))
    .slice(0, MAX_RUN_ERRORS)
    .map((s) => `${s.reason}: ${s.organizerKey} / ${s.title}`);
  if (writes.length > 0 || errors.length > 0) {
    await client.commit([
      {
        update: {
          name: `${IMPORT_RUNS}/${startedAt.toISOString().replace(/[^0-9]/g, '')}-${plan.regionId}`,
          fields: toFirestoreFields({
            region: plan.regionId,
            source: `file:${basename(path)}`,
            counts: { ...plan.counts, skippedByReason: reasons },
            errors,
            costEstimate: null,
            startedAt,
            finishedAt: new Date(),
          }),
        },
        currentDocument: { exists: false },
      },
    ]);
  }
}

// ── Summary ───────────────────────────────────────────────────────────

const pad = (v, n) => String(v).padEnd(n);
console.log(`\n${TAG} Zusammenfassung${opts.apply ? ' (geschrieben)' : ' (Probelauf)'}:`);
console.log(
  [
    pad('Datei', 14),
    pad('Region', 8),
    pad('Orgs', 5),
    pad('neu', 4),
    pad('upd', 4),
    pad('geblockt', 9),
    pad('ungültig', 9),
    pad('Kandidaten', 11),
    pad('übernommen', 11),
    pad('Duplikat', 9),
    pad('Bild verworfen', 15),
  ].join('')
);
for (const s of summary) {
  console.log(
    [
      pad(s.file, 14),
      pad(s.region, 8),
      pad(s.organizersFile, 5),
      pad(s.organizersCreate, 4),
      pad(s.organizersUpdate, 4),
      pad(s.organizersBlocked, 9),
      pad(s.organizersInvalid, 9),
      pad(s.candidatesFile, 11),
      pad(s.accepted, 11),
      pad(s.duplicates, 9),
      pad(s.imageDropped, 15),
    ].join('')
  );
}
console.log(`\n${TAG} Übersprungen nach Grund:`);
for (const s of summary) {
  const entries = Object.entries(s.reasons);
  console.log(
    `  ${s.region}: ` + (entries.length ? entries.map(([k, v]) => `${k}=${v}`).join(', ') : '-')
  );
}
