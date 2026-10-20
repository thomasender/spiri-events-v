import { describe, it, expect } from 'vitest';
import {
  buildReport,
  buildRequests,
  fillDays,
  monthStart,
  parseRange,
  sampleReport,
  type MetricsResponse,
} from '../../functions/src/mailgunUsage';

const NOW = new Date('2026-10-16T12:00:00.000Z');
const none: MetricsResponse = {};

const dayItem = (rfc: string, processed: number) => ({
  dimensions: [{ dimension: 'time', value: rfc }],
  metrics: { processed_count: processed },
});

describe('parseRange', () => {
  it('accepts 7 and 30, everything else becomes 7', () => {
    expect(parseRange(30)).toBe(30);
    expect(parseRange('30')).toBe(30);
    expect(parseRange(14)).toBe(7);
    expect(parseRange(undefined)).toBe(7);
  });
});

describe('buildRequests', () => {
  it('queries the range per day and the current calendar month', () => {
    const q = buildRequests(7, NOW);
    expect(q.range.start).toBe('Sat, 10 Oct 2026 00:00:00 +0000');
    expect(q.range.end).toBe('Fri, 16 Oct 2026 12:00:00 +0000');
    expect(q.range.resolution).toBe('day');
    expect(q.range.metrics).toContain('processed_count');
    expect(q.month.start).toBe('Thu, 01 Oct 2026 00:00:00 +0000');
    expect(q.month.resolution).toBe('month');
  });

  it('monthStart is the first of the UTC month', () => {
    expect(monthStart(new Date('2026-12-31T23:59:00Z')).toISOString()).toBe(
      '2026-12-01T00:00:00.000Z'
    );
  });
});

describe('fillDays', () => {
  it('returns one entry per day, oldest first, zero where missing', () => {
    const out = fillDays(3, new Map([['2026-10-15', 4]]), NOW);
    expect(out).toEqual([
      { date: '2026-10-14', sent: 0 },
      { date: '2026-10-15', sent: 4 },
      { date: '2026-10-16', sent: 0 },
    ]);
  });
});

describe('buildReport', () => {
  const range: MetricsResponse = {
    items: [
      dayItem('Wed, 14 Oct 2026 00:00:00 +0000', 5),
      dayItem('Fri, 16 Oct 2026 00:00:00 +0000', 7),
    ],
    aggregates: {
      metrics: { processed_count: 12, delivered_count: 11, permanent_failed_count: 1 },
    },
  };
  const month: MetricsResponse = { aggregates: { metrics: { processed_count: 420 } } };

  it('maps totals and fills the daily series', () => {
    const r = buildReport({ range, month, customLimit: null, configuredLimit: null }, 3, NOW);
    expect(r.totals).toEqual({ sent: 12, delivered: 11, failed: 1 });
    expect(r.daily.map((d) => d.sent)).toEqual([5, 0, 7]);
  });

  it('sums the days when Mailgun sends no aggregates', () => {
    const r = buildReport(
      { range: { items: range.items }, month: none, customLimit: null, configuredLimit: null },
      3,
      NOW
    );
    expect(r.totals.sent).toBe(12);
  });

  it('shows usage only when no limit is known', () => {
    const r = buildReport({ range, month, customLimit: null, configuredLimit: null }, 3, NOW);
    expect(r.month).toEqual({ sent: 420, limit: null, limitSource: null });
  });

  it('uses the configured plan limit with the metrics count', () => {
    const r = buildReport({ range, month, customLimit: null, configuredLimit: 1000 }, 3, NOW);
    expect(r.month).toEqual({ sent: 420, limit: 1000, limitSource: 'config' });
  });

  it('prefers a limit set in Mailgun, including its own counter', () => {
    const r = buildReport(
      {
        range,
        month,
        customLimit: { limit: 500, current: 77, period: '1m' },
        configuredLimit: 1000,
      },
      3,
      NOW
    );
    expect(r.month).toEqual({ sent: 77, limit: 500, limitSource: 'mailgun' });
  });

  it('ignores a custom limit of 0 or garbage', () => {
    const r = buildReport(
      { range, month, customLimit: { limit: 0 }, configuredLimit: 1000 },
      3,
      NOW
    );
    expect(r.month.limitSource).toBe('config');
  });

  it('survives an empty Mailgun answer', () => {
    const r = buildReport(
      { range: none, month: none, customLimit: null, configuredLimit: null },
      7,
      NOW
    );
    expect(r.totals).toEqual({ sent: 0, delivered: 0, failed: 0 });
    expect(r.daily).toHaveLength(7);
    expect(r.month.sent).toBe(0);
  });
});

describe('sampleReport', () => {
  it('has one entry per day and a limit, for the dry-run tab', () => {
    const r = sampleReport(30, NOW);
    expect(r.daily).toHaveLength(30);
    expect(r.month.limit).toBe(1000);
  });
});
