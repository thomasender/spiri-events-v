import { describe, it, expect } from 'vitest';
import {
  DIRECTORY_MAX_CATEGORIES,
  buildDirectoryParams,
  countFacet,
  filterDirectoryEntries,
  formatBioPreview,
  DIRECTORY_MEMBER_HEAD_CHANCE,
  DIRECTORY_MEMBER_HEAD_SHARE,
  isRenderableEntry,
  mixDirectoryEntries,
  normalizeDirectoryEntry,
  parseDirectoryParams,
  shuffleDirectoryEntries,
  sortDirectoryEntries,
  toggleValue,
  validateDirectoryListing,
} from '../../src/utils/directory';
import { stripHtml } from '../../src/utils/sanitize';

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

  it('reads clubMember strictly; a missing field means no member', () => {
    expect(normalizeDirectoryEntry('u1', { clubMember: true }).clubMember).toBe(true);
    expect(normalizeDirectoryEntry('u1', { clubMember: 'true' }).clubMember).toBe(false);
    expect(normalizeDirectoryEntry('u1', {}).clubMember).toBe(false);
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

// Deterministic PRNG (mulberry32), so the statistics below never flake.
function seeded(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const people = (n: number, clubMember: boolean, prefix: string) =>
  Array.from({ length: n }, (_, i) =>
    normalizeDirectoryEntry(`${prefix}${i}`, { displayName: `${prefix}${i}`, clubMember })
  );

describe('mixDirectoryEntries', () => {
  it('uses the named constants', () => {
    expect(DIRECTORY_MEMBER_HEAD_SHARE).toBe(0.3);
    expect(DIRECTORY_MEMBER_HEAD_CHANCE).toBe(0.6);
  });

  it('fills about 60 % of the first 30 % with members, and keeps everybody', () => {
    const list = [...people(500, true, 'm'), ...people(500, false, 'n')];
    const mixed = mixDirectoryEntries(list, seeded(42));
    expect(mixed).toHaveLength(1000);
    expect(new Set(mixed.map((e) => e.uid)).size).toBe(1000);
    const head = mixed.slice(0, 300);
    const share = head.filter((e) => e.clubMember).length / head.length;
    expect(share).toBeGreaterThan(0.55);
    expect(share).toBeLessThan(0.65);
  });

  it('follows the coin per head place and lets an empty pool hand over', () => {
    const list = [...people(2, true, 'm'), ...people(8, false, 'n')];
    // random 0 < 0.6: every head place wants a member; 3 places, only 2 members.
    const head = mixDirectoryEntries(list, () => 0).slice(0, 3);
    expect(head.map((e) => e.clubMember)).toEqual([true, true, false]);
    // random 0.99 >= 0.6: no head place goes to a member.
    const noMembers = mixDirectoryEntries(list, () => 0.99).slice(0, 3);
    expect(noMembers.every((e) => !e.clubMember)).toBe(true);
  });

  it('works with only members, only non-members and an empty list', () => {
    const onlyMembers = people(5, true, 'm');
    const onlyOthers = people(5, false, 'n');
    const uids = (l: { uid: string }[]) => l.map((e) => e.uid).sort();
    expect(uids(mixDirectoryEntries(onlyMembers, seeded(1)))).toEqual(uids(onlyMembers));
    expect(uids(mixDirectoryEntries(onlyOthers, seeded(1)))).toEqual(uids(onlyOthers));
    expect(mixDirectoryEntries([], seeded(1))).toEqual([]);
  });
});

describe('shuffleDirectoryEntries', () => {
  it('keeps the order stable per ranks map while filtering and does not mutate', () => {
    const list = [...people(4, true, 'm'), ...people(6, false, 'n')];
    const before = list.map((e) => e.uid);
    const ranks = new Map();
    const full = shuffleDirectoryEntries(list, ranks, seeded(7)).map((e) => e.uid);
    expect(list.map((e) => e.uid)).toEqual(before);
    // Filtering keeps the relative order (ranks, not places), no re-draw.
    const subset = list.filter((_, i) => i % 2 === 0);
    const filtered = shuffleDirectoryEntries(subset, ranks, () => {
      throw new Error('must not draw again');
    }).map((e) => e.uid);
    expect(filtered).toEqual(full.filter((uid) => filtered.includes(uid)));
    expect(shuffleDirectoryEntries(list, ranks).map((e) => e.uid)).toEqual(full);
  });

  it('draws the mix over the pool when the first call is already filtered', () => {
    const list = [...people(3, true, 'm'), ...people(3, false, 'n')];
    const ranks = new Map();
    shuffleDirectoryEntries(list.slice(0, 2), ranks, seeded(3), list);
    expect(ranks.size).toBe(6);
  });

  it('appends entries that arrive later after the existing ranks', () => {
    const list = people(3, false, 'n');
    const ranks = new Map();
    const first = shuffleDirectoryEntries(list, ranks, seeded(5)).map((e) => e.uid);
    const late = normalizeDirectoryEntry('late', { displayName: 'Late', clubMember: true });
    const next = shuffleDirectoryEntries([...list, late], ranks, seeded(6)).map((e) => e.uid);
    expect(next).toEqual([...first, 'late']);
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

describe('formatBioPreview', () => {
  it('turns a line break into ". "', () => {
    expect(formatBioPreview('hi, ich bin Sandra\nYogalehrerin, Bewegungsmensch')).toBe(
      'hi, ich bin Sandra. Yogalehrerin, Bewegungsmensch'
    );
  });
  it('adds no period after existing punctuation', () => {
    expect(formatBioPreview('Hallo.\nWelt!\r\nOk?\nJa:\nNein;\nEnde')).toBe(
      'Hallo. Welt! Ok? Ja: Nein; Ende'
    );
  });
  it('collapses blank lines and whitespace', () => {
    expect(formatBioPreview('A  \n\n \nB  \n')).toBe('A. B');
  });
  it('handles non-strings', () => {
    expect(formatBioPreview(undefined)).toBe('');
  });
});

describe('directory card bio from the saved profile', () => {
  // The profile editor saves one <p> per line; `bio` is stored as its plain text.
  const savedProfile = (bioHtml: string) => ({
    slug: 'sandra',
    displayName: 'Sandra',
    directoryCategories: ['Yoga'],
    bioHtml,
    bio: stripHtml(bioHtml).trim(),
  });

  it('keeps paragraph and <br> breaks as ". " in the preview', () => {
    const e = normalizeDirectoryEntry(
      'u1',
      savedProfile(
        '<p>hi, ich bin Sandra</p><p>Yogalehrerin, Bewegungsmensch und Naturverbundene.</p><p>Tom &amp; Jerry<br>Ende</p>'
      )
    );
    expect(formatBioPreview(e.bio)).toBe(
      'hi, ich bin Sandra. Yogalehrerin, Bewegungsmensch und Naturverbundene. Tom & Jerry. Ende'
    );
  });

  it('shows the Feuerplatz name only when the public doc carries it', () => {
    expect(normalizeDirectoryEntry('u3', { fireplaceLabel: 'Dornbirn' }).fireplaceLabel).toBe(
      'Dornbirn'
    );
    expect(normalizeDirectoryEntry('u3', { bio: 'x' }).fireplaceLabel).toBe('');
  });

  it('falls back to plain bio when there is no bioHtml', () => {
    expect(normalizeDirectoryEntry('u2', { bio: 'Nur Text' }).bio).toBe('Nur Text');
  });
});
