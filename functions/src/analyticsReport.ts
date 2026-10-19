// Pure helpers for the admin "Statistik" tab: build the Google Analytics Data API
// requests and turn the raw responses into the small, flat report the UI draws.
// No Firebase imports here so it can be unit-tested without the emulator.

export const ALLOWED_RANGES = [7, 30] as const;
export type RangeDays = (typeof ALLOWED_RANGES)[number];

/** Events the "Aktionen" block shows, in display order. */
export const ACTION_EVENTS = [
  'select_content',
  'favorite_add',
  'share',
  'outbound_click',
  'organizer_link_click',
  'calendar_add',
  'donate_click',
  'donate_complete',
  'sign_up',
  'event_create_start',
  'event_create_submit',
  // Real installs only (browser `appinstalled`). `pwa_install_prompt` is sent
  // for every popup view/click, so it must not be shown as installs.
  'pwa_install',
] as const;

export interface GaRow {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
}
export interface GaResponse {
  rows?: GaRow[];
}

export interface AnalyticsReport {
  rangeDays: RangeDays;
  generatedAt: string;
  totals: { users: number; newUsers: number; sessions: number; pageViews: number };
  daily: { date: string; users: number; pageViews: number }[];
  pages: { title: string; views: number }[];
  channels: { name: string; sessions: number }[];
  devices: { name: string; users: number }[];
  actions: { event: string; count: number }[];
}

export interface RawReports {
  totals: GaResponse;
  daily: GaResponse;
  pages: GaResponse;
  channels: GaResponse;
  devices: GaResponse;
  actions: GaResponse;
}

export function parseRange(value: unknown): RangeDays {
  const n = Number(value);
  return (ALLOWED_RANGES as readonly number[]).includes(n) ? (n as RangeDays) : 7;
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function dim(row: GaRow, i = 0): string {
  return row.dimensionValues?.[i]?.value ?? '';
}

function met(row: GaRow, i = 0): number {
  return num(row.metricValues?.[i]?.value);
}

/** GA sends dates as YYYYMMDD; the UI wants an ISO day. */
export function isoDay(ga: string): string {
  return /^\d{8}$/.test(ga) ? `${ga.slice(0, 4)}-${ga.slice(4, 6)}-${ga.slice(6, 8)}` : ga;
}

/** Strips the site suffix so "Morgen Yoga | tribe Vorarlberg" reads "Morgen Yoga". */
export function cleanTitle(title: string): string {
  const t = title.replace(/\s*\|\s*tribe Vorarlberg\s*$/i, '').trim();
  return t || '(ohne Titel)';
}

/** One entry per day of the range, zero-filled, so the chart has no gaps. */
export function fillDays(
  rows: { date: string; users: number; pageViews: number }[],
  rangeDays: number,
  today: Date
) {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: { date: string; users: number; pageViews: number }[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)
    );
    const date = d.toISOString().slice(0, 10);
    out.push(byDate.get(date) ?? { date, users: 0, pageViews: 0 });
  }
  return out;
}

export function buildReport(
  raw: RawReports,
  rangeDays: RangeDays,
  now = new Date()
): AnalyticsReport {
  const t = raw.totals.rows?.[0];
  const dailyRows = (raw.daily.rows ?? []).map((r) => ({
    date: isoDay(dim(r)),
    users: met(r, 0),
    pageViews: met(r, 1),
  }));

  // Pages with the same cleaned title (e.g. a recurring event) are summed.
  const pageTotals = new Map<string, number>();
  for (const r of raw.pages.rows ?? []) {
    const title = cleanTitle(dim(r));
    pageTotals.set(title, (pageTotals.get(title) ?? 0) + met(r));
  }

  const actionCounts = new Map<string, number>();
  for (const r of raw.actions.rows ?? []) actionCounts.set(dim(r), met(r));

  return {
    rangeDays,
    generatedAt: now.toISOString(),
    totals: {
      users: t ? met(t, 0) : 0,
      newUsers: t ? met(t, 1) : 0,
      sessions: t ? met(t, 2) : 0,
      pageViews: t ? met(t, 3) : 0,
    },
    daily: fillDays(dailyRows, rangeDays, now),
    pages: [...pageTotals]
      .map(([title, views]) => ({ title, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10),
    channels: (raw.channels.rows ?? [])
      .map((r) => ({ name: dim(r) || 'Unbekannt', sessions: met(r) }))
      .sort((a, b) => b.sessions - a.sessions),
    devices: (raw.devices.rows ?? [])
      .map((r) => ({ name: dim(r) || 'unbekannt', users: met(r) }))
      .sort((a, b) => b.users - a.users),
    actions: ACTION_EVENTS.map((event) => ({ event, count: actionCounts.get(event) ?? 0 })),
  };
}

/** The six runReport bodies for a range (end date is "today", GA's own timezone). */
export function buildRequests(rangeDays: RangeDays) {
  const dateRanges = [{ startDate: `${rangeDays - 1}daysAgo`, endDate: 'today' }];
  return {
    totals: {
      dateRanges,
      metrics: [
        { name: 'activeUsers' },
        { name: 'newUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
      ],
    },
    daily: {
      dateRanges,
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    },
    pages: {
      dateRanges,
      dimensions: [{ name: 'pageTitle' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 40,
    },
    channels: {
      dateRanges,
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
    },
    devices: {
      dateRanges,
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'activeUsers' }],
    },
    actions: {
      dateRanges,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: [...ACTION_EVENTS] },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// "Top 10 Events" block: the most viewed event pages of the last 14 days with
// per-event details (sources, previous page, engagement, organizer link clicks).
// ---------------------------------------------------------------------------

export const TOP_EVENTS_DAYS = 14;
export const TOP_EVENTS_LIMIT = 10;
const TOP_LIST_LIMIT = 5;

/** Event-page actions counted per event (all sent from the event detail page). */
export const EVENT_PAGE_ACTIONS = [
  'organizer_link_click',
  'favorite_add',
  'share',
  'calendar_add',
] as const;

/**
 * First day the client sends `organizer_link_click` and `calendar_add`. Earlier
 * clicks were not recorded per event, so the UI says "gezählt seit …".
 */
export const EVENT_ACTIONS_SINCE = '2026-10-19';

/** Hostnames of this site; a referrer from one of them is an internal page. */
export const OWN_HOSTS = [
  'www.thetribe.at',
  'thetribe.at',
  'spirieventsvbg.web.app',
  'spirieventsvbg.firebaseapp.com',
  'localhost',
];

export const DIRECT_LABEL = 'Direkt (Link, App, Lesezeichen)';

export interface LabelCount {
  label: string;
  count: number;
}

export interface TopEvent {
  slug: string;
  title: string;
  views: number;
  users: number;
  /** Average engagement time per visitor, in seconds. */
  avgEngagementSec: number;
  organizerClicks: number;
  favorites: number;
  shares: number;
  calendarAdds: number;
  newUsers: number;
  returningUsers: number;
  /** Page views by session source (Instagram, Google, Direkt …). */
  sources: LabelCount[];
  /** Page views by the page the visitor came from. */
  referrers: LabelCount[];
  /** Visitors by city. */
  cities: LabelCount[];
  /** Visitors by device category (mobile/desktop/tablet). */
  devices: LabelCount[];
}

export interface TopEventsReport {
  rangeDays: number;
  generatedAt: string;
  actionsSince: string;
  events: TopEvent[];
}

export interface RawEventReports {
  top: GaResponse;
  sources: GaResponse;
  referrers: GaResponse;
  actions: GaResponse;
  audience: GaResponse;
  cities: GaResponse;
}

/** "/event/morgen-yoga/" -> "morgen-yoga"; anything that is not an event page -> null. */
export function eventSlugFromPath(path: string): string | null {
  const m = /^\/event\/([^/?#]+)\/?$/.exec(String(path ?? '').trim());
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return m[1].toLowerCase();
  }
}

const SOURCE_NAMES: [RegExp, string][] = [
  [/(^|\.)instagram\.com$|^instagram$|^ig$/, 'Instagram'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$|^facebook$|^fb$/, 'Facebook'],
  [/(^|\.)whatsapp\.(com|net)$|^whatsapp$/, 'WhatsApp'],
  [/(^|\.)t\.me$|(^|\.)telegram\.(org|me)$|^telegram$/, 'Telegram'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$|^linkedin$/, 'LinkedIn'],
  [/^t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, 'X / Twitter'],
  [/(^|\.)google\.[a-z.]+$|^google$/, 'Google'],
  [/(^|\.)bing\.com$|^bing$/, 'Bing'],
  [/(^|\.)ecosia\.org$|^ecosia$/, 'Ecosia'],
  [/(^|\.)duckduckgo\.com$|^duckduckgo$/, 'DuckDuckGo'],
];

/** Readable name for a GA session source or referrer hostname. */
export function sourceLabel(source: string): string {
  const s = String(source ?? '')
    .trim()
    .toLowerCase();
  if (!s || s === '(direct)' || s === '(not set)' || s === '(none)') return DIRECT_LABEL;
  if (OWN_HOSTS.includes(s)) return 'tribe Webseite';
  for (const [re, name] of SOURCE_NAMES) if (re.test(s)) return name;
  return s.replace(/^www\./, '');
}

const INTERNAL_PAGES: Record<string, string> = {
  '': 'Kalender (Startseite)',
  calendar: 'Kalender (Startseite)',
  verzeichnis: 'Verzeichnis',
  favoriten: 'Favoriten',
  'ueber-uns': 'Über uns',
  spenden: 'Spenden',
};
const OTHER_INTERNAL = new Set([
  'profil',
  'admin',
  'login',
  'auth-action',
  'datenschutz',
  'impressum',
]);

/** Readable name for the page a visitor came from (GA `pageReferrer`). */
export function referrerLabel(referrer: string): string {
  const raw = String(referrer ?? '').trim();
  if (!raw || raw === '(not set)') return DIRECT_LABEL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return sourceLabel(raw);
  }
  const host = url.hostname.toLowerCase();
  if (!OWN_HOSTS.includes(host)) return sourceLabel(host);
  const parts = url.pathname.split('/').filter(Boolean);
  const first = (parts[0] ?? '').toLowerCase();
  if (first in INTERNAL_PAGES) return INTERNAL_PAGES[first];
  if (first === 'event') return 'Andere Event-Seite';
  if (OTHER_INTERNAL.has(first)) return 'Andere Seite auf tribe';
  return parts.length === 1 ? 'Profil-Seite (Veranstalter:in)' : 'Andere Seite auf tribe';
}

function addTo(map: Map<string, Map<string, number>>, slug: string, key: string, n: number) {
  let inner = map.get(slug);
  if (!inner) map.set(slug, (inner = new Map()));
  inner.set(key, (inner.get(key) ?? 0) + n);
}

function topList(inner: Map<string, number> | undefined, limit = TOP_LIST_LIMIT): LabelCount[] {
  return [...(inner ?? [])]
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** Groups the rows of a pagePath-first report by event slug and a label of the rest. */
function groupBySlug(res: GaResponse, label: (row: GaRow) => string, metric = 0) {
  const out = new Map<string, Map<string, number>>();
  for (const r of res.rows ?? []) {
    const slug = eventSlugFromPath(dim(r, 0));
    if (!slug) continue;
    addTo(out, slug, label(r), met(r, metric));
  }
  return out;
}

/**
 * Turns the six GA responses into the top-10 list. `titles` maps slug -> event
 * title from Firestore; without an entry the most viewed GA page title is used.
 */
export function buildTopEvents(
  raw: RawEventReports,
  titles: Record<string, string> = {},
  now = new Date()
): TopEventsReport {
  const base = new Map<
    string,
    { views: number; users: number; engagement: number; titles: Map<string, number> }
  >();
  for (const r of raw.top.rows ?? []) {
    const slug = eventSlugFromPath(dim(r, 0));
    if (!slug) continue;
    const entry = base.get(slug) ?? { views: 0, users: 0, engagement: 0, titles: new Map() };
    const views = met(r, 0);
    entry.views += views;
    entry.users += met(r, 1);
    entry.engagement += met(r, 2);
    const t = dim(r, 1);
    if (t && t !== '(not set)') entry.titles.set(t, (entry.titles.get(t) ?? 0) + views);
    base.set(slug, entry);
  }

  const ranked = [...base]
    .filter(([, e]) => e.views > 0)
    .sort((a, b) => b[1].views - a[1].views || a[0].localeCompare(b[0]))
    .slice(0, TOP_EVENTS_LIMIT);

  const sources = groupBySlug(raw.sources, (r) => sourceLabel(dim(r, 1)));
  const referrers = groupBySlug(raw.referrers, (r) => referrerLabel(dim(r, 1)));
  const cities = groupBySlug(raw.cities, (r) => {
    const c = dim(r, 1);
    return !c || c === '(not set)' ? 'Unbekannt' : c;
  });
  const actions = groupBySlug(raw.actions, (r) => dim(r, 1));
  const devices = groupBySlug(raw.audience, (r) => dim(r, 1) || 'unbekannt');
  const visitorType = groupBySlug(raw.audience, (r) => dim(r, 2));

  const events = ranked.map(([slug, e]): TopEvent => {
    const gaTitle = [...e.titles].sort((a, b) => b[1] - a[1])[0]?.[0];
    const a = actions.get(slug);
    const vt = visitorType.get(slug);
    return {
      slug,
      title: titles[slug] || (gaTitle ? cleanTitle(gaTitle) : slug),
      views: e.views,
      users: e.users,
      avgEngagementSec: e.users > 0 ? Math.round(e.engagement / e.users) : 0,
      organizerClicks: a?.get('organizer_link_click') ?? 0,
      favorites: a?.get('favorite_add') ?? 0,
      shares: a?.get('share') ?? 0,
      calendarAdds: a?.get('calendar_add') ?? 0,
      newUsers: vt?.get('new') ?? 0,
      returningUsers: vt?.get('returning') ?? 0,
      sources: topList(sources.get(slug)),
      referrers: topList(referrers.get(slug)),
      cities: topList(cities.get(slug)),
      devices: topList(devices.get(slug)),
    };
  });

  return {
    rangeDays: TOP_EVENTS_DAYS,
    generatedAt: now.toISOString(),
    actionsSince: EVENT_ACTIONS_SINCE,
    events,
  };
}

/**
 * The six runReport bodies for the event block, in two groups of three so they
 * fit GA's batchRunReports (max. 5 per batch) and cost two HTTP round trips.
 */
export function buildEventRequests() {
  const dateRanges = [{ startDate: `${TOP_EVENTS_DAYS - 1}daysAgo`, endDate: 'today' }];
  const eventPages = {
    filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/event/' } },
  };
  const limit = 10000;
  const byPath = (second: string, metric: string) => ({
    dateRanges,
    dimensions: [{ name: 'pagePath' }, { name: second }],
    metrics: [{ name: metric }],
    dimensionFilter: eventPages,
    limit,
  });
  return {
    top: {
      dateRanges,
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'activeUsers' },
        { name: 'userEngagementDuration' },
      ],
      dimensionFilter: eventPages,
      limit,
    },
    sources: byPath('sessionSource', 'screenPageViews'),
    referrers: byPath('pageReferrer', 'screenPageViews'),
    actions: {
      dateRanges,
      dimensions: [{ name: 'pagePath' }, { name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            eventPages,
            {
              filter: {
                fieldName: 'eventName',
                inListFilter: { values: [...EVENT_PAGE_ACTIONS] },
              },
            },
          ],
        },
      },
      limit,
    },
    audience: {
      dateRanges,
      dimensions: [{ name: 'pagePath' }, { name: 'deviceCategory' }, { name: 'newVsReturning' }],
      metrics: [{ name: 'activeUsers' }],
      dimensionFilter: eventPages,
      limit,
    },
    cities: byPath('city', 'activeUsers'),
  };
}
