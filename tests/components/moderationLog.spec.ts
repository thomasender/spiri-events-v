import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTERS,
  WHO_ALL,
  actorDisplayName,
  buildLogQuerySpec,
  countByAction,
  eventEditPath,
  eventPublicPath,
  formatDuration,
  groupLogByEvent,
  formatLogTime,
  matchesLogSearch,
  nextSort,
  periodRange,
  personOptions,
  querySpecKey,
  sortLogEntries,
} from '../../src/utils/moderationLog';

const NOW = new Date('2026-11-10T12:00:00Z');
const at = (iso: string) => ({ toMillis: () => new Date(iso).getTime() });

const entries = [
  {
    id: 'a',
    action: 'approved',
    eventTitle: 'Yoga am See',
    regionId: 'tirol',
    actorUid: 'm1',
    actorName: 'Mia',
    actorRole: 'RegionModerator',
    byStaff: true,
    at: at('2026-11-09T08:00:00Z'),
  },
  {
    id: 'b',
    action: 'rejected',
    eventTitle: 'Kakao-Zeremonie',
    regionId: 'vorarlberg',
    actorUid: 'a1',
    actorName: 'Peter',
    actorRole: 'Admin',
    byStaff: true,
    reason: 'Doppelt eingetragen',
    at: at('2026-11-10T09:30:00Z'),
  },
  {
    id: 'c',
    action: 'deleted',
    eventTitle: 'Älterer Kreis',
    regionId: 'vorarlberg',
    actorUid: null,
    actorName: null,
    actorRole: 'System',
    byStaff: false,
    at: at('2026-11-01T03:30:00Z'),
  },
];

const regionName = (id: string) => ({ tirol: 'Tirol', vorarlberg: 'Vorarlberg' })[id] ?? id;

describe('buildLogQuerySpec', () => {
  it('defaults: team only, last 30 days, newest first', () => {
    const spec = buildLogQuerySpec(DEFAULT_FILTERS, NOW);
    expect(spec.orderBy).toEqual(['at', 'desc']);
    expect(spec.where[0]).toEqual(['byStaff', '==', true]);
    expect(spec.where[1][0]).toBe('at');
    expect(spec.where[1][1]).toBe('>=');
    expect((spec.where[1][2] as Date).toISOString()).toBe('2026-10-11T12:00:00.000Z');
  });

  it('region, person and action filter on the server; a person replaces the team filter', () => {
    const spec = buildLogQuerySpec(
      { ...DEFAULT_FILTERS, regionId: 'tirol', actorUid: 'm1', action: 'approved', period: 'all' },
      NOW
    );
    expect(spec.where).toEqual([
      ['regionId', '==', 'tirol'],
      ['actorUid', '==', 'm1'],
      ['action', '==', 'approved'],
    ]);
  });

  it('"Alle" drops the team filter', () => {
    const spec = buildLogQuerySpec({ ...DEFAULT_FILTERS, who: WHO_ALL, period: 'all' }, NOW);
    expect(spec.where).toEqual([]);
  });

  it('the key is stable for the same filters and time', () => {
    expect(querySpecKey(buildLogQuerySpec(DEFAULT_FILTERS, NOW))).toBe(
      querySpecKey(buildLogQuerySpec(DEFAULT_FILTERS, new Date(NOW)))
    );
  });
});

describe('periodRange', () => {
  it('custom period includes the whole "bis" day', () => {
    const { start, end } = periodRange(
      { ...DEFAULT_FILTERS, period: 'custom', from: '2026-11-01', to: '2026-11-05' },
      NOW
    );
    expect(start).toEqual(new Date(2026, 10, 1));
    expect(end).toEqual(new Date(2026, 10, 6));
  });

  it('half-open and invalid custom dates', () => {
    expect(periodRange({ ...DEFAULT_FILTERS, period: 'custom', from: '', to: 'x' }, NOW)).toEqual({
      start: null,
      end: null,
    });
    expect(periodRange({ ...DEFAULT_FILTERS, period: 'all' }, NOW)).toEqual({
      start: null,
      end: null,
    });
  });
});

describe('matchesLogSearch', () => {
  it('searches title, person, region, action and reason, ignoring case and accents', () => {
    const opts = { regionName };
    expect(matchesLogSearch(entries[0], 'yoga', opts)).toBe(true);
    expect(matchesLogSearch(entries[0], 'tirol mia', opts)).toBe(true);
    expect(matchesLogSearch(entries[1], 'doppelt', opts)).toBe(true);
    expect(matchesLogSearch(entries[1], 'abgelehnt', opts)).toBe(true);
    expect(matchesLogSearch(entries[2], 'alterer', opts)).toBe(true);
    expect(matchesLogSearch(entries[0], 'kakao', opts)).toBe(false);
    expect(matchesLogSearch(entries[0], '  ', opts)).toBe(true);
  });
});

describe('sortLogEntries', () => {
  it('newest first by default', () => {
    expect(sortLogEntries(entries, { key: 'at', direction: 'desc' }).map((e) => e.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('by region name, person or event', () => {
    const ids = (key: string, direction = 'asc') =>
      sortLogEntries(entries, { key, direction }, { regionName }).map((e) => e.id);
    expect(ids('regionId')).toEqual(['a', 'b', 'c']);
    expect(ids('actor')).toEqual(['a', 'b', 'c']);
    expect(ids('eventTitle')).toEqual(['c', 'b', 'a']);
    expect(ids('action')).toEqual(['b', 'c', 'a']);
  });

  it('does not change the input', () => {
    const copy = [...entries];
    sortLogEntries(entries, { key: 'eventTitle', direction: 'asc' });
    expect(entries).toEqual(copy);
  });
});

describe('small helpers', () => {
  it('nextSort flips the same column, a new text column starts ascending', () => {
    expect(nextSort({ key: 'at', direction: 'desc' }, 'at')).toEqual({
      key: 'at',
      direction: 'asc',
    });
    expect(nextSort({ key: 'at', direction: 'desc' }, 'actor')).toEqual({
      key: 'actor',
      direction: 'asc',
    });
  });

  it('countByAction in filter order', () => {
    expect(countByAction(entries)).toEqual([
      { id: 'approved', label: 'Genehmigt', count: 1 },
      { id: 'rejected', label: 'Abgelehnt', count: 1 },
      { id: 'deleted', label: 'Endgültig gelöscht', count: 1 },
    ]);
  });

  it('personOptions: moderators plus team members seen in the log, sorted', () => {
    expect(
      personOptions(
        [
          { uid: 'm1', displayName: 'Mia M.' },
          { uid: 'm2', email: 'zoe@x.at' },
        ],
        entries
      )
    ).toEqual([
      { uid: 'm1', name: 'Mia M.' },
      { uid: 'a1', name: 'Peter' },
      { uid: 'm2', name: 'zoe@x.at' },
    ]);
  });

  it('actorDisplayName and formatLogTime', () => {
    expect(actorDisplayName(entries[2])).toBe('System (automatisch)');
    expect(actorDisplayName({ actorRole: 'User', actorUid: 'u' })).toBe('Unbekannt');
    expect(formatLogTime(new Date('2026-11-10T09:30:00Z').getTime())).toMatch(
      /10\.11\.2026.*10:30/
    );
  });
});

describe('formatDuration', () => {
  const now = new Date('2026-11-10T12:00:00Z').getTime();
  const ago = (ms: number) => now - ms;
  it('uses minutes, hours and days', () => {
    expect(formatDuration(ago(5 * 60e3), now)).toBe('5 Min.');
    expect(formatDuration(ago(10e3), now)).toBe('1 Min.');
    expect(formatDuration(ago(3 * 3600e3), now)).toBe('3 Std.');
    expect(formatDuration(ago(26 * 3600e3), now)).toBe('1 Tag');
    expect(formatDuration(ago(3.5 * 24 * 3600e3), now)).toBe('3 Tage');
  });
  it('accepts timestamps and handles missing values', () => {
    expect(formatDuration(at('2026-11-07T11:00:00Z'), now)).toBe('3 Tage');
    expect(formatDuration(null, now)).toBe('–');
  });
});

describe('eventPublicPath / eventEditPath', () => {
  const base = { eventId: 'e1', eventSlug: 'yoga', action: 'approved', statusTo: 'approved' };
  it('links published events by slug, falling back to the id', () => {
    expect(eventPublicPath(base)).toBe('/event/yoga');
    expect(eventPublicPath({ ...base, eventSlug: null })).toBe('/event/e1');
  });
  it('has no public page for pending, rejected, trashed or deleted events', () => {
    expect(eventPublicPath({ ...base, action: 'submitted', statusTo: 'pending' })).toBeNull();
    expect(eventPublicPath({ ...base, action: 'rejected', statusTo: 'rejected' })).toBeNull();
    expect(eventPublicPath({ ...base, action: 'trashed', statusTo: 'trashed' })).toBeNull();
    expect(eventPublicPath({ ...base, action: 'deleted', statusTo: null })).toBeNull();
  });
  it('offers the editor except for deleted and trashed events', () => {
    expect(eventEditPath(base)).toBe('/admin/edit/e1');
    expect(eventEditPath({ ...base, action: 'deleted', statusTo: null })).toBeNull();
    expect(eventEditPath({ ...base, action: 'trashed', statusTo: 'trashed' })).toBeNull();
  });
});

describe('groupLogByEvent', () => {
  it('collects first submission, last edit and last approval per event', () => {
    const g = groupLogByEvent([
      { eventId: 'e1', action: 'edited', at: at('2026-11-05T08:00:00Z') },
      { eventId: 'e1', action: 'submitted', at: at('2026-11-03T08:00:00Z') },
      { eventId: 'e1', action: 'edited', at: at('2026-11-07T08:00:00Z') },
      { eventId: 'e1', action: 'approved', at: at('2026-11-08T08:00:00Z') },
      { eventId: 'e2', action: 'rejected', at: at('2026-11-08T08:00:00Z') },
    ]);
    expect(g.e1).toEqual({
      submittedAt: new Date('2026-11-03T08:00:00Z').getTime(),
      editedAt: new Date('2026-11-07T08:00:00Z').getTime(),
      approvedAt: new Date('2026-11-08T08:00:00Z').getTime(),
    });
    expect(g.e2).toEqual({ submittedAt: null, editedAt: null, approvedAt: null });
  });
});
