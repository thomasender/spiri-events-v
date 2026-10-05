import { describe, it, expect } from 'vitest';
import {
  DIRECTORY_MAX_CATEGORIES,
  buildDirectoryParams,
  countFacet,
  filterDirectoryEntries,
  isRenderableEntry,
  normalizeDirectoryEntry,
  parseDirectoryParams,
  sortDirectoryEntries,
  toggleValue,
  validateDirectoryListing,
} from '../../src/utils/directory';

const entry = (over: Record<string, unknown> = {}) =>
  normalizeDirectoryEntry('uid-' + Math.random(), {
    slug: 'anna',
    displayName: 'Anna',
    bio: 'Yogalehrerin in Dornbirn',
    directoryCategories: ['Yoga'],
    directoryRegions: ['Dornbirn'],
    ...over,
  });

describe('validateDirectoryListing', () => {
  it('requires nothing when the user is not listed', () => {
    expect(
      validateDirectoryListing({ listed: false, categories: [], regions: [], hasBio: false })
    ).toEqual({});
  });

  it('requires at least one category and a bio once listed', () => {
    const errors = validateDirectoryListing({
      listed: true,
      categories: [],
      regions: [],
      hasBio: false,
    });
    expect(errors.categories).toMatch(/mindestens eine Kategorie/);
    expect(errors.bio).toBeTruthy();
  });

  it('caps the number of categories', () => {
    const categories = Array.from({ length: DIRECTORY_MAX_CATEGORIES + 1 }, (_, i) => `K${i}`);
    expect(
      validateDirectoryListing({ listed: true, categories, regions: [], hasBio: true }).categories
    ).toMatch(/höchstens/);
  });

  it('rejects unknown regions but treats regions as optional', () => {
    expect(
      validateDirectoryListing({ listed: true, categories: ['Yoga'], regions: [], hasBio: true })
    ).toEqual({});
    expect(
      validateDirectoryListing({
        listed: true,
        categories: ['Yoga'],
        regions: ['Mars'],
        hasBio: true,
      }).regions
    ).toBeTruthy();
  });
});

describe('normalizeDirectoryEntry / isRenderableEntry', () => {
  it('drops non-string list items and defaults missing fields', () => {
    const e = normalizeDirectoryEntry('u1', {
      slug: 's',
      displayName: 'X',
      directoryCategories: ['Yoga', 3, ''],
    });
    expect(e.categories).toEqual(['Yoga']);
    expect(e.regions).toEqual([]);
    expect(e.hidden).toBe(false);
  });

  it('skips entries that cannot be linked or have no category', () => {
    expect(isRenderableEntry(entry())).toBe(true);
    expect(isRenderableEntry(entry({ slug: '' }))).toBe(false);
    expect(isRenderableEntry(entry({ directoryCategories: [] }))).toBe(false);
    expect(isRenderableEntry(entry({ displayName: '  ' }))).toBe(false);
  });
});

describe('filterDirectoryEntries', () => {
  const anna = entry({
    displayName: 'Anna',
    directoryCategories: ['Yoga'],
    directoryRegions: ['Dornbirn'],
  });
  const ben = entry({
    displayName: 'Ben',
    bio: 'Klangreisen',
    directoryCategories: ['Soundhealing', 'Therapie'],
    directoryRegions: ['Bregenz'],
  });
  const cara = entry({
    displayName: 'Cara',
    directoryCategories: ['Yoga'],
    directoryRegions: ['Online'],
    directoryHidden: true,
  });
  const all = [anna, ben, cara];

  it('hides moderated entries unless asked to include them', () => {
    expect(filterDirectoryEntries(all)).toEqual([anna, ben]);
    expect(filterDirectoryEntries(all, { includeHidden: true })).toHaveLength(3);
  });

  it('combines several values in one facet with OR and facets with AND', () => {
    expect(filterDirectoryEntries(all, { categories: ['Yoga', 'Therapie'] })).toEqual([anna, ben]);
    expect(
      filterDirectoryEntries(all, { categories: ['Yoga', 'Therapie'], regions: ['Bregenz'] })
    ).toEqual([ben]);
  });

  it('searches name, bio and categories case-insensitively with all words required', () => {
    expect(filterDirectoryEntries(all, { query: 'klang' })).toEqual([ben]);
    expect(filterDirectoryEntries(all, { query: 'ben therapie' })).toEqual([ben]);
    expect(filterDirectoryEntries(all, { query: 'ben yoga' })).toEqual([]);
  });

  it('counts a facet with the other filters applied and omits zero counts', () => {
    const counts = countFacet(all, 'categories', { regions: ['Bregenz'] });
    expect(counts.get('Soundhealing')).toBe(1);
    expect(counts.has('Yoga')).toBe(false);
  });

  it('does not let the facet’s own selection reduce its counts', () => {
    const counts = countFacet(all, 'categories', { categories: ['Yoga'] });
    expect(counts.get('Therapie')).toBe(1);
  });
});

describe('sortDirectoryEntries', () => {
  it('sorts alphabetically with German collation and does not mutate', () => {
    const list = [
      entry({ displayName: 'Zoe' }),
      entry({ displayName: 'Änne' }),
      entry({ displayName: 'Bea' }),
    ];
    expect(sortDirectoryEntries(list).map((e) => e.displayName)).toEqual(['Änne', 'Bea', 'Zoe']);
    expect(list[0].displayName).toBe('Zoe');
  });
});

describe('URL params', () => {
  it('round-trips filters', () => {
    const params = buildDirectoryParams({
      query: ' yoga ',
      categories: ['Yoga', 'Körperarbeit'],
      regions: ['Online'],
    });
    expect(parseDirectoryParams(params)).toEqual({
      query: 'yoga',
      categories: ['Yoga', 'Körperarbeit'],
      regions: ['Online'],
    });
  });

  it('omits empty filters', () => {
    expect(buildDirectoryParams({}).toString()).toBe('');
  });

  it('toggles values', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
  });
});
