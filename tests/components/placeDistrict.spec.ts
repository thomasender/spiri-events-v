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

const index = preparePlaceIndex(RAW_INDEX);
const bayern = STATIC_REGIONS.find((r) => r.id === 'bayern')!;
const vorarlberg = STATIC_REGIONS.find((r) => r.id === 'vorarlberg')!;
const byName = (name: string) => index.byName.get(name.toLowerCase())![0];

// A cultural region "Allgäu" holding Oberallgäu (assignment given by the fixture).
const withAllgaeu = STATIC_REGIONS.map((r) =>
  r.id === 'bayern'
    ? { ...r, bezirke: r.bezirke.filter((b: string) => b !== 'Oberallgäu') }
    : r.id === 'bayerisch-schwaben-allgaeu'
      ? { ...r, bezirke: ['Oberallgäu'] }
      : r
);

describe('placeDistrict: Ort -> region and Bezirk / Landkreis', () => {
  it('maps a picked place to its district and the region holding it, whatever region one is in', () => {
    expect(assignmentForEntry(byName('Sonthofen'), STATIC_REGIONS)).toEqual({
      regionId: 'bayern',
      bezirk: 'Oberallgäu',
    });
    expect(assignmentForEntry(byName('Innsbruck'), STATIC_REGIONS)).toEqual({
      regionId: 'tirol',
      bezirk: 'Innsbruck',
    });
  });

  it('follows the current assignment (cultural region)', () => {
    expect(assignmentForEntry(byName('Sonthofen'), withAllgaeu)?.regionId).toBe(
      'bayerisch-schwaben-allgaeu'
    );
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

  it('finds "Lindau (Bodensee)" typed as "Lindau"', () => {
    expect(placeAssignment(index, STATIC_REGIONS, 'Lindau')).toEqual({
      regionId: 'bayern',
      bezirk: 'Lindau (Bodensee)',
    });
  });

  it('never chooses between different districts of one name, and leaves unknown places empty', () => {
    expect(placeAssignment(index, STATIC_REGIONS, 'Neustadt')).toBeNull();
    expect(placeAssignment(index, STATIC_REGIONS, 'Ruggell')).toBeNull();
    expect(placeAssignment(index, STATIC_REGIONS, '')).toBeNull();
  });

  it('suggests places of all regions, those of the current region first', () => {
    expect(suggestEventPlaces(index, vorarlberg, 'inns').map((p) => p.name)).toEqual(['Innsbruck']);
    const tirol = STATIC_REGIONS.find((r) => r.id === 'tirol')!;
    expect(suggestEventPlaces(index, bayern, 'neustadt').map((p) => p.size)).toEqual([9, 3]);
    expect(suggestEventPlaces(index, tirol, 'n')).toEqual([]); // fewer than two letters
    expect(suggestEventPlaces(index, tirol, 'in')[0].name).toBe('Innsbruck');
    // Same match quality: bigger places first, but those of the current region before the rest.
    expect(suggestEventPlaces(index, tirol, 'en').map((p) => p.name)).toEqual([
      'Lindau (Bodensee)',
      'Essen',
      'Sonthofen',
    ]);
    expect(suggestEventPlaces(index, bayern, 'en').map((p) => p.name)).toEqual([
      'Lindau (Bodensee)',
      'Sonthofen',
      'Essen',
    ]);
    expect(
      suggestEventPlaces(index, vorarlberg, 'lindau', { skip: (e) => e.name.startsWith('L') })
    ).toEqual([]);
  });

  it('hints at a region that is not open yet, neutral for an open one, nothing for the same', () => {
    const regions = STATIC_REGIONS.map((r) => (r.id === 'tirol' ? { ...r, active: true } : r));
    expect(placeRegionHint('bayern', 'vorarlberg', regions)).toBe(
      'Dieser Ort gehört zur Region Bayern, die noch nicht freigeschaltet ist. Dein Event erscheint dort ab der Freischaltung.'
    );
    expect(placeRegionHint('tirol', 'vorarlberg', regions)).toBe(
      'Dieses Event erscheint in der Region Tirol.'
    );
    expect(placeRegionHint('vorarlberg', 'vorarlberg', regions)).toBeNull();
    expect(placeRegionHint('', 'vorarlberg', regions)).toBeNull();
  });
});
