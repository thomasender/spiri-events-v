// Polite page fetch for the manual event scraping (skill "scrape-import-events", docs/event-import.md).
// Rules from the legal research (Trello ticket 0): robots.txt first, an identifiable User-Agent,
// at least 6 s between two requests to the same host (also across runs: the last request time per
// host is kept in the temp dir), no login, no circumvention, stop at 403, back off at 429.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MIN_HOST_INTERVAL_MS,
  buildUserAgent,
  isPathAllowed,
  parseRobots,
} from '../../src/utils/importScrape.js';

const STATE_DIR = join(tmpdir(), 'tribe-scrape');
const STATE_FILE = join(STATE_DIR, 'hosts.json');
const TIMEOUT_MS = 20000;
const MAX_BYTES = 3 * 1024 * 1024;
const robotsCache = new Map();
// Generic by default; the contact address is only sent when the person running this sets SCRAPE_CONTACT.
const USER_AGENT = buildUserAgent(process.env.SCRAPE_CONTACT);

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHost(host, extraMs = 0) {
  const state = readState();
  const last = state[host] ?? 0;
  const wait = last + Math.max(MIN_HOST_INTERVAL_MS, extraMs) - Date.now();
  if (wait > 0) await sleep(wait);
  state[host] = Date.now();
  writeState(state);
}

async function rawGet(url, host, extraMs) {
  await waitForHost(host, extraMs);
  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,text/calendar,application/xhtml+xml,*/*;q=0.5',
      'accept-language': 'de-AT,de;q=0.9,en;q=0.6',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { res, body: buf.subarray(0, MAX_BYTES).toString('utf8') };
}

async function robotsFor(origin, host) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let robots = { rules: [], crawlDelayMs: 0 };
  try {
    const { res, body } = await rawGet(`${origin}/robots.txt`, host, 0);
    if (res.ok) robots = parseRobots(body);
  } catch {
    /* no robots.txt reachable: nothing forbidden */
  }
  robotsCache.set(origin, robots);
  return robots;
}

/**
 * GET a page politely. Returns { ok, status, url, contentType, body, reason }.
 * reason: 'robots' (disallowed, nothing requested), 'forbidden' (403: do not try again),
 * 'rate-limited' (429), 'http-<status>', 'error'.
 */
export async function politeFetch(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, status: 0, url, reason: 'bad-url' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:')
    return { ok: false, status: 0, url, reason: 'bad-url' };
  const robots = await robotsFor(u.origin, u.host);
  if (!isPathAllowed(robots, u.pathname + u.search))
    return { ok: false, status: 0, url, reason: 'robots' };
  try {
    const { res, body } = await rawGet(u.href, u.host, robots.crawlDelayMs);
    const contentType = res.headers.get('content-type') ?? '';
    if (res.status === 403)
      return { ok: false, status: 403, url, reason: 'forbidden', contentType };
    if (res.status === 429)
      return { ok: false, status: 429, url, reason: 'rate-limited', contentType };
    if (!res.ok)
      return { ok: false, status: res.status, url, reason: `http-${res.status}`, contentType };
    return { ok: true, status: res.status, url: res.url, contentType, body };
  } catch (err) {
    return { ok: false, status: 0, url, reason: 'error', error: String(err?.message ?? err) };
  }
}
