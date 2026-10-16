// Pure helpers for the admin "E-Mail-Versand" tab: build the Mailgun Metrics API
// request and turn the raw responses into the small, flat report the UI draws.
// No Firebase imports here so it can be unit-tested without the emulator.

export const ALLOWED_RANGES = [7, 30] as const;
export type RangeDays = (typeof ALLOWED_RANGES)[number];

/** Billable messages are the *processed* ones (see Mailgun "Metric Definitions"). */
export const METRICS = ['processed_count', 'delivered_count', 'permanent_failed_count'] as const;

export interface MetricsItem {
  dimensions?: { dimension?: string; value?: string }[];
  metrics?: Record<string, number | undefined>;
}
export interface MetricsResponse {
  items?: MetricsItem[];
  aggregates?: { metrics?: Record<string, number | undefined> };
}
/** `GET /v5/accounts/limit/custom/monthly`; Mailgun answers 404 when no custom limit is set. */
export interface CustomLimitResponse {
  limit?: number;
  current?: number;
  period?: string;
}

export type LimitSource = 'mailgun' | 'config';

export interface MailgunUsageReport {
  rangeDays: RangeDays;
  generatedAt: string;
  totals: { sent: number; delivered: number; failed: number };
  daily: { date: string; sent: number }[];
  month: { sent: number; limit: number | null; limitSource: LimitSource | null };
}

export function parseRange(value: unknown): RangeDays {
  const n = Number(value);
  return (ALLOWED_RANGES as readonly number[]).includes(n) ? (n as RangeDays) : 7;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** First moment of the calendar month (UTC) the given date falls in. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** RFC 2822, which the Metrics API requires for `start` / `end`. */
function rfc2822(d: Date): string {
  return d.toUTCString().replace('GMT', '+0000');
}

export function buildRequests(days: RangeDays, now: Date = new Date()) {
  const rangeStart = new Date(now.getTime() - (days - 1) * 86_400_000);
  rangeStart.setUTCHours(0, 0, 0, 0);
  return {
    range: {
      start: rfc2822(rangeStart),
      end: rfc2822(now),
      resolution: 'day',
      dimensions: ['time'],
      metrics: [...METRICS],
      include_aggregates: true,
    },
    month: {
      start: rfc2822(monthStart(now)),
      end: rfc2822(now),
      resolution: 'month',
      metrics: ['processed_count'],
      include_aggregates: true,
    },
  };
}

function itemDay(item: MetricsItem): string | null {
  const raw = item.dimensions?.find((d) => d.dimension === 'time')?.value;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : isoDay(parsed);
}

/** One entry per day of the range, zero where Mailgun returned nothing. */
export function fillDays(
  days: RangeDays,
  sentByDay: Map<string, number>,
  now: Date = new Date()
): { date: string; sent: number }[] {
  const out: { date: string; sent: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = isoDay(new Date(now.getTime() - i * 86_400_000));
    out.push({ date, sent: sentByDay.get(date) ?? 0 });
  }
  return out;
}

export function buildReport(
  raw: {
    range: MetricsResponse;
    month: MetricsResponse;
    customLimit: CustomLimitResponse | null;
    configuredLimit: number | null;
  },
  days: RangeDays,
  now: Date = new Date()
): MailgunUsageReport {
  const sentByDay = new Map<string, number>();
  for (const item of raw.range.items ?? []) {
    const day = itemDay(item);
    if (day) sentByDay.set(day, (sentByDay.get(day) ?? 0) + num(item.metrics?.processed_count));
  }
  const daily = fillDays(days, sentByDay, now);

  // Prefer the aggregates; fall back to summing the days when Mailgun omits them.
  const agg = raw.range.aggregates?.metrics;
  const totals = {
    sent: agg ? num(agg.processed_count) : daily.reduce((s, d) => s + d.sent, 0),
    delivered: num(agg?.delivered_count),
    failed: num(agg?.permanent_failed_count),
  };

  const monthSent =
    raw.month.aggregates?.metrics?.processed_count !== undefined
      ? num(raw.month.aggregates.metrics.processed_count)
      : (raw.month.items ?? []).reduce((s, i) => s + num(i.metrics?.processed_count), 0);

  // A limit set in Mailgun wins (and carries its own, more exact counter).
  const custom = raw.customLimit;
  const customLimit = custom && num(custom.limit) > 0 ? num(custom.limit) : null;
  const month = customLimit
    ? {
        sent: custom?.current != null ? num(custom.current) : monthSent,
        limit: customLimit,
        limitSource: 'mailgun' as const,
      }
    : raw.configuredLimit
      ? { sent: monthSent, limit: raw.configuredLimit, limitSource: 'config' as const }
      : { sent: monthSent, limit: null, limitSource: null };

  return { rangeDays: days, generatedAt: now.toISOString(), totals, daily, month };
}

/** Example numbers for MAILGUN_DRY_RUN (local / emulator), so the tab renders without credentials. */
export function sampleReport(days: RangeDays, now: Date = new Date()): MailgunUsageReport {
  const daily = fillDays(days, new Map(), now).map((d, i) => ({ ...d, sent: (i * 7) % 23 }));
  const sent = daily.reduce((s, d) => s + d.sent, 0);
  return {
    rangeDays: days,
    generatedAt: now.toISOString(),
    totals: { sent, delivered: Math.max(sent - 2, 0), failed: sent ? 1 : 0 },
    daily,
    month: { sent: 420, limit: 1000, limitSource: 'config' },
  };
}
