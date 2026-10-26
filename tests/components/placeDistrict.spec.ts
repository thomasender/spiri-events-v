import { describe, it, expect } from 'vitest';
import { preparePlaceIndex } from '../../src/utils/placeSearch';
import {
  districtForCity,
  districtForEntry,
  districtForPick,
  suggestRegionPlaces,
} from '../../src/utils/placeDistrict';
import { STATIC_REGIONS } from '../../src/utils/regions';
import { RAW_INDEX } from '../fixtures/smallPlaceIndex';

const index = preparePlaceIndex(RAW_INDEX);
const bayern = STATIC_REGIONS.find((r) => r.id === 'bayern');
const ruhr = { slug: 'ruhrgebiet', country: 'DE', bezirke: ['Essen', 'Dortmund'] };
const byName = (name: string) => index.byName.get(name.toLowerCase())![0];

describe('placeDistrict', () => {
  it('maps a place to its register district when the region holds it', () => {
    expect(districtForEntry(byName('Sonthofen'), bayern)).toBe('Oberallgäu');
    expect(districtForEntry(byName('Essen'), ruhr)).toBe('Essen');
  });

  it('gives no district for a place of another region or without a district', () => {
    expect(districtForEntry(byName('Sonthofen'), ruhr)).toBeNull();
    expect(districtForEntry(byName('Kleinort'), bayern)).toBeNull();
    expect(districtForCity(index, bayern, 'Kleinort')).toBeNull();
  });

  it('finds "Lindau (Bodensee)" when typed as "Lindau" and keeps the register name', () => {
    expect(districtForCity(index, bayern, 'Lindau')).toBe('Lindau (Bodensee)');
    expect(districtForCity(index, bayern, 'lindau (bodensee)')).toBe('Lindau (Bodensee)');
  });

  it('never chooses between different districts of one name ("Neustadt")', () => {
    expect(districtForCity(index, bayern, 'Neustadt')).toBeNull();
    const [first] = index.byName.get('neustadt')!;
    expect(districtForPick(index, bayern, first)).toBeNull();
  });

  it('leaves unknown places empty', () => {
    expect(districtForCity(index, bayern, 'Gibtsnicht')).toBeNull();
    expect(districtForCity(index, bayern, '')).toBeNull();
  });

  it('suggests only places of the region, bigger places first', () => {
    expect(suggestRegionPlaces(index, ruhr, 'es').map((p) => p.name)).toEqual(['Essen']);
    expect(suggestRegionPlaces(index, bayern, 'inns')).toEqual([]);
    const neustadt = suggestRegionPlaces(index, bayern, 'neustadt');
    expect(neustadt.map((p) => p.size)).toEqual([9, 3]);
    expect(suggestRegionPlaces(index, bayern, 'lindau')[0].name).toBe('Lindau (Bodensee)');
  });

  it('picks the district of a unique pick', () => {
    expect(districtForPick(index, ruhr, byName('Dortmund'))).toBe('Dortmund');
  });
});
