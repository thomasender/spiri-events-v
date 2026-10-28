// One-off, re-runnable codemod that moves raw spacing / font-size values in
// src/**/*.css onto the design tokens defined in src/styles/tokens.css.
//
// It is deliberately conservative so the rendered result stays pixel-identical:
//   - only exact matches are replaced (no snapping to the "nearest" step),
//   - only single-line `padding|margin|gap|row-gap|column-gap|font-size`
//     declarations are touched,
//   - negative values, calc()/clamp()/var() values and anything not on the scale
//     are left alone and listed in the report.
//
//   node scripts/tokenize-css.mjs          # dry run, prints the report
//   node scripts/tokenize-css.mjs --write  # rewrite the files

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WRITE = process.argv.includes('--write');
const ROOT = new URL('../src', import.meta.url).pathname;

// px -> spacing token. Must match src/styles/tokens.css.
export const SPACE = {
  2: '--space-0-5',
  4: '--space-1',
  6: '--space-1-5',
  8: '--space-2',
  10: '--space-2-5',
  12: '--space-3',
  14: '--space-3-5',
  16: '--space-4',
  18: '--space-4-5',
  20: '--space-5',
  24: '--space-6',
  28: '--space-7',
  32: '--space-8',
  36: '--space-9',
  40: '--space-10',
  48: '--space-12',
  64: '--space-16',
};

// rem font-size -> text token (name = percent of the 16px base). Must match tokens.css.
export const TEXT = {
  0.7: '--text-70',
  0.75: '--text-75',
  0.8: '--text-80',
  0.8125: '--text-81',
  0.85: '--text-85',
  0.875: '--text-88',
  0.9: '--text-90',
  0.92: '--text-92',
  0.95: '--text-95',
  1: '--text-100',
  1.05: '--text-105',
  1.1: '--text-110',
  1.15: '--text-115',
  1.2: '--text-120',
  1.25: '--text-125',
  1.3: '--text-130',
  1.35: '--text-135',
  1.4: '--text-140',
  1.5: '--text-150',
  1.6: '--text-160',
  1.75: '--text-175',
  1.8: '--text-180',
  2: '--text-200',
  2.5: '--text-250',
};

const SPACING_PROPS =
  /^(padding|margin|gap|row-gap|column-gap|(padding|margin)-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))$/;
const DECL = /^(\s*)([a-z-]+)(\s*:\s*)([^;{}]+?)(\s*(?:!important)?\s*;.*)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.css')) out.push(p);
  }
  return out;
}

const skipped = new Map();
const note = (key) => skipped.set(key, (skipped.get(key) || 0) + 1);

function mapSpacing(value) {
  const parts = value.trim().split(/\s+/);
  const out = [];
  for (const part of parts) {
    if (part === '0' || part === 'auto' || part === 'inherit' || part.endsWith('%')) {
      out.push(part);
      continue;
    }
    if (/^var\(--space-[\d-]+\)$/.test(part)) {
      out.push(part);
      continue;
    }
    const m = /^(\d+(?:\.\d+)?)px$/.exec(part);
    if (!m) {
      if (part.includes('(') || part.startsWith('-') || part.endsWith('rem')) note(`space:${part}`);
      return null;
    }
    const token = SPACE[Number(m[1])];
    if (!token) {
      note(`space:${part}`);
      return null;
    }
    out.push(`var(${token})`);
  }
  return out.join(' ');
}

function mapFontSize(value) {
  const m = /^(\d+(?:\.\d+)?)rem$/.exec(value.trim());
  if (!m) return null;
  const token = TEXT[Number(m[1])];
  if (!token) {
    note(`text:${value.trim()}`);
    return null;
  }
  return `var(${token})`;
}

let changedFiles = 0;
let changedDecls = 0;

for (const file of walk(ROOT)) {
  if (file.endsWith('styles/tokens.css')) continue;
  const src = readFileSync(file, 'utf8');
  let changed = false;
  const lines = src.split('\n').map((line) => {
    const m = DECL.exec(line);
    if (!m) return line;
    const [, indent, prop, colon, value, rest] = m;
    let next = null;
    if (SPACING_PROPS.test(prop)) next = mapSpacing(value);
    else if (prop === 'font-size') next = mapFontSize(value);
    if (next === null || next === value.trim()) return line;
    changed = true;
    changedDecls += 1;
    return `${indent}${prop}${colon}${next}${rest}`;
  });
  if (changed) {
    changedFiles += 1;
    if (WRITE) writeFileSync(file, lines.join('\n'));
  }
}

console.log(
  `${WRITE ? 'Rewrote' : 'Would rewrite'} ${changedDecls} declarations in ${changedFiles} files.`
);
console.log('\nLeft raw (not on the scale), by frequency:');
[...skipped.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 40)
  .forEach(([k, n]) => console.log(String(n).padStart(5), k));
