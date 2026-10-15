// Pure helpers for the admin "Statistik" tab: build the Google Analytics Data API
// requests and turn the raw responses into the small, flat report the UI draws.
// No Firebase imports here so it can be unit-tested without the emulator.

import { COMBINED_VIEWS, REGION_IDS } from './regions';

/** GA4 custom dimension (event scope, parameter `region`) the per-region numbers rely on. */
export const REGION_DIMENSION = 'customEvent:region';

export const ALLOWED_RANGES = [7, 30] as const;
export type RangeDays = (typeof ALLOWED_RANGES)[number];

/** Events the "Aktionen" block shows, in display order. */
export const ACTION_EVENTS = [
  'select_content',
  'favorite_add',
  'share',
  'outbound_click',
  'donate_click',
  'donate_complete',
  'sign_up',
  'event_create_start',
  'event_create_submit',
  'pwa_install_prompt',
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
  /** Per-region comparison; only present when GA has region data and no region filter is set. */
  regions?: { name: string; users: number; pageViews: number; sessions: number }[];
  /** Echo of the region filter (only when one was requested). */
  region?: string;
  /** The GA custom dimension `region` is not registered (yet), see AGENTS.md. */
  regionDimension?: 'unavailable';
}

export interface RawReports {
  totals: GaResponse;
  daily: GaResponse;
  pages: GaResponse;
  channels: GaResponse;
  devices: GaResponse;
  actions: GaResponse;
  /** Optional; rows of buildRegionsRequest(). */
  regions?: GaResponse;
}

export function parseRange(value: unknown): RangeDays {
  const n = Number(value);
  return (ALLOWED_RANGES as readonly number[]).includes(n) ? (n as RangeDays) : 7;
}

/**
 * Optional `region` argument of the callable: a region id or a combined-view
 * slug (exact slug, see AGENTS.md). Absent or unknown = null = all regions.
 */
export function parseRegion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ok = REGION_IDS.includes(value) || COMBINED_VIEWS.some((v) => v.slug === value);
  return ok ? value : null;
}

/** GA answers 400 "Field customEvent:region is not a valid dimension" until the dimension is registered. */
export function isUnknownRegionDimensionError(message: string): boolean {
  return /\b400\b/.test(message) && /customEvent:region/i.test(message);
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

  const regionRows = (raw.regions?.rows ?? [])
    .map((r) => ({
      name: dim(r),
      users: met(r, 0),
      pageViews: met(r, 1),
      sessions: met(r, 2),
    }))
    .filter((r) => r.name && r.name !== '(not set)')
    .sort((a, b) => b.pageViews - a.pageViews || a.name.localeCompare(b.name));

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
    ...(regionRows.length ? { regions: regionRows } : {}),
  };
}

/** Empty report for a region filter whose custom dimension GA does not know yet. */
export function buildUnavailableReport(
  rangeDays: RangeDays,
  region: string | null,
  now = new Date()
): AnalyticsReport {
  const empty: RawReports = {
    totals: {},
    daily: {},
    pages: {},
    channels: {},
    devices: {},
    actions: {},
  };
  return {
    ...buildReport(empty, rangeDays, now),
    ...(region ? { region } : {}),
    regionDimension: 'unavailable',
  };
}

/** The runReport body that compares regions; only requested without a region filter. */
export function buildRegionsRequest(rangeDays: RangeDays) {
  return {
    dateRanges: [{ startDate: `${rangeDays - 1}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: REGION_DIMENSION }],
    metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 50,
  };
}

/**
 * The six runReport bodies for a range (end date is "today", GA's own timezone).
 * With `region` every body also filters on the custom dimension (EXACT match on
 * the slug; a combined-view slug matches only events sent with that slug).
 */
export function buildRequests(rangeDays: RangeDays, region: string | null = null) {
  const dateRanges = [{ startDate: `${rangeDays - 1}daysAgo`, endDate: 'today' }];
  const regionFilter = region
    ? {
        filter: {
          fieldName: REGION_DIMENSION,
          stringFilter: { matchType: 'EXACT', value: region },
        },
      }
    : null;
  const withRegion = <T extends object>(body: T) =>
    regionFilter ? { ...body, dimensionFilter: regionFilter } : body;
  const requests = {
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
  if (!regionFilter) return requests;
  return {
    totals: withRegion(requests.totals),
    daily: withRegion(requests.daily),
    pages: withRegion(requests.pages),
    channels: withRegion(requests.channels),
    devices: withRegion(requests.devices),
    actions: {
      ...requests.actions,
      dimensionFilter: {
        andGroup: { expressions: [requests.actions.dimensionFilter, regionFilter] },
      },
    },
  };
}
