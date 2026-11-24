#!/usr/bin/env node
// Fetch one page politely and print what is useful for the event import.
//
//   node scripts/import-scrape/fetch.mjs <url>               text of the page (first 6000 chars)
//   ... --structured                                          schema.org Events (JSON-LD) and iCal VEVENTs
//   ... --full                                                whole text, not cut
//   ... --raw                                                 raw body
//
// Respects robots.txt, waits 6 s per host, identifies itself (see polite-fetch.mjs). Exit codes:
// 0 ok, 2 bad usage, 3 blocked by robots.txt, 4 forbidden/rate limited (stop, do not retry), 5 other error.
import { politeFetch } from './polite-fetch.mjs';
import { extractJsonLdEvents, htmlToText, parseIcsEvents } from '../../src/utils/importScrape.js';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
if (!url) {
  console.error(
    'Usage: node scripts/import-scrape/fetch.mjs <url> [--structured] [--full] [--raw]'
  );
  process.exit(2);
}
const flag = (name) => args.includes(`--${name}`);

const r = await politeFetch(url);
if (!r.ok) {
  console.error(
    `NOT FETCHED (${r.reason}${r.status ? ` ${r.status}` : ''}) ${url}${r.error ? ` – ${r.error}` : ''}`
  );
  process.exit(
    r.reason === 'robots' ? 3 : r.reason === 'forbidden' || r.reason === 'rate-limited' ? 4 : 5
  );
}
console.error(`OK ${r.status} ${r.contentType} ${r.url}`);
if (flag('raw')) {
  console.log(r.body);
} else if (flag('structured')) {
  const isIcs = /text\/calendar/i.test(r.contentType) || /^BEGIN:VCALENDAR/m.test(r.body);
  const events = isIcs ? parseIcsEvents(r.body) : extractJsonLdEvents(r.body);
  console.log(
    JSON.stringify({ kind: isIcs ? 'ical' : 'jsonld', count: events.length, events }, null, 2)
  );
} else {
  const text = htmlToText(r.body);
  console.log(flag('full') ? text : text.slice(0, 6000));
}
