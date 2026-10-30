import { describe, it, expect } from 'vitest';
import { preparePlaceIndex } from '../../src/utils/placeSearch';
import {
  assignmentForEntry,
  placeAssignment,
  placeRegionHint,
  suggestEventPlaces,
} from '../../src/utils/placeDistrict';
import { STATIC_REGIONS } from '../../src/utils/regions';
import { RAW_INDEX } from '../fixtures/smallPlaceIndex';
import { foldSearchText } from '../../src/utils/regionSearch';

const index = preparePlaceIndex(RAW_INDEX);
const stGallen = STATIC_REGIONS.find((r) => r.id === 'st-gallen')!;
const vorarlberg = STATIC_REGIONS.find((r) => r.id === 'vorarlberg')!;
const byName = (name: string) => index.byName.get(foldSearchText(name))![0];

describe('placeDistrict: Ort -> region and Bezirk / Landkreis', () => {
  it('maps a picked place to its district and the region holding it, whatever region one is in', () => {
    expect(assignmentForEntry(byName('Altstätten'), STATIC_REGIONS)).toEqual({
      regionId: 'st-gallen',
      bezirk: 'Rheintal',
    });
    expect(assignmentForEntry(byName('Innsbruck'), STATIC_REGIONS)).toEqual({
      regionId: 'tirol',
      bezirk: 'Innsbruck (Stadt)',
    });
  });

  it('gives null for a place without a district', () => {
    expect(assignmentForEntry(byName('Kleinort'), STATIC_REGIONS)).toBeNull();
    expect(placeAssignment(index, STATIC_REGIONS, 'Kleinort')).toBeNull();
  });

  it('resolves a Vorarlberg Gemeinde through the Gemeinde list', () => {
    expect(placeAssignment(null, STATIC_REGIONS, 'altach')).toEqual({
      regionId: 'vorarlberg',
      bezirk: 'Feldkirch',
    });
  });

  it('finds "Rorschach (Bodensee)" typed as "Rorschach"', () => {
    expect(placeAssignment(index, STATIC_REGIONS, 'Rorschach')).toEqual({
      regionId: 'st-gallen',
      bezirk: 'Rorschach',
    });
  });

  it('never chooses between different districts of one name, and leaves unknown places empty', () => {
    expect(placeAssignment(index, STATIC_REGIONS, 'Buchs')).toBeNull();
    expect(placeAssignment(index, STATIC_REGIONS, 'Nirgendwo')).toBeNull();
    expect(placeAssignment(index, STATIC_REGIONS, '')).toBeNull();
  });

  it('suggests places of all regions, those of the current region first', () => {
    expect(suggestEventPlaces(index, vorarlberg, 'inns').map((p) => p.name)).toEqual(['Innsbruck']);
    const tirol = STATIC_REGIONS.find((r) => r.id === 'tirol')!;
    expect(suggestEventPlaces(index, stGallen, 'buchs').map((p) => p.size)).toEqual([3, 9]);
    expect(suggestEventPlaces(index, tirol, 'buchs').map((p) => p.size)).toEqual([9, 3]);
    expect(suggestEventPlaces(index, tirol, 'n')).toEqual([]); // fewer than two letters
    expect(suggestEventPlaces(index, tirol, 'in')[0].name).toBe('Innsbruck');
    // Same match quality: bigger places first, but those of the current region before the rest.
    expect(suggestEventPlaces(index, tirol, 'en').map((p) => p.name)).toEqual([
      'Rorschach (Bodensee)',
      'Wädenswil',
      'Altstätten',
    ]);
    expect(suggestEventPlaces(index, stGallen, 'en').map((p) => p.name)).toEqual([
      'Rorschach (Bodensee)',
      'Altstätten',
      'Wädenswil',
    ]);
    expect(
      suggestEventPlaces(index, vorarlberg, 'rorschach', { skip: (e) => e.name.startsWith('R') })
    ).toEqual([]);
  });

  it('hints at a region that is not open yet, neutral for an open one, nothing for the same', () => {
    const regions = STATIC_REGIONS.map((r) => (r.id === 'tirol' ? { ...r, active: true } : r));
    expect(placeRegionHint('st-gallen', 'vorarlberg', regions)).toBe(
      'Dieser Ort gehört zur Region St. Gallen, die noch nicht freigeschaltet ist. Dein Event erscheint dort ab der Freischaltung.'
    );
    expect(placeRegionHint('tirol', 'vorarlberg', regions)).toBe(
      'Dieses Event erscheint in der Region Tirol.'
    );
    expect(placeRegionHint('vorarlberg', 'vorarlberg', regions)).toBeNull();
    expect(placeRegionHint('', 'vorarlberg', regions)).toBeNull();
  });
});
