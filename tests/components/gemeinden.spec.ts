import { describe, it, expect } from 'vitest';
import {
  GEMEINDEN,
  findGemeinde,
  formatCityWithBezirk,
  validateCity,
  canonicalCity,
} from '../../src/utils/gemeinden';
import { BEZIRKE } from '../../src/utils/regions';
import { getEventLocationLabel } from '../../src/utils/eventFormat';

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

  it('shows "Umgebung" for places outside Vorarlberg', () => {
    expect(formatCityWithBezirk('Ruggell', 'Grenznahe')).toBe('Ruggell (Umgebung)');
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

  it('accepts a known Gemeinde or an explicit "outside Vorarlberg" choice', () => {
    expect(validateCity('Altach', 'Feldkirch')).toBeNull();
    expect(validateCity('Ruggell', 'Grenznahe')).toBeNull();
  });

  it('rejects an unknown name (typo) without the outside choice', () => {
    expect(validateCity('Lustnau', '')).toMatch(/Gemeinde aus der Liste/);
  });

  it('normalises the spelling on save', () => {
    expect(canonicalCity('altach')).toBe('Altach');
    expect(canonicalCity(' Ruggell ')).toBe('Ruggell');
  });
});

describe('formatCityWithBezirk in Germany', () => {
  it('uses "Lkr." for Landkreise and does not repeat a kreisfreie Stadt', () => {
    expect(formatCityWithBezirk('Garching', 'München', 'Landkreis')).toBe(
      'Garching (Lkr. München)'
    );
    expect(formatCityWithBezirk('Kempten', 'Kempten', 'Landkreis')).toBe('Kempten');
  });
});
