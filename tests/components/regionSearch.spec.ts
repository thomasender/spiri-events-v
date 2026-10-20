import { describe, it, expect } from 'vitest';
import {
  buildRegionSearchIndex,
  foldSearchText,
  searchRegions,
} from '../../src/utils/regionSearch';
import { STATIC_REGIONS } from '../../src/utils/regions';

const index = buildRegionSearchIndex(STATIC_REGIONS);
const find = (q: string) => searchRegions(index, q);

describe('foldSearchText', () => {
  it('ignores case, accents and umlaut spelling', () => {
    expect(foldSearchText('Zürich')).toBe(foldSearchText('zuerich'));
    expect(foldSearchText('Zürich')).toBe(foldSearchText('ZURICH'));
    expect(foldSearchText('Graubünden')).toBe(foldSearchText('graubuenden'));
    expect(foldSearchText('Weißenburg')).toBe(foldSearchText('weissenburg'));
    expect(foldSearchText('  Bad   Tölz ')).toBe('bad tolz');
  });
});

describe('searchRegions', () => {
  it('returns nothing for an empty query', () => {
    expect(find('')).toEqual([]);
    expect(find('   ')).toEqual([]);
  });

  it('finds a region by prefix, with its country', () => {
    const [first] = find('tir');
    expect(first).toMatchObject({
      kind: 'region',
      slug: 'tirol',
      label: 'Tirol',
      detail: 'Österreich',
    });
  });

  it('finds regions typed without umlauts', () => {
    expect(find('zurich')[0]).toMatchObject({ slug: 'zuerich' });
    expect(find('graubunden')[0]).toMatchObject({ slug: 'graubuenden' });
  });

  it('finds a Landkreis and leads to its region', () => {
    const hit = find('münchen').find((e) => e.kind === 'bezirk');
    expect(hit).toMatchObject({ slug: 'bayern' });
    expect(hit?.detail).toBe('Landkreis in Bayern');
  });

  it('puts the region before its own districts', () => {
    const hits = find('tirol');
    expect(hits[0]).toMatchObject({ kind: 'region', slug: 'tirol' });
    expect(hits.filter((e) => e.slug === 'tirol')).toHaveLength(1);
  });

  it('ranks exact and prefix matches above contains matches', () => {
    const labels = find('baden').map((e) => e.label);
    expect(labels[0]).toMatch(/^Baden/);
  });

  it('keeps two districts with the same name apart', () => {
    const baden = find('baden').filter((e) => e.kind === 'bezirk' && e.label === 'Baden');
    expect(new Set(baden.map((e) => e.slug)).size).toBe(baden.length);
  });

  it('never offers the legacy Grenznahe entry', () => {
    expect(find('grenz')).toEqual([]);
  });

  it('caps the number of suggestions', () => {
    expect(find('a').length).toBeLessThanOrEqual(8);
  });

  it('returns nothing for gibberish', () => {
    expect(find('xqzvw')).toEqual([]);
  });
});
