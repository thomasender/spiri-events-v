import { describe, it, expect } from 'vitest';
import {
  ACTION_EVENTS,
  buildReport,
  buildEventRequests,
  buildRequests,
  buildTopEvents,
  cleanTitle,
  DIRECT_LABEL,
  EVENT_PAGE_ACTIONS,
  eventSlugFromPath,
  referrerLabel,
  sourceLabel,
  type RawEventReports,
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

describe('top events helpers', () => {
  it('eventSlugFromPath only accepts event pages and normalises the slug', () => {
    expect(eventSlugFromPath('/event/morgen-yoga')).toBe('morgen-yoga');
    expect(eventSlugFromPath('/event/Morgen-Yoga/')).toBe('morgen-yoga');
    expect(eventSlugFromPath('/event/kakao%C3%A9')).toBe('kakaoé');
    expect(eventSlugFromPath('/event/')).toBeNull();
    expect(eventSlugFromPath('/event/a/b')).toBeNull();
    expect(eventSlugFromPath('/verzeichnis')).toBeNull();
    expect(eventSlugFromPath('')).toBeNull();
  });

  it('sourceLabel names the common sources and falls back to the host', () => {
    expect(sourceLabel('(direct)')).toBe(DIRECT_LABEL);
    expect(sourceLabel('')).toBe(DIRECT_LABEL);
    expect(sourceLabel('l.instagram.com')).toBe('Instagram');
    expect(sourceLabel('m.facebook.com')).toBe('Facebook');
    expect(sourceLabel('google')).toBe('Google');
    expect(sourceLabel('www.google.at')).toBe('Google');
    expect(sourceLabel('www.yogaschule.at')).toBe('yogaschule.at');
    expect(sourceLabel('www.thetribe.at')).toBe('tribe Webseite');
  });

  it('referrerLabel names internal pages and external sites', () => {
    expect(referrerLabel('')).toBe(DIRECT_LABEL);
    expect(referrerLabel('https://www.thetribe.at/')).toBe('Kalender (Startseite)');
    expect(referrerLabel('https://www.thetribe.at/verzeichnis?q=x')).toBe('Verzeichnis');
    expect(referrerLabel('https://thetribe.at/favoriten')).toBe('Favoriten');
    expect(referrerLabel('https://www.thetribe.at/event/other')).toBe('Andere Event-Seite');
    expect(referrerLabel('https://www.thetribe.at/maria-yoga')).toBe(
      'Profil-Seite (Veranstalter:in)'
    );
    expect(referrerLabel('https://www.thetribe.at/impressum')).toBe('Andere Seite auf tribe');
    expect(referrerLabel('https://l.instagram.com/')).toBe('Instagram');
    expect(referrerLabel('https://www.google.com/')).toBe('Google');
  });
});

describe('buildTopEvents', () => {
  const now = new Date('2026-10-19T10:00:00Z');
  const none: RawEventReports = {
    top: {},
    sources: {},
    referrers: {},
    actions: {},
    audience: {},
    cities: {},
  };

  it('returns an empty list for empty GA responses', () => {
    const r = buildTopEvents(none, {}, now);
    expect(r.events).toEqual([]);
    expect(r.rangeDays).toBe(14);
    expect(r.actionsSince).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('ranks event pages by views and keeps only ten', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row([`/event/e${i}`, `E${i} | tribe Vorarlberg`], [i + 1, 1, 10])
    );
    const r = buildTopEvents({ ...none, top: { rows } }, {}, now);
    expect(r.events).toHaveLength(10);
    expect(r.events[0]).toMatchObject({ slug: 'e11', title: 'E11', views: 12 });
    expect(r.events.at(-1)?.slug).toBe('e2');
  });

  it('merges path variants, prefers the Firestore title and computes the details', () => {
    const r = buildTopEvents(
      {
        top: {
          rows: [
            row(['/event/yoga', 'Alter Titel | tribe Vorarlberg'], [6, 4, 200]),
            row(['/event/yoga/', 'Alter Titel | tribe Vorarlberg'], [4, 1, 50]),
            row(['/', 'Kalender'], [99, 50, 900]),
          ],
        },
        sources: {
          rows: [
            row(['/event/yoga', 'l.instagram.com'], [5]),
            row(['/event/yoga', 'instagram.com'], [2]),
            row(['/event/yoga', '(direct)'], [3]),
          ],
        },
        referrers: {
          rows: [
            row(['/event/yoga', 'https://www.thetribe.at/'], [6]),
            row(['/event/yoga', 'https://www.thetribe.at/verzeichnis'], [3]),
            row(['/event/yoga', ''], [1]),
          ],
        },
        actions: {
          rows: [
            row(['/event/yoga', 'organizer_link_click'], [3]),
            row(['/event/yoga/', 'organizer_link_click'], [1]),
            row(['/event/yoga', 'favorite_add'], [2]),
            row(['/event/yoga', 'share'], [1]),
          ],
        },
        audience: {
          rows: [
            row(['/event/yoga', 'mobile', 'new'], [3]),
            row(['/event/yoga', 'desktop', 'returning'], [2]),
            row(['/event/yoga', 'mobile', 'returning'], [1]),
          ],
        },
        cities: {
          rows: [row(['/event/yoga', 'Dornbirn'], [3]), row(['/event/yoga', '(not set)'], [1])],
        },
      },
      { yoga: 'Yoga im Park' },
      now
    );
    expect(r.events).toHaveLength(1);
    const e = r.events[0];
    expect(e).toMatchObject({
      slug: 'yoga',
      title: 'Yoga im Park',
      views: 10,
      users: 5,
      avgEngagementSec: 50,
      organizerClicks: 4,
      favorites: 2,
      shares: 1,
      calendarAdds: 0,
      newUsers: 3,
      returningUsers: 3,
    });
    expect(e.sources).toEqual([
      { label: 'Instagram', count: 7 },
      { label: DIRECT_LABEL, count: 3 },
    ]);
    expect(e.referrers[0]).toEqual({ label: 'Kalender (Startseite)', count: 6 });
    expect(e.referrers.map((x) => x.label)).toContain('Verzeichnis');
    expect(e.cities).toEqual([
      { label: 'Dornbirn', count: 3 },
      { label: 'Unbekannt', count: 1 },
    ]);
    expect(e.devices).toEqual([
      { label: 'mobile', count: 4 },
      { label: 'desktop', count: 2 },
    ]);
  });

  it('falls back to the GA page title, then to the slug', () => {
    const r = buildTopEvents(
      {
        ...none,
        top: {
          rows: [
            row(['/event/a', 'Kakao | tribe Vorarlberg'], [3, 1, 0]),
            row(['/event/b', ''], [2, 0, 0]),
          ],
        },
      },
      {},
      now
    );
    expect(r.events.map((e) => e.title)).toEqual(['Kakao', 'b']);
    expect(r.events[1].avgEngagementSec).toBe(0);
  });
});

describe('buildEventRequests', () => {
  const q = buildEventRequests();

  it('covers the last 14 days including today, event pages only', () => {
    for (const body of Object.values(q)) {
      expect(body.dateRanges[0]).toEqual({ startDate: '13daysAgo', endDate: 'today' });
      expect(body.dimensions[0]).toEqual({ name: 'pagePath' });
    }
    expect(q.top.dimensionFilter.filter.stringFilter).toEqual({
      matchType: 'BEGINS_WITH',
      value: '/event/',
    });
  });

  it('only asks for the event-page actions', () => {
    const [, eventFilter] = q.actions.dimensionFilter.andGroup.expressions;
    expect(eventFilter.filter.inListFilter?.values).toEqual([...EVENT_PAGE_ACTIONS]);
    expect(EVENT_PAGE_ACTIONS).toContain('organizer_link_click');
  });
});
