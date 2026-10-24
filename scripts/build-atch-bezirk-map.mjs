#!/usr/bin/env node
// Builds the Bezirk map of Austria and Switzerland (Verwaltung -> "Zuordnung", countries
// Österreich / Schweiz) -> src/data/bezirkMapAtCh.json.
//
// Source: the product owner's map "Österreich, Schweiz und Liechtenstein – Bundesländer,
// Kantone und Bezirke.html" (ticket 599, not committed). Its script holds
// `var R=[...],B=[...],CO=[...],W=..,H=..;`
//   R  = Bundesländer / Kantone / Liechtenstein {c: country, n: name, nb: number of Bezirke, p: path, h, sh}
//   B  = Bezirke {n: name, r: index into R, p: path}   (cantons without Bezirke: nb = 0, no entry in B
//        for some of them; their outline is R[].p)
//   CO = country outlines [[country, path]]
// The file is only READ AS TEXT: the arrays are cut out and parsed with JSON.parse, its
// script is never executed.
//
//   node scripts/build-atch-bezirk-map.mjs <path-to-html>           write the map
//   node scripts/build-atch-bezirk-map.mjs <path-to-html> --check   only report, write nothing
//
// The shapes are matched by name to DISTRICT_CATALOG (keys "AT|<name>", "CH|<name>"); the
// register is NOT changed to fit the map. Where the map is finer than the register (Wien:
// 23 Gemeindebezirke, Bern "Oberland", Schaffhausen: old Bezirke) several shapes are drawn
// as one district. Map shapes without a register district stay on the map as "nicht
// zuordenbar" (`unmatched`, not clickable); register districts without a shape stop the build.
// Liechtenstein is not in the register (no country, no region) and is not drawn.
import { readFileSync, writeFileSync } from 'node:fs';
import { DISTRICT_CATALOG } from '../src/utils/regionMapping.js';
import { STATIC_REGIONS } from '../src/utils/regions.js';

const root = new URL('..', import.meta.url).pathname;
const [htmlPath, ...flags] = process.argv.slice(2);
if (!htmlPath) {
  console.error('usage: node scripts/build-atch-bezirk-map.mjs <path-to-html> [--check]');
  process.exit(1);
}
const checkOnly = flags.includes('--check');

const COUNTRIES = { Österreich: 'AT', Schweiz: 'CH' };

// "<Bundesland / Kanton>|<name in the map>" -> register district name.
const ALIASES = {
  'Niederösterreich|Krems (Land)': 'Krems-Land',
  'Niederösterreich|Krems an der Donau (Stadt)': 'Krems an der Donau',
  'Niederösterreich|Sankt Pölten (Land)': 'St. Pölten-Land',
  'Niederösterreich|Sankt Pölten (Stadt)': 'St. Pölten',
  'Niederösterreich|Waidhofen an der Ybbs (Stadt)': 'Waidhofen an der Ybbs',
  'Niederösterreich|Wiener Neustadt (Land)': 'Wiener Neustadt-Land',
  'Niederösterreich|Wiener Neustadt (Stadt)': 'Wiener Neustadt',
  'Kärnten|Klagenfurt Land': 'Klagenfurt-Land',
  'Kärnten|Klagenfurt Stadt': 'Klagenfurt am Wörthersee',
  'Kärnten|Villach Land': 'Villach-Land',
  'Kärnten|Villach Stadt': 'Villach',
  'Salzburg|Salzburg (Stadt)': 'Salzburg',
  'Salzburg|Sankt Johann im Pongau': 'St. Johann im Pongau',
  'Steiermark|Graz (Stadt)': 'Graz',
  'Oberösterreich|Braunau': 'Braunau am Inn',
  'Oberösterreich|Kirchdorf': 'Kirchdorf an der Krems',
  'Oberösterreich|Ried': 'Ried im Innkreis',
  'Oberösterreich|Stadt Linz': 'Linz',
  'Oberösterreich|Stadt Steyr': 'Steyr',
  'Oberösterreich|Stadt Wels': 'Wels',
  'Tirol|Innsbruck-Stadt': 'Innsbruck',
  'Burgenland|Eisenstadt (Stadt)': 'Eisenstadt',
  'Burgenland|Rust (Stadt)': 'Rust',
  // The register has one district "Oberland" for the two Verwaltungskreise of the map.
  'Bern|Frutigen-Niedersimmental': 'Oberland',
  'Bern|Interlaken-Oberhasli': 'Oberland',
  'Freiburg|See / District du Lac': 'See',
  'Freiburg|la Broye': 'Broye',
  'Freiburg|la Glâne': 'Glane',
  'Freiburg|la Gruyère': 'Greyerz',
  'Freiburg|la Sarine': 'Saane',
  'Basel-Stadt|Basel-Stadt': 'Basel',
  'Graubünden|Engiadina Bassa / Val Müstair': 'Engiadina Bassa/Val Müstair',
  'Graubünden|Prättigau / Davos': 'Prättigau/Davos',
  "Waadt|l'Ouest lausannois": 'Ouest lausannois',
  'Waadt|la Broye-Vully': 'Broye-Vully',
  "Waadt|la Riviera-Pays-d'Enhaut": "Riviera-Pays-d'Enhaut",
};
// Whole-canton / whole-city aliases: every shape of the Bundesland / Kanton is ONE register district.
const WHOLE = { Wien: 'Wien', Schaffhausen: 'Schaffhausen' };

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

const html = readFileSync(htmlPath, 'utf8');
const script = html.slice(html.indexOf('<script'));
const R = extractArray(script, 'var R');
const B = extractArray(script, ',B');
const CO = extractArray(script, ',CO');

const problems = [];
const unmatched = []; // [{ country, state, name }]
const out = {};
for (const country of ['AT', 'CH']) {
  const states = STATIC_REGIONS.filter((r) => r.country === country && r.home);
  const catalog = DISTRICT_CATALOG.filter((d) => d.country === country);
  const catalogNames = new Set(catalog.map((d) => d.name));
  const shapes = new Map(); // key -> [path]
  const regions = {};
  const add = (key, path) => (shapes.get(key) ?? shapes.set(key, []).get(key)).push(path);
  const loose = {}; // key (unmatched) -> { path, state, name }

  R.forEach((r, ri) => {
    if (COUNTRIES[r.c] !== country) return;
    const state = states.find((s) => s.name === r.n);
    if (!state) {
      problems.push(`map region "${r.n}" is not in the register`);
      return;
    }
    regions[state.slug] = { h: r.h, sh: r.sh };
    const own = B.filter((b) => b.r === ri);
    const stateDistricts = catalog.filter((d) => d.stateSlug === state.slug).map((d) => d.name);
    if (own.length === 0 || (own.length === 1 && own[0].n === r.n)) {
      // Canton drawn as one area: the register has exactly one district for it.
      const path = own[0]?.p ?? r.p;
      if (stateDistricts.length !== 1) {
        problems.push(`${r.n}: drawn as one area, register has ${stateDistricts.length} districts`);
      } else add(`${country}|${stateDistricts[0]}`, path);
      return;
    }
    for (const b of own) {
      let name = WHOLE[r.n] ?? ALIASES[`${r.n}|${b.n}`] ?? b.n;
      if (!stateDistricts.includes(name)) {
        unmatched.push({ country, state: r.n, name: b.n });
        loose[`${country}|~${r.n}|${b.n}`] = { path: b.p, state: state.slug, name: b.n };
        continue;
      }
      add(`${country}|${name}`, b.p);
    }
  });
  for (const d of catalog) {
    if (!shapes.has(d.key)) problems.push(`register district without shape: ${d.key}`);
  }
  out[country] = { regions, shapes, loose };
}

// Country outlines and per-country view boxes.
const bbox = (paths) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of paths) {
    for (const m of p.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) {
      const x = Number(m[1]);
      const y = Number(m[2]);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, x1, y1 };
};
const tenths = (v) => Math.round(Number(v) * 10);
const num = (t) => {
  const s = (Math.abs(t) / 10).toString().replace(/^0\./, '.');
  return t < 0 ? `-${s}` : s;
};
function compactPath(path) {
  if (/[^MLZ0-9.,\s-]/.test(path)) throw new Error('unexpected path command');
  let res = '';
  for (const sub of path.match(/M[^M]*/g)) {
    const closed = /Z\s*$/.test(sub);
    const pts = sub
      .replace(/[MZ]/g, '')
      .split('L')
      .filter((s) => s.trim())
      .map((pair) => pair.split(',').map(tenths));
    let [px, py] = pts[0];
    res += `M${num(px)},${num(py)}`;
    let steps = '';
    for (const [x, y] of pts.slice(1)) {
      const a = num(x - px);
      const b = num(y - py);
      steps += `${steps && !a.startsWith('-') ? ' ' : ''}${a}${b.startsWith('-') ? '' : ','}${b}`;
      px = x;
      py = y;
    }
    if (steps) res += `l${steps}`;
    if (closed) res += 'Z';
  }
  return res;
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
const result = {};
for (const country of ['AT', 'CH']) {
  const { regions, shapes, loose } = out[country];
  const all = [...shapes.values()].flat().concat(Object.values(loose).map((l) => l.path));
  const { x0, y0, x1, y1 } = bbox(all);
  const pad = 6;
  const districts = {};
  for (const [key, paths] of shapes) districts[key] = { d: paths.map(compactPath).join('') };
  const unmatchedShapes = Object.entries(loose).map(([key, l]) => ({
    key,
    name: l.name,
    state: l.state,
    d: compactPath(l.path),
  }));
  const coName = country === 'AT' ? 'Österreich' : 'Schweiz';
  result[country] = {
    viewBox: `${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(x1 - x0 + 2 * pad).toFixed(1)} ${(y1 - y0 + 2 * pad).toFixed(1)}`,
    country: CO.filter(([c]) => c === coName).map(([, p]) => compactPath(p)),
    regions,
    districts,
    unmatched: unmatchedShapes,
  };
}

for (const country of ['AT', 'CH']) {
  console.log(
    `${country}: ${Object.keys(result[country].districts).length} register districts drawn, ` +
      `${result[country].unmatched.length} map shapes without register district`
  );
}
for (const u of unmatched) console.log(`  no register district: ${u.country} ${u.state} / ${u.name}`);
if (checkOnly) process.exit(0);
writeFileSync(`${root}src/data/bezirkMapAtCh.json`, `${JSON.stringify(result)}\n`);
console.log('wrote src/data/bezirkMapAtCh.json');
