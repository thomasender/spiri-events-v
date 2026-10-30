#!/usr/bin/env node
// Builds the static region register from the four country CSVs in scripts/data/regions/
// (oesterreich.csv, deutschland.csv, schweiz.csv, liechtenstein.csv; two layouts, see
// scripts/lib/regionRegister.mjs).
// They are the ONLY source of regions and districts. Writes
//   src/data/regionData.js          (client)
//   functions/src/regionData.ts     (Cloud Functions copy; functions/ cannot import src/)
// Run after changing a CSV or the META table in scripts/lib/regionRegister.mjs:
//   node scripts/build-region-data.mjs
// tests/lib/regionRegisterCsv.spec.ts regenerates both files and fails when they drift.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import * as prettier from 'prettier';
import {
  buildRegister,
  readRegionCsvs,
  renderRegisterFiles,
  retiredRegionIds,
} from './lib/regionRegister.mjs';

const root = new URL('..', import.meta.url).pathname;

let regions;
try {
  regions = buildRegister(readRegionCsvs(root));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
for (const [path, body] of Object.entries(renderRegisterFiles(regions))) {
  mkdirSync(dirname(root + path), { recursive: true });
  // Formatted like the rest of the code base (the generated files are checked in).
  const options = (await prettier.resolveConfig(root + path)) ?? {};
  writeFileSync(root + path, await prettier.format(body, { ...options, filepath: root + path }));
}
const byCountry = {};
for (const r of regions) {
  const c = (byCountry[r.country] ??= { regions: 0, districts: 0 });
  c.regions += 1;
  c.districts += r.bezirke.length;
}
console.log(
  `${regions.length} regions, ${regions.reduce((n, r) => n + r.bezirke.length, 0)} districts`,
  Object.entries(byCountry)
    .map(([c, n]) => `${c}: ${n.regions} / ${n.districts}`)
    .join(', '),
  `(${retiredRegionIds(regions).length} retired ids)`
);
