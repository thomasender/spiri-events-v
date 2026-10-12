#!/usr/bin/env node
// Drives the LIVE site in a real browser and checks what Google Analytics receives.
// Not part of the test suites: it hits production and counts as real (test) traffic.
//
//   node scripts/ga-live-check.mjs                       # default https://thetribe.at
//   node scripts/ga-live-check.mjs --url=https://spirieventsvbg.web.app
//   node scripts/ga-live-check.mjs --no-ga               # skip the GA Data API cross-check
//
// 1. "Ablehnen": nothing may be sent to Google, no _ga cookie.
// 2. "Akzeptieren": page_view / select_content ... must be sent, without PII.
// 3. Cross-check against the GA realtime report (scripts/ga-realtime.mjs).
import { chromium } from '@playwright/test';
import { realtime } from './ga-realtime.mjs';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const BASE = arg('url') || 'https://thetribe.at';
const CHECK_GA = !process.argv.includes('--no-ga');
const GA_HOST = /google-analytics\.com|analytics\.google\.com|googletagmanager\.com/;
// GA drops traffic from known bots, and the default headless UA says "HeadlessChrome".
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const PII = /@|oobcode|token|password/i;

const failures = [];
const counts = (rows) => Object.fromEntries(rows.map((r) => [r.eventName, Number(r.eventCount)]));
let gaBefore = null;
if (CHECK_GA) {
  try {
    gaBefore = counts(await realtime(['eventName']));
  } catch (err) {
    console.log(`SKIP  GA cross-check unavailable: ${err.message}`);
  }
}
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures.push(msg);
};

/** Collects GA hits as { en, params } from /g/collect requests. */
function watch(page) {
  const hits = [];
  const google = [];
  page.on('request', (req) => {
    const url = req.url();
    if (!GA_HOST.test(url)) return;
    google.push(url);
    if (!url.includes('/g/collect')) return;
    const lines = [url.split('?')[1] ?? '', ...(req.postData() ?? '').split('\n')];
    for (const line of lines) {
      if (!line) continue;
      const q = new URLSearchParams(line);
      const en = q.get('en');
      if (!en) continue;
      const params = {};
      for (const [k, v] of q) if (k.startsWith('ep.') || k.startsWith('epn.')) params[k.replace(/^epn?\./, '')] = v;
      params.dl = q.get('dl') ?? undefined;
      hits.push({ en, params });
    }
  });
  return { hits, google };
}

const browser = await chromium.launch();
try {
  // --- 1. Deny -------------------------------------------------------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const { google } = watch(page);
    await page.goto(BASE, { waitUntil: 'load' });
    ok(await page.getByTestId('cookie-consent').isVisible(), 'banner visible on first visit');
    await page.getByTestId('cookie-consent-deny').click();
    await page.goto(`${BASE}/verzeichnis`, { waitUntil: 'load' });
    await page.goto(BASE, { waitUntil: 'load' });
    ok(google.length === 0, `no request to Google after "Ablehnen" (${google.length} seen)`);
    const cookies = (await ctx.cookies()).filter((c) => c.name.startsWith('_ga'));
    ok(cookies.length === 0, 'no _ga cookie after "Ablehnen"');
    ok(!(await page.getByTestId('cookie-consent').isVisible()), 'banner stays closed after reload');
    await ctx.close();
  }

  // --- 2. Accept + trigger events ------------------------------------------
  const marker = Date.now();
  const ctx = await browser.newContext({ userAgent: UA });
  const page = await ctx.newPage();
  const { hits } = watch(page);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.getByTestId('cookie-consent-accept').click();
  await page.waitForTimeout(1500);

  const tile = page.getByTestId('event-tile-date-range').first();
  if (await tile.count()) {
    await tile.click();
    await page.waitForTimeout(1500);
  }
  await page.goto(`${BASE}/verzeichnis`, { waitUntil: 'load' });
  await page.goto(`${BASE}/spenden`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  const names = new Set(hits.map((h) => h.en));
  console.log('events sent:', [...names].join(', ') || '(none)');
  ok(names.has('page_view'), 'page_view sent after "Akzeptieren"');
  ok(names.has('select_content'), 'select_content sent when an event is opened');
  const leaked = hits.filter((h) => PII.test(JSON.stringify(h.params)));
  ok(leaked.length === 0, 'no PII / tokens in any event parameter');
  const withQuery = hits.filter((h) => h.en === 'page_view' && /[?#]/.test(h.params.page_path ?? ''));
  ok(withQuery.length === 0, 'page_view paths carry no query or hash');
  for (const h of hits) console.log('  ', h.en, JSON.stringify(h.params));

  // Revoke via footer: nothing more may be sent.
  await page.waitForTimeout(6000); // let the SDK flush events queued while consent was granted
  const before = hits.length;
  await page.getByTestId('footer-cookie-settings').click();
  await page.getByTestId('cookie-consent-deny').click();
  await page.goto(`${BASE}/ueber-uns`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  for (const h of hits.slice(before)) console.log('   after revoke:', h.en, JSON.stringify(h.params));
  ok(hits.length === before, 'nothing sent after revoking via footer "Cookie-Einstellungen"');
  await ctx.close();

  // --- 3. Cross-check in GA --------------------------------------------------
  if (gaBefore) {
    await new Promise((r) => setTimeout(r, 25000)); // realtime lags a few seconds
    const after = counts(await realtime(['eventName']));
    const sent = {};
    for (const h of hits) sent[h.en] = (sent[h.en] ?? 0) + 1;
    console.log('GA realtime delta (events sent by this run vs. increase in GA):');
    for (const [name, n] of Object.entries(sent)) {
      const delta = (after[name] ?? 0) - (gaBefore[name] ?? 0);
      ok(delta > 0, `GA realtime count for "${name}" increased (+${delta}, sent ${n})`);
    }
  }
  console.log(`(run ${marker})`);
} finally {
  await browser.close();
}
process.exit(failures.length ? 1 : 0);
