import { describe, it, expect } from 'vitest';
import {
  AUTO_PALETTE,
  DISTRICT_COLOR_DEFAULTS,
  autoDistrictColors,
  getDistrictColor,
  isFixedDistrict,
  sanitizeDistrictOverrides,
} from '../../src/utils/districtColors';

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrastWithWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

describe('district colours', () => {
  it('has the six agreed defaults', () => {
    expect(DISTRICT_COLOR_DEFAULTS).toEqual({
      Bregenz: '#B97860',
      Dornbirn: '#BC9367',
      Feldkirch: '#B39A78',
      Bludenz: '#A68B73',
      Umgebung: '#7D8B76',
      Online: '#7C8792',
    });
    expect(getDistrictColor('Dornbirn')).toBe('#BC9367');
  });

  it('reads the legacy "Grenznahe" as Umgebung', () => {
    expect(getDistrictColor('Grenznahe')).toBe('#7D8B76');
    expect(getDistrictColor('Grenznahe', { Umgebung: '#112233' })).toBe('#112233');
    expect(isFixedDistrict('Grenznahe')).toBe(true);
    expect(isFixedDistrict('Online')).toBe(true);
    expect(isFixedDistrict('Imst')).toBe(false);
  });

  it('prefers an override and ignores malformed ones', () => {
    expect(getDistrictColor('Bregenz', { Bregenz: '#112233' })).toBe('#112233');
    expect(getDistrictColor('Bregenz', { Bregenz: 'red' })).toBe('#B97860');
    expect(sanitizeDistrictOverrides({ A: '#aabbcc', B: 'nope', C: 4, D: '#abc' })).toEqual({
      A: '#aabbcc',
    });
  });

  it('gives other districts a deterministic automatic colour from the palette', () => {
    const a = getDistrictColor('Imst');
    expect(a).toBe(getDistrictColor('Imst'));
    expect(AUTO_PALETTE).toContain(a);
    expect(getDistrictColor('Imst', { Imst: '#010203' })).toBe('#010203');
  });

  it('does not depend on the order of the list and avoids collisions inside it', () => {
    const names = Array.from({ length: AUTO_PALETTE.length }, (_, i) => `Bezirk ${i}`);
    const forward = autoDistrictColors(names);
    const backward = autoDistrictColors([...names].reverse());
    expect(backward).toEqual(forward);
    expect(new Set(Object.values(forward)).size).toBe(names.length);
    for (const name of names) expect(getDistrictColor(name, {}, names)).toBe(forward[name]);
  });

  it('never hands out Umgebung / Online / default districts an automatic colour', () => {
    expect(autoDistrictColors(['Bregenz', 'Online', 'Grenznahe', 'Imst'])).toEqual({
      Imst: expect.any(String),
    });
  });

  it('keeps every palette colour readable under white text and apart from the defaults', () => {
    for (const color of AUTO_PALETTE) {
      expect(contrastWithWhite(color), color).toBeGreaterThanOrEqual(3.5);
    }
    expect(new Set(AUTO_PALETTE).size).toBe(AUTO_PALETTE.length);
    const defaults = Object.values(DISTRICT_COLOR_DEFAULTS).map((c) => c.toLowerCase());
    for (const color of AUTO_PALETTE) expect(defaults).not.toContain(color.toLowerCase());
  });
});
