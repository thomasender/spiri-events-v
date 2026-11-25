// Pure helpers of the manual event scraping (docs/event-import.md, skill "scrape-import-events"):
// robots.txt rules, HTML -> text, structured event extraction (schema.org JSON-LD, iCal) and the
// check that a candidate's verbatim date quote really stands on the page. No network, no Node APIs,
// so tests/lib/importScrape.spec.ts runs them directly. The fetching itself is
// scripts/import-scrape/fetch.mjs.

/**
 * User-Agent of the scraping tools. A generic client name only; a contact address is added only when
 * the person running the tool sets it themselves (environment variable SCRAPE_CONTACT, read by
 * scripts/import-scrape/polite-fetch.mjs), so no address is sent to a third party by default.
 */
export function buildUserAgent(contact) {
  const c = String(contact ?? '').trim();
  return c
    ? `TribeEventBot/1.0 (manual research; contact: ${c})`
    : 'TribeEventBot/1.0 (manual research)';
}
/** Minimum pause between two requests to the same host. */
export const MIN_HOST_INTERVAL_MS = 6000;
const MAX_CRAWL_DELAY_MS = 30000;

// ── robots.txt ────────────────────────────────────────────────────────

/**
 * Rules of robots.txt for our bot: the most specific group wins (`tribeeventbot`, else `*`).
 * Returns { rules: [{allow, path}], crawlDelayMs }.
 */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'disallow') current.rules.push({ allow: false, path: value });
    else if (key === 'allow') current.rules.push({ allow: true, path: value });
    else if (key === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.delay = n * 1000;
    }
  }
  const specific = groups.find((g) =>
    g.agents.some((a) => a && 'tribeeventbot'.includes(a) && a !== '*')
  );
  const star = groups.find((g) => g.agents.includes('*'));
  const group = specific ?? star ?? { rules: [], delay: null };
  return {
    rules: group.rules.filter((r) => r.path !== ''),
    crawlDelayMs: Math.min(group.delay ?? 0, MAX_CRAWL_DELAY_MS),
  };
}

function ruleMatches(path, pattern) {
  // '*' wildcard and '$' end anchor as in the robots.txt standard
  const re = new RegExp(
    '^' +
      pattern
        .replace(/[.+?^{}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\\\$$/, '$')
  );
  return re.test(path);
}

/** Longest matching rule wins; allow beats disallow on a tie; no rule = allowed. */
export function isPathAllowed(robots, pathWithQuery) {
  let best = null;
  for (const rule of robots.rules) {
    if (!ruleMatches(pathWithQuery, rule.path)) continue;
    if (
      !best ||
      rule.path.length > best.path.length ||
      (rule.path.length === best.path.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

// ── HTML -> text ──────────────────────────────────────────────────────

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  shy: '',
};

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/** Visible text of an HTML page, whitespace collapsed (scripts, styles and comments removed). */
export function htmlToText(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|tr|h[1-6]|br|section|article)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** Lower case, collapsed, no punctuation noise: the form in which quotes are compared. */
export function normalizeForQuote(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[‐-―]/g, '-')
    .replace(/[^\p{L}\p{N}:.\-/ ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Does the page carry the candidate's date quote? Exact (normalised) match first; otherwise at
 * least 80 % of the quote's words (min. 3) must appear in the page text, because pages are
 * summarised and the pilot found quotes to be "nearly verbatim".
 */
export function quoteOnPage(quote, pageText) {
  const q = normalizeForQuote(quote);
  if (!q) return { ok: false, how: 'no-quote' };
  // A date quote of a few characters ("22. Dez") says nothing: it would match any page.
  if (q.length < 12) return { ok: false, how: 'too-short' };
  const page = normalizeForQuote(pageText);
  if (page.includes(q)) return { ok: true, how: 'exact' };
  const words = [...new Set(q.split(' ').filter((w) => w.length > 1))];
  if (words.length < 3) return { ok: false, how: 'too-short' };
  const pageWords = new Set(page.split(' '));
  const hit = words.filter((w) => pageWords.has(w)).length;
  return hit / words.length >= 0.8 ? { ok: true, how: 'words' } : { ok: false, how: 'missing' };
}

// ── structured data ───────────────────────────────────────────────────

function asArray(v) {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function collectEvents(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => collectEvents(n, out));
  const types = asArray(node['@type']);
  if (types.some((t) => /Event$/.test(String(t)))) out.push(node);
  for (const key of ['@graph', 'subEvent', 'event', 'itemListElement', 'item'])
    collectEvents(node[key], out);
}

function text(v) {
  if (v == null) return '';
  if (typeof v === 'string') return decodeEntities(v).trim();
  if (typeof v === 'object') return text(v.name ?? v['@value'] ?? '');
  return String(v);
}

/** schema.org Event objects of a page (JSON-LD), normalised to { title, start, end, place, city, url, description, price, currency }. */
export function extractJsonLdEvents(html) {
  const found = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html ?? '')))) {
    try {
      collectEvents(JSON.parse(m[1].trim()), found);
    } catch {
      /* a broken block is skipped */
    }
  }
  return found.map((e) => {
    const loc = asArray(e.location)[0] ?? {};
    const addr = typeof loc.address === 'object' ? loc.address : {};
    const offer = asArray(e.offers)[0] ?? {};
    return {
      title: text(e.name),
      start: text(e.startDate),
      end: text(e.endDate),
      place:
        text(loc.name) ||
        (typeof loc.address === 'string' ? loc.address : text(addr.streetAddress)),
      city: text(addr.addressLocality),
      url: text(e.url),
      description: text(e.description).slice(0, 2000),
      price: offer.price != null ? String(offer.price) : '',
      currency: text(offer.priceCurrency),
    };
  });
}

function unfoldIcs(s) {
  return String(s ?? '').replace(/\r?\n[ \t]/g, '');
}

function icsValue(v) {
  return String(v ?? '')
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1')
    .trim();
}

/** "20261219T180000" / "20261219" / "…Z" -> { date: '2026-12-19', time: '18:00' | '' }. */
export function parseIcsDate(v) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(String(v ?? '').trim());
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : '' };
}

/** VEVENTs of an iCal feed: { title, start, end, place, url, description, uid }. */
export function parseIcsEvents(ics) {
  const events = [];
  const body = unfoldIcs(ics);
  for (const block of body.split(/BEGIN:VEVENT/i).slice(1)) {
    const part = block.split(/END:VEVENT/i)[0];
    const props = {};
    for (const line of part.split(/\r?\n/)) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const key = line.slice(0, idx).split(';')[0].toUpperCase();
      if (!(key in props)) props[key] = line.slice(idx + 1);
    }
    events.push({
      title: icsValue(props.SUMMARY),
      start: props.DTSTART ?? '',
      end: props.DTEND ?? '',
      place: icsValue(props.LOCATION),
      url: icsValue(props.URL),
      description: icsValue(props.DESCRIPTION).slice(0, 2000),
      uid: icsValue(props.UID),
    });
  }
  return events;
}

/** Events that start today or later (YYYY-MM-DD strings compare as dates). */
export function upcoming(dateIso, today) {
  return (
    typeof dateIso === 'string' &&
    /^\d{4}-\d{2}-\d{2}/.test(dateIso) &&
    dateIso.slice(0, 10) > today
  );
}

/** Does an iCal feed carry this candidate? Same date and at least half of the title words in common. */
export function icsHasEvent(candidate, icsEvents) {
  const words = normalizeForQuote(candidate.title)
    .split(' ')
    .filter((w) => w.length > 2);
  for (const e of icsEvents) {
    if (parseIcsDate(e.start)?.date !== candidate.date) continue;
    const have = new Set(normalizeForQuote(e.title).split(' '));
    const hit = words.filter((w) => have.has(w)).length;
    if (words.length === 0 || hit / words.length >= 0.5) return { ok: true, how: 'ical' };
  }
  return { ok: false, how: 'missing' };
}

// ── images ────────────────────────────────────────────────────────────

function metaContent(html, attr, name) {
  const re = new RegExp(`<meta[^>]*\\b${attr}=["']${name}["'][^>]*>`, 'i');
  const tag = re.exec(String(html ?? ''))?.[0];
  if (!tag) return '';
  return decodeEntities(/\bcontent=["']([^"']*)["']/i.exec(tag)?.[1] ?? '').trim();
}

/**
 * Candidate image URLs of a page, best first: og:image, twitter:image, the JSON-LD `image` of an
 * Event. Relative URLs are resolved against `baseUrl`; only http(s) results are returned. The caller
 * decides which one is allowed (`isImageUrlAllowed`: the organizer's own domain).
 */
export function extractImageUrls(html, baseUrl) {
  const raw = [
    metaContent(html, 'property', 'og:image'),
    metaContent(html, 'property', 'og:image:secure_url'),
    metaContent(html, 'name', 'twitter:image'),
  ];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html ?? '')))) {
    try {
      const found = [];
      collectEvents(JSON.parse(m[1].trim()), found);
      for (const e of found) {
        for (const img of asArray(e.image))
          raw.push(typeof img === 'string' ? img : (img?.url ?? ''));
      }
    } catch {
      /* skipped */
    }
  }
  const out = [];
  for (const r of raw) {
    if (!r) continue;
    try {
      const u = new URL(r, baseUrl);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && !out.includes(u.href))
        out.push(u.href);
    } catch {
      /* not a URL */
    }
  }
  return out;
}
