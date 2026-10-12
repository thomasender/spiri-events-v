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
