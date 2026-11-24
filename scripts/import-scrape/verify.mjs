#!/usr/bin/env node
// Check a discovery file (the input of scripts/import-curated-events.mjs) against the live pages:
// every candidate's verbatim `dateQuote` must stand on its `sourceUrl`.
//
//   node scripts/import-scrape/verify.mjs zuerich.json [--out zuerich.verified.json] [--keep-unreachable]
//
// Writes the candidates that passed (and, with --keep-unreachable, those whose page could not be
// read because of robots.txt / 403 / errors: they then need a manual look) and prints a report.
// Each distinct page is fetched once, politely (robots.txt, 6 s per host).
import { readFileSync, writeFileSync } from 'node:fs';
import { politeFetch } from './polite-fetch.mjs';
import {
  htmlToText,
  icsHasEvent,
  parseIcsEvents,
  quoteOnPage,
} from '../../src/utils/importScrape.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : null;
const keepUnreachable = args.includes('--keep-unreachable');
if (!file) {
  console.error(
    'Usage: node scripts/import-scrape/verify.mjs <discovery.json> [--out <file>] [--keep-unreachable]'
  );
  process.exit(2);
}

const data = JSON.parse(readFileSync(file, 'utf8'));
const pages = new Map();
const blockedHosts = new Set();

async function pageText(url) {
  if (pages.has(url)) return pages.get(url);
  const host = new URL(url).host;
  let result;
  if (blockedHosts.has(host)) {
    result = { ok: false, reason: 'host-stopped' };
  } else {
    const r = await politeFetch(url);
    if (r.reason === 'forbidden' || r.reason === 'rate-limited') blockedHosts.add(host); // stop at 403/429
    if (!r.ok) {
      result = { ok: false, reason: r.reason };
    } else if (/text\/calendar/i.test(r.contentType) || /^BEGIN:VCALENDAR/m.test(r.body)) {
      result = { ok: true, ics: parseIcsEvents(r.body), text: '' };
    } else {
      result = { ok: true, text: htmlToText(r.body) };
    }
  }
  pages.set(url, result);
  return result;
}

const stats = { verified: 0, failed: 0, unreachable: 0 };
const kept = [];
for (const c of data.candidates) {
  const page = await pageText(c.sourceUrl);
  let verdict;
  if (!page.ok) {
    verdict = `UNREACHABLE (${page.reason})`;
    stats.unreachable += 1;
    if (keepUnreachable) kept.push(c);
  } else {
    // An iCal feed has no prose: the event is there when a VEVENT has this date and a similar title.
    const q = page.ics ? icsHasEvent(c, page.ics) : quoteOnPage(c.dateQuote, page.text);
    if (q.ok) {
      verdict = `ok (${q.how})`;
      stats.verified += 1;
      kept.push(c);
    } else {
      verdict = `NOT ON PAGE (${q.how})`;
      stats.failed += 1;
    }
  }
  console.log(`${verdict.padEnd(26)} ${c.date} ${String(c.title).slice(0, 55)}  <${c.sourceUrl}>`);
}
console.log(
  `\n${file}: ${stats.verified} verified, ${stats.failed} not on page, ${stats.unreachable} unreachable of ${data.candidates.length}`
);
if (out) {
  writeFileSync(out, JSON.stringify({ ...data, candidates: kept }, null, 2) + '\n');
  console.log(`written: ${out} (${kept.length} candidates)`);
}
