import { describe, it, expect } from 'vitest';
import {
  GEMEINDEN,
  findGemeinde,
  formatCityWithBezirk,
  validateCity,
  canonicalCity,
} from '../../src/utils/gemeinden';
import { BEZIRKE } from '../../src/utils/regions';
import { getEventDistrictPrefix, getEventLocationLabel } from '../../src/utils/eventFormat';

describe('GEMEINDEN', () => {
  it('lists all 96 Vorarlberg Gemeinden once, each in a known Bezirk', () => {
    expect(GEMEINDEN).toHaveLength(96);
    expect(new Set(GEMEINDEN.map((g) => g.name)).size).toBe(96);
    for (const g of GEMEINDEN) expect(BEZIRKE).toContain(g.bezirk);
  });

  it('derives the Bezirk from the Gemeinde', () => {
    expect(findGemeinde('Altach')?.bezirk).toBe('Feldkirch');
    expect(findGemeinde('Lustenau')?.bezirk).toBe('Dornbirn');
    expect(findGemeinde('Hittisau')?.bezirk).toBe('Bregenz');
    expect(findGemeinde('Lech')?.bezirk).toBe('Bludenz');
  });

  it('matches case-insensitively and accepts "Sankt" for "St."', () => {
    expect(findGemeinde('  lustenau ')?.name).toBe('Lustenau');
    expect(findGemeinde('Sankt Gallenkirch')?.name).toBe('St. Gallenkirch');
    expect(findGemeinde('Lustnau')).toBeNull();
  });
});

describe('formatCityWithBezirk', () => {
  it('shows "Ort (Bez. Bezirk)" so same-named places stay distinguishable', () => {
    expect(formatCityWithBezirk('Altach', 'Feldkirch')).toBe('Altach (Bez. Feldkirch)');
  });

  it('shows "Umgebung" for old events with the legacy "Grenznahe"', () => {
    expect(formatCityWithBezirk('Ruggell', 'Grenznahe')).toBe('Ruggell (Umgebung)');
  });

  it('shows just the Ort for a place without Bezirk (Liechtenstein, outside DACH)', () => {
    expect(formatCityWithBezirk('Ruggell', '')).toBe('Ruggell');
    expect(getEventLocationLabel({ city: 'Ruggell', bezirk: '' })).toBe('Ruggell');
  });

  it('uses "Lkr." for a Landkreis and the full label for a Landesteil', () => {
    expect(formatCityWithBezirk('Lindau', 'Lindau (Bodensee)', 'Landkreis')).toBe(
      'Lindau (Lkr. Lindau (Bodensee))'
    );
    expect(
      getEventLocationLabel({ city: 'Vaduz', bezirk: 'Oberland', regionId: 'liechtenstein' })
    ).toBe('Vaduz (Landesteil Oberland)');
  });

  it('falls back to the Bezirk for older events without a city', () => {
    expect(formatCityWithBezirk('', 'Dornbirn')).toBe('Dornbirn');
    expect(getEventLocationLabel({ bezirk: 'Dornbirn' })).toBe('Dornbirn');
    expect(getEventLocationLabel({ city: 'Lustenau', bezirk: 'Dornbirn' })).toBe(
      'Lustenau (Bez. Dornbirn)'
    );
    expect(getEventLocationLabel({ isOnline: true, city: 'Lustenau' })).toBe('Online');
  });
});

describe('validateCity / canonicalCity', () => {
  it('requires a city', () => {
    expect(validateCity('  ', '')).toMatch(/Ort angeben/);
  });

  it('accepts any place: a Gemeinde, a place of another region, free text, an old "Grenznahe"', () => {
    expect(validateCity('Altach', 'Feldkirch')).toBeNull();
    expect(validateCity('Lindau', 'Lindau (Bodensee)')).toBeNull();
    expect(validateCity('Ruggell', '')).toBeNull();
    expect(validateCity('Ruggell', 'Grenznahe')).toBeNull();
  });

  it('normalises the spelling on save', () => {
    expect(canonicalCity('altach')).toBe('Altach');
    expect(canonicalCity(' Ruggell ')).toBe('Ruggell');
  });
});

describe('formatCityWithBezirk in Germany (district names of deutschland.csv)', () => {
  it('uses "Lkr." for Landkreise and does not repeat a kreisfreie Stadt', () => {
    expect(formatCityWithBezirk('Garching', 'Landkreis München', 'Landkreis')).toBe(
      'Garching (Lkr. München)'
    );
    expect(formatCityWithBezirk('München', 'Stadt München', 'Landkreis')).toBe('München');
    expect(formatCityWithBezirk('Kempten', 'Stadt Kempten (Allgäu)', 'Landkreis')).toBe('Kempten');
    expect(
      formatCityWithBezirk('Lindau (Bodensee)', 'Landkreis Lindau (Bodensee)', 'Landkreis')
    ).toBe('Lindau (Bodensee) (Lkr. Lindau (Bodensee))');
  });

  it('names that carry their kind stay as they are; bare names get "Lkr."', () => {
    expect(formatCityWithBezirk('Waiblingen', 'Rems-Murr-Kreis', 'Landkreis')).toBe(
      'Waiblingen (Rems-Murr-Kreis)'
    );
    expect(formatCityWithBezirk('Garbsen', 'Region Hannover', 'Landkreis')).toBe(
      'Garbsen (Region Hannover)'
    );
    expect(formatCityWithBezirk('Spandau', 'Stadt Berlin', 'Landkreis')).toBe(
      'Spandau (Stadt Berlin)'
    );
    expect(formatCityWithBezirk('Jever', 'Friesland', 'Landkreis')).toBe('Jever (Lkr. Friesland)');
    expect(
      getEventLocationLabel({
        city: 'Unterhaching',
        bezirk: 'Landkreis München',
        regionId: 'muenchen',
      })
    ).toBe('Unterhaching (Lkr. München)');
  });

  it('the district badge prefix: "Landkreis" only where the name does not say it', () => {
    const prefix = (bezirk: string) =>
      getEventDistrictPrefix({ city: 'X', bezirk, regionId: 'bodensee' });
    expect(prefix('Landkreis Konstanz')).toBe('');
    expect(prefix('Bodenseekreis')).toBe('');
    expect(
      getEventDistrictPrefix({ city: 'Jever', bezirk: 'Friesland', regionId: 'friesland' })
    ).toBe('Landkreis');
    expect(getEventDistrictPrefix({ city: 'Altach', bezirk: 'Feldkirch' })).toBe('Bezirk');
    expect(
      getEventDistrictPrefix({ city: 'Vaduz', bezirk: 'Oberland', regionId: 'liechtenstein' })
    ).toBe('Landesteil');
  });
});
