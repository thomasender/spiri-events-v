import { describe, it, expect } from 'vitest';
import { filterDirectoryForRegion, filterEventsForRegion } from '../../src/utils/regions.js';

const ev = (id: string, over: Record<string, unknown> = {}) => ({ id, ...over });
const events = [
  ev('legacy'), // no regionId = Vorarlberg
  ev('vbg', { regionId: 'vorarlberg' }),
  ev('stmk', { regionId: 'steiermark' }),
  ev('online-stmk', { regionId: 'steiermark', isOnline: true }),
  ev('wien', { regionId: 'wien' }),
  ev('online-wien', { regionId: 'wien', isOnline: true }),
];
const ids = (list: { id: string }[]) => list.map((e) => e.id);

describe('filterEventsForRegion', () => {
  const active = ['vorarlberg', 'steiermark'];

  it('shows own-region events plus online events, unmigrated = Vorarlberg', () => {
    expect(
      ids(filterEventsForRegion(events, { regionId: 'vorarlberg', activeRegionIds: active }))
    ).toEqual(['legacy', 'vbg', 'online-stmk']);
    expect(
      ids(filterEventsForRegion(events, { regionId: 'steiermark', activeRegionIds: active }))
    ).toEqual(['stmk', 'online-stmk']);
  });

  it('never shows events of inactive regions, online ones included', () => {
    for (const regionId of ['vorarlberg', 'steiermark']) {
      const result = ids(filterEventsForRegion(events, { regionId, activeRegionIds: active }));
      expect(result).not.toContain('wien');
      expect(result).not.toContain('online-wien');
    }
  });

  it('combined view shows all events of active regions only', () => {
    expect(
      ids(filterEventsForRegion(events, { isNational: true, activeRegionIds: active }))
    ).toEqual(['legacy', 'vbg', 'stmk', 'online-stmk']);
  });

  it('dark launch: only Vorarlberg active keeps the Vorarlberg list', () => {
    expect(ids(filterEventsForRegion(events, { regionId: 'vorarlberg' }))).toEqual([
      'legacy',
      'vbg',
    ]);
  });

  it('tolerates a non-array', () => {
    expect(filterEventsForRegion(undefined as never)).toEqual([]);
  });
});

describe('filterDirectoryForRegion', () => {
  const entries = [
    { uid: 'a' }, // no directoryRegionIds = Vorarlberg
    { uid: 'b', regionIds: ['steiermark'] },
    { uid: 'c', regionIds: ['vorarlberg', 'steiermark'] },
    { uid: 'd', regionIds: ['wien'] },
  ];
  const uids = (list: { uid: string }[]) => list.map((e) => e.uid);
  const active = ['vorarlberg', 'steiermark'];

  it('filters by directoryRegionIds, missing = Vorarlberg', () => {
    expect(
      uids(filterDirectoryForRegion(entries, { regionId: 'vorarlberg', activeRegionIds: active }))
    ).toEqual(['a', 'c']);
    expect(
      uids(filterDirectoryForRegion(entries, { regionId: 'steiermark', activeRegionIds: active }))
    ).toEqual(['b', 'c']);
  });

  it('combined view: listed in at least one active region', () => {
    expect(
      uids(filterDirectoryForRegion(entries, { isNational: true, activeRegionIds: active }))
    ).toEqual(['a', 'b', 'c']);
  });

  it('works on raw docs too', () => {
    const raw = [{ uid: 'x', directoryRegionIds: ['steiermark'] }, { uid: 'y' }];
    expect(
      uids(filterDirectoryForRegion(raw, { regionId: 'steiermark', activeRegionIds: active }))
    ).toEqual(['x']);
  });
});
