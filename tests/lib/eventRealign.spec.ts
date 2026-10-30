import { describe, it, expect } from 'vitest';
import raw from '../../src/data/placeIndex.json';
import { preparePlaceIndex } from '../../src/utils/placeSearch';
import { STATIC_REGIONS } from '../../src/utils/regions';
import {
  needsRealign,
  planAdminRegionIds,
  planEventRealign,
  planProfileFields,
  resolveStoredPlace,
} from '../../src/utils/eventRealign';

const index = preparePlaceIndex(raw as never);
const regions = STATIC_REGIONS;
const ev = (data: Record<string, unknown>, id = 'e1') => ({ id, data: { title: 'T', ...data } });

describe('needsRealign', () => {
  it('never touches valid Vorarlberg events (also without regionId, legacy Grenznahe, empty Bezirk)', () => {
    expect(
      needsRealign({ regionId: 'vorarlberg', bezirk: 'Dornbirn', city: 'Dornbirn' }, regions)
    ).toBe(false);
    expect(needsRealign({ bezirk: 'Dornbirn', city: 'Dornbirn' }, regions)).toBe(false);
    expect(needsRealign({ bezirk: 'Grenznahe', city: 'Lindau' }, regions)).toBe(false);
    expect(needsRealign({ regionId: 'vorarlberg', bezirk: '', city: 'Ruggell' }, regions)).toBe(
      false
    );
  });

  it('flags a retired region and a Bezirk that is not a district of the region', () => {
    expect(needsRealign({ regionId: 'bayern', bezirk: 'Lindau (Bodensee)' }, regions)).toBe(true);
    expect(needsRealign({ regionId: 'tirol', bezirk: 'Rheintal' }, regions)).toBe(true);
    expect(needsRealign({ regionId: 'tirol', bezirk: '' }, regions)).toBe(true);
    expect(needsRealign({ regionId: 'vorarlberg', bezirk: 'Rheintal' }, regions)).toBe(true);
  });

  it('ignores the empty Bezirk of online events but not their retired region', () => {
    expect(needsRealign({ regionId: 'tirol', isOnline: true, bezirk: '' }, regions)).toBe(false);
    expect(needsRealign({ regionId: 'bayern', isOnline: true }, regions)).toBe(true);
  });
});

describe('resolveStoredPlace', () => {
  it('resolves a unique name and a Vorarlberg Gemeinde', () => {
    expect(resolveStoredPlace({ city: 'Dornbirn' }, index, regions)).toMatchObject({
      bezirk: 'Dornbirn',
      regionId: 'vorarlberg',
    });
    const innsbruck = resolveStoredPlace({ city: 'Innsbruck' }, index, regions);
    expect(innsbruck?.regionId).toBe('tirol');
  });

  it('breaks a tie of namesakes by the stored position, then the old region', () => {
    const names = [...index.byName.entries()].find(
      ([, list]) =>
        list.filter((p) => p.kind === 'place' && p.districtKey).length >= 2 &&
        new Set(list.map((p) => p.stateSlug)).size >= 2
    );
    expect(names).toBeTruthy();
    const [, list] = names!;
    const far = list[list.length - 1];
    const picked = resolveStoredPlace(
      { city: far.name, lat: far.lat, lng: far.lon },
      index,
      regions
    );
    expect(picked?.city).toBe(far.name);
  });

  it('gives null for an unknown or empty Ort', () => {
    expect(resolveStoredPlace({ city: 'Gibtsnichtshausen' }, index, regions)).toBeNull();
    expect(resolveStoredPlace({ city: '' }, index, regions)).toBeNull();
  });
});

describe('planEventRealign', () => {
  it('updates resolvable events (with lat/lng), deletes the others, skips valid ones', () => {
    const rows = planEventRealign(
      [
        ev({ regionId: 'bayern', bezirk: 'Lindau (Bodensee)', city: 'Dornbirn' }, 'a'),
        ev({ regionId: 'bayern', bezirk: 'X', city: 'Gibtsnichtshausen' }, 'b'),
        ev({ regionId: 'vorarlberg', bezirk: 'Dornbirn', city: 'Dornbirn' }, 'c'),
      ],
      index,
      regions
    );
    expect(rows.map((r) => [r.id, r.action])).toEqual([
      ['a', 'update'],
      ['b', 'delete'],
    ]);
    expect(rows[0].next).toMatchObject({
      city: 'Dornbirn',
      bezirk: 'Dornbirn',
      regionId: 'vorarlberg',
    });
    expect(typeof rows[0].next?.lat).toBe('number');
  });
});

describe('planProfileFields / planAdminRegionIds', () => {
  it('removes former regions and districts, deletes empty lists, keeps Online', () => {
    expect(
      planProfileFields(
        { directoryRegionIds: ['bayern', 'tirol'], directoryRegions: ['Online', 'Nirgendwo'] },
        regions
      )
    ).toEqual({ set: { directoryRegionIds: ['tirol'], directoryRegions: ['Online'] }, remove: [] });
    expect(planProfileFields({ directoryRegionIds: ['bayern'] }, regions)).toEqual({
      set: {},
      remove: ['directoryRegionIds'],
    });
    expect(planProfileFields({ directoryRegionIds: ['tirol'] }, regions)).toEqual({
      set: {},
      remove: [],
    });
    expect(planProfileFields({}, regions)).toEqual({ set: {}, remove: [] });
  });

  it('replaces retired moderator regions, steiermark when nothing valid remains', () => {
    expect(planAdminRegionIds({ regionIds: ['bayern', 'tirol'] }, regions)).toEqual(['tirol']);
    expect(planAdminRegionIds({ regionIds: ['bayern'] }, regions)).toEqual(['steiermark']);
    expect(planAdminRegionIds({ regionIds: ['tirol'] }, regions)).toBeNull();
    expect(planAdminRegionIds({}, regions)).toBeNull();
  });
});
