#!/usr/bin/env node
// Builds the Landkreis map of Germany (Verwaltung -> "Zuordnung" and the Germany view of
// "Region auswählen") -> src/data/landkreisMap.json, and the prepared assignment
// "Vorschlag laden" -> src/data/regionSuggestion.js.
//
// Source: the product owner's map "Neu_Kulturregionen_Deutschlands_mit_Landkreisen_und_
// Städten.html" (not committed). Its data line holds `var D=[...],K=[...],CO=[...],W=..,H=..;`
//   D  = cultural regions {s: Großregion, h: hue, sh: shade, n: name, k: [Landkreise], p, x, y}
//   K  = Landkreise / kreisfreie Städte ("(S)") {n: name, r: index into D, p: path, x, y}
//   CO = country outlines [["DE", path]]
// Coordinates are already projected SVG units of a W x H viewBox (1 decimal).
// The file is only READ AS TEXT: the arrays are cut out and parsed with JSON.parse, its
// script is never executed.
//
//   node scripts/build-landkreis-map.mjs <path-to-html>            write both files
//   node scripts/build-landkreis-map.mjs <path-to-html> --check    only report, write nothing
//
// Districts are matched by name to DISTRICT_CATALOG (key "DE|<name>"); the rules and the
// explicit ALIASES below. Anything unmatched, duplicated or left over stops the build.
import { readFileSync, writeFileSync } from 'node:fs';
import { DISTRICT_CATALOG } from '../src/utils/regionMapping.js';
import { STATIC_REGIONS } from '../src/utils/regions.js';
import { REGION_SUGGESTION } from '../src/data/regionSuggestion.js';

const root = new URL('..', import.meta.url).pathname;
const [htmlPath, ...flags] = process.argv.slice(2);
if (!htmlPath) {
  console.error('usage: node scripts/build-landkreis-map.mjs <path-to-html> [--check]');
  process.exit(1);
}
const checkOnly = flags.includes('--check');

// Names of the map -> catalog names where the generic rules do not fit.
const ALIASES = {
  // The map writes the Bavarian names out, the catalog (Destatis) abbreviates them.
  'Dillingen an der Donau': 'Dillingen a.d.Donau',
  'Mühldorf am Inn': 'Mühldorf a.Inn',
  'Neumarkt in der Oberpfalz': 'Neumarkt i.d.OPf.',
  'Neustadt an der Aisch-Bad Windsheim': 'Neustadt a.d.Aisch-Bad Windsheim',
  'Neustadt an der Waldnaab': 'Neustadt a.d.Waldnaab',
  'Pfaffenhofen an der Ilm': 'Pfaffenhofen a.d.Ilm',
  'Weiden in der Oberpfalz (S)': 'Weiden i.d.OPf.',
  'Wunsiedel im Fichtelgebirge': 'Wunsiedel i.Fichtelgebirge',
  'Oldenburg (S)': 'Oldenburg (Oldenburg)',
  // Catalog: the city is "Rostock", the Landkreis "Landkreis Rostock".
  Rostock: 'Landkreis Rostock',
  // Map geometry is about 2015. Merged since: Osterode am Harz -> Göttingen (2016),
  // Eisenach -> Wartburgkreis (2021). Both shapes are drawn as part of the new district
  // (same cultural region in the map).
  'Osterode am Harz': 'Göttingen',
  'Eisenach (S)': 'Wartburgkreis',
};
// Map districts that may share a catalog district (the merges above).
const MERGED = new Set(['Osterode am Harz', 'Eisenach (S)']);

// Region names of the map -> register slug where the names differ. `null`: the three city
// states, which have no cultural region (they stay their Bundesland).
const REGION_ALIASES = {
  'Nordfriesland, Eiderstedt & Uthlande': 'nordfriesland',
  'Holstein & Holsteinische Schweiz': 'holstein',
  'Vorpommern (Festland & Inseln)': 'vorpommern',
  'Ruhrgebiet („Pott“)': 'ruhrgebiet',
  'Südthüringen (Hennebergisch)': 'suedthueringen',
  'Klassikerregion (Weimar/Erfurt/Jena)': 'klassikerregion',
  'Franken (Ober-, Mittel-, Unterfranken)': 'franken',
  Hamburg: null,
  'Bremen / Bremerhaven': null,
  Berlin: null,
};

/** Cuts `name=[...]` out of the data line (JSON-aware bracket scan) and parses it. */
function extractArray(text, name) {
  const start = text.indexOf(`${name}=[`);
  if (start < 0) throw new Error(`${name} not found`);
  const from = start + name.length + 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return JSON.parse(text.slice(from, i + 1));
  }
  throw new Error(`${name} not terminated`);
}
function extractNumber(text, name) {
  const m = text.match(new RegExp(`[,\\s]${name}=([0-9.]+)[,;]`));
  if (!m) throw new Error(`${name} not found`);
  return Number(m[1]);
}

const html = readFileSync(htmlPath, 'utf8');
const dataLine = html.split('\n').find((l) => l.startsWith('var D=['));
if (!dataLine) throw new Error('data line "var D=[" not found');
const D = extractArray(dataLine, 'var D');
const K = extractArray(dataLine, ',K');
const CO = extractArray(dataLine, ',CO');
const W = extractNumber(dataLine, 'W');
const H = extractNumber(dataLine, 'H');

// --- cultural regions -------------------------------------------------------------
const cultural = STATIC_REGIONS.filter((r) => r.country === 'DE' && !r.home);
const culturalByName = new Map(cultural.map((r) => [r.name, r.slug]));
const regionSlugOf = D.map((d) => {
  const slug = d.n in REGION_ALIASES ? REGION_ALIASES[d.n] : culturalByName.get(d.n);
  if (slug === undefined) throw new Error(`map region "${d.n}" has no register slug`);
  return slug;
});
const usedSlugs = regionSlugOf.filter(Boolean);
const missingRegions = cultural.filter((r) => !usedSlugs.includes(r.slug)).map((r) => r.slug);
if (missingRegions.length) throw new Error(`regions not in the map: ${missingRegions}`);
if (new Set(usedSlugs).size !== usedSlugs.length) throw new Error('region slug used twice');

// --- districts --------------------------------------------------------------------
const catalog = DISTRICT_CATALOG.filter((d) => d.country === 'DE');
const catalogNames = new Set(catalog.map((d) => d.name));
function catalogName(name) {
  if (ALIASES[name]) return ALIASES[name];
  if (name.endsWith(' (S)')) {
    const base = name.slice(0, -4);
    if (catalogNames.has(`${base} (Stadt)`)) return `${base} (Stadt)`;
    return catalogNames.has(base) ? base : null;
  }
  if (catalogNames.has(name)) return name;
  return catalogNames.has(`${name} (Landkreis)`) ? `${name} (Landkreis)` : null;
}

const problems = [];
const shapesByKey = new Map(); // key -> [K entries]
for (const k of K) {
  const name = catalogName(k.n);
  if (!name || !catalogNames.has(name)) {
    problems.push(`unmatched map district "${k.n}"`);
    continue;
  }
  const key = `DE|${name}`;
  if (!shapesByKey.has(key)) shapesByKey.set(key, []);
  shapesByKey.get(key).push(k);
}
for (const [key, list] of shapesByKey) {
  const primary = list.filter((k) => !MERGED.has(k.n));
  if (primary.length !== 1) problems.push(`${key}: ${list.map((k) => k.n).join(' + ')}`);
  if (new Set(list.map((k) => k.r)).size > 1) {
    problems.push(`${key}: merged shapes lie in different regions`);
  }
}
for (const d of catalog) {
  if (!shapesByKey.has(d.key)) problems.push(`catalog district without shape: ${d.key}`);
}
// The region lists D[].k must agree with K[].r.
D.forEach((d, i) => {
  const fromK = K.filter((k) => k.r === i)
    .map((k) => k.n)
    .sort();
  if (JSON.stringify([...d.k].sort()) !== JSON.stringify(fromK)) {
    problems.push(`region "${d.n}": k list differs from K[].r`);
  }
});
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

// --- output -----------------------------------------------------------------------
// Lossless size reduction: the source paths use only absolute M/L/Z with one decimal.
// They are rewritten with relative "l" steps, computed in whole tenths so every point
// stays exactly where it was.
const tenths = (v) => Math.round(Number(v) * 10);
const num = (t) => {
  const s = (Math.abs(t) / 10).toString().replace(/^0\./, '.');
  return t < 0 ? `-${s}` : s;
};
function compactPath(path) {
  if (/[^MLZ0-9.,\s-]/.test(path)) throw new Error('unexpected path command');
  let out = '';
  for (const sub of path.match(/M[^M]*/g)) {
    const closed = /Z\s*$/.test(sub);
    const pts = sub
      .replace(/[MZ]/g, '')
      .split('L')
      .filter((s) => s.trim())
      .map((pair) => pair.split(',').map(tenths));
    let [px, py] = pts[0];
    out += `M${num(px)},${num(py)}`;
    let steps = '';
    for (const [x, y] of pts.slice(1)) {
      const a = num(x - px);
      const b = num(y - py);
      steps += `${steps && !a.startsWith('-') ? ' ' : ''}${a}${b.startsWith('-') ? '' : ','}${b}`;
      px = x;
      py = y;
    }
    if (steps) out += `l${steps}`;
    if (closed) out += 'Z';
  }
  return out;
}
const districts = {};
const assignment = {}; // slug -> [catalog names]
for (const d of catalog) {
  const list = shapesByKey.get(d.key);
  const main = list.find((k) => !MERGED.has(k.n));
  districts[d.key] = { d: list.map((k) => compactPath(k.p)).join(''), x: main.x, y: main.y };
  const slug = regionSlugOf[main.r];
  if (slug) (assignment[slug] ??= []).push(d.name);
}
const regions = {};
D.forEach((d, i) => {
  if (regionSlugOf[i]) regions[regionSlugOf[i]] = { h: d.h, sh: d.sh };
});
const map = {
  viewBox: `0 0 ${W} ${H}`,
  country: CO.map(([, p]) => compactPath(p)),
  regions,
  districts,
};

// --- report: map assignment vs the current suggestion -----------------------------
const oldHolder = new Map();
for (const [slug, names] of Object.entries(REGION_SUGGESTION)) {
  for (const n of names) oldHolder.set(n, slug);
}
const newHolder = new Map();
for (const [slug, names] of Object.entries(assignment)) {
  for (const n of names) newHolder.set(n, slug);
}
const diffs = [];
for (const d of catalog) {
  const a = oldHolder.get(d.name) ?? '(Bundesland)';
  const b = newHolder.get(d.name) ?? '(Bundesland)';
  if (a !== b) diffs.push(`${d.name}: ${a} -> ${b}`);
}
console.log(
  `${K.length} map districts -> ${catalog.length} catalog districts, ` +
    `${Object.keys(regions).length} cultural regions, ${newHolder.size} districts assigned ` +
    `(suggestion before: ${oldHolder.size}), ${diffs.length} differ:`
);
for (const line of diffs) console.log(`  ${line}`);
if (checkOnly) process.exit(0);

writeFileSync(`${root}src/data/landkreisMap.json`, `${JSON.stringify(map)}\n`);

// Suggestion file: grouped by Großregion in map order.
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const key = (s) => (/^[a-z][a-z0-9]*$/.test(s) ? s : q(s));
let body = '';
let macro = null;
D.forEach((d, i) => {
  const slug = regionSlugOf[i];
  if (!slug) return;
  if (d.s !== macro) {
    macro = d.s;
    body += `  // ${macro}\n`;
  }
  const names = [...assignment[slug]].sort((a, b) => a.localeCompare(b, 'de'));
  body += `  ${key(slug)}: [\n${names.map((n) => `    ${q(n)},\n`).join('')}  ],\n`;
});
const suggestion = `// GENERATED by scripts/build-landkreis-map.mjs from the product owner's map
// "Neu Kulturregionen Deutschlands mit Landkreisen und Städten". Do not edit by hand.
//
// Suggested Landkreis / kreisfreie Stadt -> cultural region of Germany, used by the
// "Vorschlag laden" button in Verwaltung -> "Zuordnung". It only STAGES moves (the
// product owner reviews, changes and saves them); nothing is written from here.
// Names are the district names of DISTRICT_CATALOG (guarded by regionSuggestion.spec.ts:
// every name exists, none twice). Districts that are not listed (Berlin, Hamburg,
// Bremen, Bremerhaven) stay in their Bundesland.
export const REGION_SUGGESTION = Object.freeze({
${body}});

/** Suggested moves [{ districtKey, toRegionId }] for Germany. */
export function suggestedMoves() {
  return Object.entries(REGION_SUGGESTION).flatMap(([toRegionId, names]) =>
    names.map((name) => ({ districtKey: \`DE|\${name}\`, toRegionId }))
  );
}
`;
writeFileSync(`${root}src/data/regionSuggestion.js`, suggestion);
console.log('wrote src/data/landkreisMap.json and src/data/regionSuggestion.js');
