import { describe, it, expect } from 'vitest';
import {
  ACTION_EVENTS,
  buildReport,
  buildRegionsRequest,
  buildRequests,
  buildUnavailableReport,
  isUnknownRegionDimensionError,
  parseRegion,
  cleanTitle,
  fillDays,
  isoDay,
  parseRange,
  type RawReports,
} from '../../functions/src/analyticsReport';

const row = (dims: string[], mets: (number | string)[]) => ({
  dimensionValues: dims.map((value) => ({ value })),
  metricValues: mets.map((value) => ({ value: String(value) })),
});

const empty: RawReports = {
  totals: {},
  daily: {},
  pages: {},
  channels: {},
  devices: {},
  actions: {},
};

describe('parseRange', () => {
  it('accepts 7 and 30 and falls back to 7', () => {
    expect(parseRange(30)).toBe(30);
    expect(parseRange('7')).toBe(7);
    expect(parseRange(90)).toBe(7);
    expect(parseRange(undefined)).toBe(7);
    expect(parseRange('abc')).toBe(7);
  });
});

describe('helpers', () => {
  it('isoDay converts GA dates', () => {
    expect(isoDay('20261012')).toBe('2026-10-12');
    expect(isoDay('weird')).toBe('weird');
  });

  it('cleanTitle drops the site suffix and never returns empty', () => {
    expect(cleanTitle('Morgen Yoga | tribe Vorarlberg')).toBe('Morgen Yoga');
    expect(cleanTitle('Kalender | tribe Vorarlberg')).toBe('Kalender');
    expect(cleanTitle('')).toBe('(ohne Titel)');
    expect(cleanTitle(' | tribe Vorarlberg')).toBe('(ohne Titel)');
  });

  it('fillDays returns one entry per day, oldest first, zero-filled', () => {
    const today = new Date('2026-10-12T10:00:00Z');
    const days = fillDays([{ date: '2026-10-11', users: 3, pageViews: 9 }], 3, today);
    expect(days.map((d) => d.date)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
    expect(days[0]).toEqual({ date: '2026-10-10', users: 0, pageViews: 0 });
    expect(days[1].pageViews).toBe(9);
  });
});

describe('buildReport', () => {
  const now = new Date('2026-10-12T10:00:00Z');

  it('returns an all-zero report for empty GA responses', () => {
    const r = buildReport(empty, 7, now);
    expect(r.totals).toEqual({ users: 0, newUsers: 0, sessions: 0, pageViews: 0 });
    expect(r.daily).toHaveLength(7);
    expect(r.pages).toEqual([]);
    expect(r.actions).toHaveLength(ACTION_EVENTS.length);
    expect(r.actions.every((a) => a.count === 0)).toBe(true);
  });

  it('maps totals, sorts lists and merges pages with the same title', () => {
    const r = buildReport(
      {
        totals: { rows: [row([], [5, 2, 8, 40])] },
        daily: { rows: [row(['20261012'], [4, 30]), row(['20261011'], [1, 10])] },
        pages: {
          rows: [
            row(['Kalender | tribe Vorarlberg'], [20]),
            row(['Morgen Yoga | tribe Vorarlberg'], [5]),
            row(['Morgen Yoga | tribe Vorarlberg'], [7]),
          ],
        },
        channels: { rows: [row(['Direct'], [2]), row(['Organic Social'], [6])] },
        devices: { rows: [row(['desktop'], [1]), row(['mobile'], [4])] },
        actions: { rows: [row(['favorite_add'], [3]), row(['select_content'], [11])] },
      },
      7,
      now
    );
    expect(r.totals).toEqual({ users: 5, newUsers: 2, sessions: 8, pageViews: 40 });
    expect(r.daily.at(-1)).toEqual({ date: '2026-10-12', users: 4, pageViews: 30 });
    expect(r.pages[0]).toEqual({ title: 'Kalender', views: 20 });
    expect(r.pages[1]).toEqual({ title: 'Morgen Yoga', views: 12 });
    expect(r.channels.map((c) => c.name)).toEqual(['Organic Social', 'Direct']);
    expect(r.devices[0]).toEqual({ name: 'mobile', users: 4 });
    expect(r.actions.find((a) => a.event === 'select_content')?.count).toBe(11);
    expect(r.actions.find((a) => a.event === 'share')?.count).toBe(0);
  });

  it('keeps only the ten most viewed pages', () => {
    const rows = Array.from({ length: 15 }, (_, i) => row([`Seite ${i}`], [i + 1]));
    const r = buildReport({ ...empty, pages: { rows } }, 7, now);
    expect(r.pages).toHaveLength(10);
    expect(r.pages[0].title).toBe('Seite 14');
  });

  it('treats malformed numbers as zero', () => {
    const r = buildReport(
      { ...empty, totals: { rows: [row([], ['x', undefined as never, '', 3])] } },
      7,
      now
    );
    expect(r.totals).toEqual({ users: 0, newUsers: 0, sessions: 0, pageViews: 3 });
  });
});

describe('buildRequests', () => {
  it('uses an inclusive range ending today', () => {
    expect(buildRequests(7).totals.dateRanges[0]).toEqual({
      startDate: '6daysAgo',
      endDate: 'today',
    });
    expect(buildRequests(30).daily.dateRanges[0].startDate).toBe('29daysAgo');
  });

  it('only asks GA for the listed action events', () => {
    const filter = buildRequests(7).actions.dimensionFilter.filter;
    expect(filter.inListFilter.values).toEqual([...ACTION_EVENTS]);
  });
});

describe('parseRegion', () => {
  it('accepts region ids and combined-view slugs, everything else means all', () => {
    expect(parseRegion('steiermark')).toBe('steiermark');
    expect(parseRegion('oesterreich')).toBe('oesterreich');
    expect(parseRegion('alle-tribes')).toBe('alle-tribes');
    expect(parseRegion('narnia')).toBeNull();
    expect(parseRegion('')).toBeNull();
    expect(parseRegion(undefined)).toBeNull();
    expect(parseRegion({ $ne: 1 })).toBeNull();
  });
});

describe('buildRequests with a region', () => {
  const REGION_FILTER = {
    filter: {
      fieldName: 'customEvent:region',
      stringFilter: { matchType: 'EXACT', value: 'steiermark' },
    },
  };

  it('is byte-identical without a region', () => {
    expect(JSON.stringify(buildRequests(7, null))).toBe(JSON.stringify(buildRequests(7)));
    expect(JSON.stringify(buildRequests(7))).not.toContain('customEvent');
  });

  it('adds an EXACT filter to every request', () => {
    const q = buildRequests(7, 'steiermark') as Record<string, Record<string, unknown>>;
    for (const key of ['totals', 'daily', 'pages', 'channels', 'devices']) {
      expect(q[key].dimensionFilter).toEqual(REGION_FILTER);
    }
  });

  it('combines the action filter with the region filter', () => {
    const q = buildRequests(7, 'steiermark');
    const group = (q.actions.dimensionFilter as { andGroup: { expressions: unknown[] } }).andGroup;
    expect(group.expressions).toEqual([buildRequests(7).actions.dimensionFilter, REGION_FILTER]);
  });

  it('builds the regions comparison request', () => {
    const r = buildRegionsRequest(30);
    expect(r.dateRanges[0].startDate).toBe('29daysAgo');
    expect(r.dimensions).toEqual([{ name: 'customEvent:region' }]);
    expect(r.metrics.map((m) => m.name)).toEqual(['activeUsers', 'screenPageViews', 'sessions']);
  });
});

describe('buildReport regions block', () => {
  const now = new Date('2026-10-12T10:00:00Z');

  it('omits regions without data so the output stays as before', () => {
    const plain = buildReport(empty, 7, now);
    expect('regions' in plain).toBe(false);
    expect(buildReport({ ...empty, regions: {} }, 7, now)).toEqual(plain);
    const onlyUnset = { ...empty, regions: { rows: [row(['(not set)'], [1, 2, 3])] } };
    expect('regions' in buildReport(onlyUnset, 7, now)).toBe(false);
  });

  it('lists every region found in the data, busiest first, ignoring (not set)', () => {
    const report = buildReport(
      {
        ...empty,
        regions: {
          rows: [
            row(['(not set)'], [9, 9, 9]),
            row(['vorarlberg'], [10, 50, 20]),
            row(['steiermark'], [4, 80, 6]),
            row(['neue-region'], [1, 2, 1]),
          ],
        },
      },
      7,
      now
    );
    expect(report.regions).toEqual([
      { name: 'steiermark', users: 4, pageViews: 80, sessions: 6 },
      { name: 'vorarlberg', users: 10, pageViews: 50, sessions: 20 },
      { name: 'neue-region', users: 1, pageViews: 2, sessions: 1 },
    ]);
  });
});

describe('missing custom dimension', () => {
  it('recognises the GA error', () => {
    expect(
      isUnknownRegionDimensionError(
        'GA Data API 400: Field customEvent:region is not a valid dimension.'
      )
    ).toBe(true);
    expect(isUnknownRegionDimensionError('GA Data API 403: permission denied')).toBe(false);
    expect(isUnknownRegionDimensionError('GA Data API 400: other field broken')).toBe(false);
  });

  it('builds an empty report flagged as unavailable', () => {
    const r = buildUnavailableReport(7, 'steiermark', new Date('2026-10-12T10:00:00Z'));
    expect(r.regionDimension).toBe('unavailable');
    expect(r.region).toBe('steiermark');
    expect(r.totals).toEqual({ users: 0, newUsers: 0, sessions: 0, pageViews: 0 });
    expect(r.daily).toHaveLength(7);
    expect(r.regions).toBeUndefined();
  });
});
