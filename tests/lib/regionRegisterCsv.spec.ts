import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COUNTRY_FILES,
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

// The region register is defined ONLY by the three CSVs in scripts/data/regions/
// (scripts/build-region-data.mjs). These tests parse them and fail when anything drifts.
const root = `${resolve(process.cwd())}/`;
const csv = readRegionCsvs(root);
const register = buildRegister(csv);

describe('region CSVs (scripts/data/regions/)', () => {
  it('has the three country files: Austria 9, Switzerland 19, Liechtenstein 1 region', () => {
    expect(Object.keys(csv)).toEqual(['AT', 'CH', 'LI']);
    expect(csv.AT).toHaveLength(9);
    expect(csv.CH).toHaveLength(19);
    expect(csv.LI).toHaveLength(1);
    const districts = (c: string) => csv[c].reduce((n: number, r) => n + r.bezirke.length, 0);
    expect([districts('AT'), districts('CH'), districts('LI')]).toEqual([116, 139, 2]);
    expect(COUNTRY_FILES.map(([c]) => c)).toEqual(['AT', 'CH', 'LI', 'DE']);
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
    }
    expect(slugs).toEqual([
      'burgenland',
      'kaernten',
      'niederoesterreich',
      'oberoesterreich',
      'salzburg',
      'steiermark',
      'tirol',
      'vorarlberg',
      'wien',
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
      'liechtenstein',
    ]);
  });

  it('every district is unique within its country and taken 1:1 from the CSV', () => {
    for (const country of Object.keys(csv)) {
      const all = register.filter((r) => r.country === country).flatMap((r) => r.bezirke);
      expect(new Set(all).size).toBe(all.length);
    }
    expect(register.find((r) => r.slug === 'burgenland')?.bezirke[0]).toBe('Eisenstadt (Stadt)');
    expect(register.find((r) => r.slug === 'kaernten')?.bezirke[0]).toBe('Klagenfurt (Stadt)');
    expect(register.find((r) => r.slug === 'wien')?.bezirke).toHaveLength(23);
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
    expect([...body.matchAll(/'([a-z-]+)'/g)].map((m) => m[1])).toEqual(ids);
  });

  it('former regions stay reserved but are no regions (Germany, merged cantons, Allgäu)', () => {
    for (const id of ['bayern', 'allgaeu', 'luzern', 'zug', 'basel-stadt', 'ruhrgebiet']) {
      expect(SRC_RETIRED).toContain(id);
      expect(REGION_SLUGS).not.toContain(id);
    }
    expect(SRC_RETIRED).not.toContain('vorarlberg');
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
  });

  it('parses the CSV format (BOM, `;`, comma list) and rejects a broken header', () => {
    const text = readFileSync(`${root}${REGION_CSV_DIR}/liechtenstein.csv`, 'utf8');
    expect(parseRegionCsv(text)).toEqual([
      { name: 'Liechtenstein', bezirke: ['Oberland', 'Unterland'] },
    ]);
    expect(() => parseRegionCsv('Name;Bezirke\nX;Y')).toThrow(/header/);
    expect(() => parseRegionCsv('Region;Bezirke\nX;')).toThrow(/no districts/);
  });
});
