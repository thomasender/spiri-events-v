import { describe, expect, it } from 'vitest';
import {
  BEZIRKE,
  DEFAULT_REGION_ID,
  LEGACY_BEZIRKE,
  LEGACY_OUTSIDE_BEZIRK,
  STATIC_REGIONS,
  getBezirke,
  getRegionBySlug,
  pickEventRegionId,
  resolveDirectoryRegionIds,
  resolveRegionId,
  selectableBezirke,
} from '../../src/utils/regions';
import { DIRECTORY_REGIONS } from '../../src/utils/directory';
import {
  DEFAULT_REGION_ID as FN_DEFAULT,
  DIRECTORY_REGIONS as FN_DIRECTORY_REGIONS,
  STATIC_REGION_BEZIRKE,
  resolveRegionId as fnResolveRegionId,
} from '../../functions/src/regions';

// Regression guard (Trello QG0GR5lv): the CSV register must never break Vorarlberg, the live
// region. Its id, its four Bezirke (in this order), the legacy "Grenznahe" and the read
// fallback "no regionId = Vorarlberg" are pinned here.
describe('Vorarlberg stays as it is', () => {
  it('keeps its id, name, wording and the only active region', () => {
    expect(DEFAULT_REGION_ID).toBe('vorarlberg');
    expect(FN_DEFAULT).toBe('vorarlberg');
    expect(getRegionBySlug('vorarlberg')).toMatchObject({
      id: 'vorarlberg',
      slug: 'vorarlberg',
      name: 'Vorarlberg',
      country: 'AT',
      inPhrase: 'in Vorarlberg',
      forPhrase: 'Vorarlberg',
      demonym: 'Vorarlberger',
      subdivisionLabel: 'Bezirk',
      timezone: 'Europe/Vienna',
      active: true,
    });
    expect(STATIC_REGIONS.filter((r) => r.active).map((r) => r.id)).toEqual(['vorarlberg']);
  });

  it('keeps its four Bezirke in order, plus the legacy "Grenznahe" (never selectable)', () => {
    const four = ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz'];
    expect(LEGACY_OUTSIDE_BEZIRK).toBe('Grenznahe');
    expect(LEGACY_BEZIRKE).toEqual({ vorarlberg: ['Grenznahe'] });
    expect(getBezirke('vorarlberg')).toEqual([...four, 'Grenznahe']);
    expect(BEZIRKE).toEqual([...four, 'Grenznahe']);
    expect(selectableBezirke(getBezirke('vorarlberg'))).toEqual(four);
    expect(STATIC_REGION_BEZIRKE.vorarlberg).toEqual([...four, 'Grenznahe']);
    expect(DIRECTORY_REGIONS.slice(0, 5)).toEqual([...four, 'Grenznahe']);
    expect(FN_DIRECTORY_REGIONS.slice(0, 5)).toEqual([...four, 'Grenznahe']);
  });

  it('a missing regionId / directoryRegionIds still means Vorarlberg (client and functions)', () => {
    for (const doc of [{}, null, undefined, { regionId: '' }, { regionId: null }]) {
      expect(resolveRegionId(doc)).toBe('vorarlberg');
      expect(fnResolveRegionId(doc)).toBe('vorarlberg');
    }
    expect(resolveDirectoryRegionIds({})).toEqual(['vorarlberg']);
    expect(pickEventRegionId(undefined, null)).toBe('vorarlberg');
    expect(pickEventRegionId(undefined, { regionId: 'vorarlberg' })).toBe('vorarlberg');
  });
});
