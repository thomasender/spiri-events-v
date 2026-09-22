#!/usr/bin/env node
/**
 * Re-computes the `slug` field of every event in
 * data-export/firestore-export/events.json using the new URL format
 * `{titleSlug}-{categorySlug}-in-{bezirkSlug}-{yyyymmdd}` and the
 * umlaut-aware `slugify()`. Touches only the slug string — every other
 * field is preserved as-is.
 *
 * Run this after `scripts/migrate-event-slugs.mjs` against production
 * (or as a stand-alone offline update) so the prerender's deterministic
 * snapshot matches the live Firestore state.
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { generateEventSlug } from '../src/lib/slug-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EVENTS_FILE = join(ROOT, 'data-export', 'firestore-export', 'events.json');

function normalizeCategory(event) {
  if (event.category) return event.category;
  if (Array.isArray(event.categories) && event.categories.length > 0) {
    return event.categories[0];
  }
  return 'Sonstiges';
}

function normalizeBezirk(event) {
  return event.isOnline ? '' : event.bezirk || '';
}

function unwrap(value) {
  if (value == null) return null;
  if (typeof value === 'object') {
    if ('stringValue' in value) return value.stringValue ?? null;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('booleanValue' in value) return value.booleanValue === 'true';
    if ('nullValue' in value) return null;
    if ('timestampValue' in value) return value.timestampValue;
    if ('mapValue' in value) {
      const out = {};
      for (const [k, v] of Object.entries(value.mapValue.fields || {})) out[k] = unwrap(v);
      return out;
    }
    if ('arrayValue' in value) {
      return (value.arrayValue.values || []).map(unwrap);
    }
  }
  return value;
}

function wrap(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value ? 'true' : 'false' };
  return { stringValue: String(value) };
}

function main() {
  const events = JSON.parse(readFileSync(EVENTS_FILE, 'utf8'));
  console.log(`[refresh-event-slugs-snapshot] Loaded ${events.length} events.`);

  // First pass: compute the base slug for every event.
  const computed = events.map((event) => {
    const data = {};
    for (const [k, v] of Object.entries(event)) {
      if (k === 'id' || k === 'slug') continue;
      data[k] = unwrap(v);
    }
    const title = data.title || '';
    const category = normalizeCategory(data);
    const bezirk = normalizeBezirk(data);
    const date = data.date || '';
    return { event, title, base: generateEventSlug(title, category, bezirk, date) };
  });

  // Second pass: pick a unique slug per event. Mirrors `findUniqueSlug`
  // (`-2`, `-3`, … on collision). The old `slug` field is irrelevant — we're
  // rewriting all slugs from the new inputs.
  const assigned = new Set();
  let changed = 0;
  for (const { event, title, base } of computed) {
    if (!base) continue;

    let candidate = base;
    let counter = 1;
    while (assigned.has(candidate)) {
      counter += 1;
      candidate = `${base}-${counter}`;
    }
    assigned.add(candidate);

    const oldSlug = unwrap(event.slug) || '';
    if (candidate === oldSlug) continue;

    event.slug = wrap(candidate);
    changed += 1;
    console.log(`  - ${title || '(untitled)'}: ${oldSlug || '(empty)'} → ${candidate}`);
  }

  if (changed === 0) {
    console.log('[refresh-event-slugs-snapshot] No changes needed.');
    return;
  }

  writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
  console.log(`[refresh-event-slugs-snapshot] Wrote ${changed} updated slug(s) to ${EVENTS_FILE}`);
}

try {
  main();
} catch (err) {
  console.error('[refresh-event-slugs-snapshot] Fatal:', err);
  process.exit(1);
}