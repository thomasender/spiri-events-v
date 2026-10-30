import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COUNTRY_FILES,
  HISTORIC_REGION_IDS,
  META,
  REGION_CSV_DIR,
  SLUG_PATTERN,
  buildRegister,
  parseRegionCsv,
  readRegionCsvs,
  retiredRegionIds,
  slugify,
} from '../../scripts/lib/regionRegister.mjs';
import {
  LEGACY_BEZIRKE as SRC_LEGACY,
  REGION_DATA as SRC_DATA,
  RETIRED_REGION_IDS as SRC_RETIRED,
} from '../../src/data/regionData.js';
import {
  LEGACY_BEZIRKE as FN_LEGACY,
  REGION_DATA as FN_DATA,
  RETIRED_REGION_IDS as FN_RETIRED,
} from '../../functions/src/regionData';
import { REGION_IDS } from '../../functions/src/regions';
import { REGION_SLUGS } from '../../src/utils/regions.js';

// The region register is defined ONLY by the four CSVs in scripts/data/regions/
// (scripts/build-region-data.mjs). These tests parse them and fail when anything drifts.
const root = `${resolve(process.cwd())}/`;
const csv = readRegionCsvs(root);
const register = buildRegister(csv);

describe('region CSVs (scripts/data/regions/)', () => {
  it('has the four country files: Austria 9, Germany 104, Switzerland 19, Liechtenstein 1 region', () => {
    expect(Object.keys(csv)).toEqual(['AT', 'DE', 'CH', 'LI']);
    expect(csv.AT).toHaveLength(9);
    expect(csv.CH).toHaveLength(19);
    expect(csv.LI).toHaveLength(1);
    // Germany: the product owner's list (Trello QG0GR5lv), pinned loosely.
    expect(csv.DE.length).toBeGreaterThanOrEqual(100);
    const districts = (c: string) => csv[c].reduce((n: number, r) => n + r.bezirke.length, 0);
    expect([districts('AT'), districts('CH'), districts('LI')]).toEqual([116, 140, 2]);
    // 400 Landkreise and kreisfreie Städte (2026).
    expect(districts('DE')).toBeGreaterThanOrEqual(400);
    expect(COUNTRY_FILES.map(([c]) => c)).toEqual(['AT', 'DE', 'CH', 'LI']);
  });

  it('every CSV region has a META entry with an id, and every META entry a CSV region', () => {
    for (const [country, rows] of Object.entries(csv)) {
      const names = rows.map((r) => r.name);
      expect(Object.keys(META[country as keyof typeof META]).sort()).toEqual([...names].sort());
      for (const name of names) {
        expect(META[country as keyof typeof META][name]?.slug).toMatch(SLUG_PATTERN);
      }
    }
  });

  it('ids are unique ASCII slugs following the id rule (umlauts transliterated)', () => {
    const slugs = register.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const r of register) {
      expect(r.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(r.slug).toBe(slugify(r.name));
      // Every current id is recorded, so it stays reserved if it ever leaves the CSVs.
      expect(HISTORIC_REGION_IDS).toContain(r.slug);
    }
    const ofCountry = (c: string) => register.filter((r) => r.country === c).map((r) => r.slug);
    expect(ofCountry('AT')).toEqual([
      'burgenland',
      'kaernten',
      'niederoesterreich',
      'oberoesterreich',
      'salzburg',
      'steiermark',
      'tirol',
      'vorarlberg',
      'wien',
    ]);
    expect(ofCountry('CH')).toEqual([
      'aargau',
      'appenzell',
      'basel',
      'bern',
      'freiburg',
      'genf',
      'glarus',
      'graubuenden',
      'innerschweiz',
      'jura',
      'neuenburg',
      'schaffhausen',
      'solothurn',
      'st-gallen',
      'tessin',
      'thurgau',
      'waadt',
      'wallis',
      'zuerich',
    ]);
    expect(ofCountry('LI')).toEqual(['liechtenstein']);
    // Germany in CSV row order (spot checks).
    const de = ofCountry('DE');
    expect(de.slice(0, 3)).toEqual(['region-stuttgart', 'ostalb', 'schwaebische-alb']);
    for (const id of [
      'muenchen',
      'bayerisches-oberland',
      'allgaeu',
      'rhein-main-gebiet',
      'bodensee',
      'berlin',
      'grossraum-duesseldorf',
    ]) {
      expect(de).toContain(id);
    }
    // Country order = switcher order: Austria, Germany, Switzerland, Liechtenstein.
    expect([...new Set(register.map((r) => r.country))]).toEqual(['AT', 'DE', 'CH', 'LI']);
  });

  it('every district is unique within its country and taken 1:1 from the CSV', () => {
    for (const country of Object.keys(csv)) {
      const all = register.filter((r) => r.country === country).flatMap((r) => r.bezirke);
      expect(new Set(all).size).toBe(all.length);
    }
    expect(register.find((r) => r.slug === 'burgenland')?.bezirke[0]).toBe('Eisenstadt (Stadt)');
    expect(register.find((r) => r.slug === 'kaernten')?.bezirke[0]).toBe('Klagenfurt (Stadt)');
    expect(register.find((r) => r.slug === 'wien')?.bezirke).toHaveLength(23);
    expect(register.find((r) => r.slug === 'appenzell')?.bezirke).toContain('Ausserrhoden');
    expect(register.find((r) => r.slug === 'bodensee')?.bezirke).toEqual([
      'Landkreis Konstanz',
      'Bodenseekreis',
      'Landkreis Lindau (Bodensee)',
    ]);
    const muc = register.find((r) => r.slug === 'muenchen');
    expect(muc?.bezirke.slice(0, 2)).toEqual(['Stadt München', 'Landkreis München']);
    expect(register.find((r) => r.slug === 'hannover')?.bezirke).toEqual(['Region Hannover']);
  });

  it('German regions are Landkreis regions in Europe/Berlin with wording', () => {
    const de = register.filter((r) => r.country === 'DE');
    for (const r of de) {
      expect(r.subdivisionLabel).toBe('Landkreis');
      expect(r.timezone).toBe('Europe/Berlin');
      expect(r.demonym).toBeTruthy();
      expect(r.inPhrase).toMatch(/^(in|im|am|an|auf) /);
    }
    const inPhrase = (id: string) => register.find((r) => r.slug === id)?.inPhrase;
    expect(inPhrase('region-stuttgart')).toBe('in der Region Stuttgart');
    expect(inPhrase('allgaeu')).toBe('im Allgäu');
    expect(inPhrase('muenchen')).toBe('in München');
    expect(inPhrase('ruhrgebiet')).toBe('im Ruhrgebiet');
    expect(inPhrase('berlin')).toBe('in Berlin');
  });

  it('src/data/regionData.js and functions/src/regionData.ts are in sync with the CSVs', () => {
    expect(SRC_DATA).toEqual(register);
    expect(FN_DATA).toEqual(register);
    expect(SRC_LEGACY).toEqual(FN_LEGACY);
    expect(SRC_RETIRED).toEqual(retiredRegionIds(register));
    expect(FN_RETIRED).toEqual(SRC_RETIRED);
  });

  it('rules, functions and client list the same ids', () => {
    const ids = register.map((r) => r.slug);
    expect(REGION_SLUGS).toEqual(ids);
    expect(REGION_IDS).toEqual(ids);
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const body = rules.match(/function regionIds\(\) \{\s*return \[([^\]]*)\]/)?.[1] ?? '';
    expect([...body.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1])).toEqual(ids);
  });

  it('former regions stay reserved but are no regions; reused ids are no longer retired', () => {
    for (const id of ['bayern', 'luzern', 'zug', 'basel-stadt', 'region-hannover', 'franken']) {
      expect(SRC_RETIRED).toContain(id);
      expect(REGION_SLUGS).not.toContain(id);
    }
    // Old German ids that are regions of deutschland.csv again.
    for (const id of ['allgaeu', 'kurpfalz', 'ruhrgebiet', 'berlin', 'saarland', 'pfalz']) {
      expect(SRC_RETIRED).not.toContain(id);
      expect(REGION_SLUGS).toContain(id);
    }
    expect(SRC_RETIRED).not.toContain('vorarlberg');
    expect(new Set([...SRC_RETIRED, ...REGION_SLUGS]).size).toBe(HISTORIC_REGION_IDS.length);
  });

  it('the generator fails loudly on a region without META, META without region, a duplicate district', () => {
    expect(() =>
      buildRegister({ ...csv, AT: [...csv.AT, { name: 'Neuland', bezirke: ['X'] }] })
    ).toThrow(/Neuland has no META/);
    expect(() => buildRegister({ ...csv, AT: csv.AT.filter((r) => r.name !== 'Tirol') })).toThrow(
      /Tirol has no CSV region/
    );
    expect(() =>
      buildRegister({
        ...csv,
        AT: csv.AT.map((r) =>
          r.name === 'Tirol' ? { ...r, bezirke: [...r.bezirke, 'Bregenz'] } : r
        ),
      })
    ).toThrow(/district "Bregenz" twice/);
    expect(() =>
      buildRegister({
        ...csv,
        DE: csv.DE.map((r) =>
          r.name === 'Allgäu' ? { ...r, bezirke: [...r.bezirke, 'Stadt München'] } : r
        ),
      })
    ).toThrow(/district "Stadt München" twice in DE/);
    expect(() =>
      buildRegister({ ...csv, DE: csv.DE.filter((r) => r.name !== 'Bodensee') })
    ).toThrow(/DE\|Bodensee has no CSV region/);
  });

  it('parses the semicolon layout (BOM, `;`, comma list) and rejects a broken header', () => {
    const text = readFileSync(`${root}${REGION_CSV_DIR}/liechtenstein.csv`, 'utf8');
    expect(parseRegionCsv(text)).toEqual([
      { name: 'Liechtenstein', bezirke: ['Oberland', 'Unterland'] },
    ]);
    expect(parseRegionCsv('\uFEFFRegion;Bezirke\r\nA;x, y,\r\nB;z')).toEqual([
      { name: 'A', bezirke: ['x', 'y'] },
      { name: 'B', bezirke: ['z'] },
    ]);
    expect(() => parseRegionCsv('Name;Bezirke\nX;Y')).toThrow(/header/);
    expect(() => parseRegionCsv('Region;Bezirke\nX;')).toThrow(/no districts/);
    expect(() => parseRegionCsv('Region;Bezirke\nX;a;b')).toThrow(/exactly 2 columns/);
  });

  it('parses the comma layout with header "region, bezirk" (deutschland.csv) and fails on malformed rows', () => {
    expect(
      parseRegionCsv(
        'region, bezirk\r\nBodensee,Landkreis Konstanz, Bodenseekreis\r\nHarz,Landkreis Harz'
      )
    ).toEqual([
      { name: 'Bodensee', bezirke: ['Landkreis Konstanz', 'Bodenseekreis'] },
      { name: 'Harz', bezirke: ['Landkreis Harz'] },
    ]);
    expect(parseRegionCsv('Region,Bezirk\nX,y')).toEqual([{ name: 'X', bezirke: ['y'] }]);
    expect(() => parseRegionCsv('region, bezirk\nX')).toThrow(/no districts/);
    expect(() => parseRegionCsv('region, bezirk\nX,a,,b')).toThrow(/empty district/);
    expect(() => parseRegionCsv('region, bezirk\nX,a,')).toThrow(/empty district/);
    expect(() => parseRegionCsv('region, bezirk\n,a')).toThrow(/no region name/);
    expect(() => parseRegionCsv('region, bezirk\nX;a')).toThrow(/contains ";"/);
    expect(() => parseRegionCsv('region, bezirk\nX,a\nX,b')).toThrow(/listed twice/);
    expect(() => parseRegionCsv('region; bezirk\nX,a')).toThrow(/header/);
    const de = parseRegionCsv(readFileSync(`${root}${REGION_CSV_DIR}/deutschland.csv`, 'utf8'));
    expect(de[0]).toEqual({
      name: 'Region Stuttgart',
      bezirke: [
        'Stadt Stuttgart',
        'Landkreis Böblingen',
        'Landkreis Esslingen',
        'Landkreis Ludwigsburg',
        'Rems-Murr-Kreis',
        'Landkreis Göppingen',
      ],
    });
  });
});
