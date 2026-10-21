#!/usr/bin/env node
/**
 * Fills in the `slug` field of every event in
 * data-export/firestore-export/events.json that has none yet, using the
 * current URL format (see `generateEventSlug` in src/lib/slug-helpers.js).
 * Existing slugs are never rewritten (Trello djZ97twM): shared links must
 * keep working. Touches only the slug string — every other field is
 * preserved as-is.
 *
 * Run this after `scripts/migrate-event-slugs.mjs` against production
 * (or as a stand-alone offline update) so the prerender's deterministic
 * snapshot matches the live Firestore state.
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { planMissingEventSlugs } from '../src/lib/slug-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EVENTS_FILE = join(ROOT, 'data-export', 'firestore-export', 'events.json');

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

  const plan = planMissingEventSlugs(
    events.map((event, index) => {
      const data = {};
      for (const [k, v] of Object.entries(event)) {
        if (k === 'id') continue;
        data[k] = unwrap(v);
      }
      return { id: String(index), data };
    })
  );
  let changed = 0;
  for (const { id, slug } of plan) {
    const event = events[Number(id)];
    event.slug = wrap(slug);
    changed += 1;
    console.log(`  - ${unwrap(event.title) || '(untitled)'}: (empty) → ${slug}`);
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
