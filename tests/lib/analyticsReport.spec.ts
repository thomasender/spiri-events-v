import { describe, it, expect } from 'vitest';
import {
  ACTION_EVENTS,
  buildReport,
  buildRequests,
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

  // aHgp2jzl: "App-Installationen" counts real installs, not popup views/clicks.
  it('reports real app installs and not install-prompt views', () => {
    expect(ACTION_EVENTS).toContain('pwa_install');
    expect(ACTION_EVENTS).not.toContain('pwa_install_prompt');
  });
});
