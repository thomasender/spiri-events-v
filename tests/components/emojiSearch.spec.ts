import { describe, it, expect } from 'vitest';
import {
  buildEmojiIndex,
  exactShortcode,
  findShortcodeToken,
  normalizeSearch,
  replaceToken,
  searchEmojis,
  loadEmojiIndex,
} from '../../src/utils/emojiSearch';

const index = buildEmojiIndex([
  ['🔥', 'Feuer', ['Flamme', 'brennen', 'heiß'], ['fire', 'feuer']],
  ['🙏', 'zusammengelegte Handflächen', ['Gebet', 'beten', 'danke'], ['pray']],
  ['❤️', 'rotes Herz', ['Liebe', 'Herz'], ['heart', 'rotes_herz']],
  ['💖', 'funkelndes Herz', ['Herz', 'funkeln'], ['sparkling_heart']],
  ['🧘', 'Person im Lotossitz', ['Meditation', 'Yoga'], ['person_in_lotus_position']],
  ['😊', 'lächelndes Gesicht mit lächelnden Augen', ['süß', 'Lächeln'], ['blush']],
]);

describe('normalizeSearch', () => {
  it('lowercases and removes umlauts and ß', () => {
    expect(normalizeSearch('  Süß ÄÖÜ Straße ')).toBe('suss aou strasse');
  });
  it('treats underscores like spaces', () => {
    expect(normalizeSearch('rotes_herz')).toBe('rotes herz');
  });
});

describe('searchEmojis', () => {
  it('finds by German name and keyword', () => {
    expect(searchEmojis(index, 'feuer')[0].emoji).toBe('🔥');
    expect(searchEmojis(index, 'beten')[0].emoji).toBe('🙏');
    expect(searchEmojis(index, 'yoga')[0].emoji).toBe('🧘');
  });
  it('works without umlauts and with partial words', () => {
    expect(searchEmojis(index, 'handflachen')[0].emoji).toBe('🙏');
    expect(searchEmojis(index, 'lachel')[0].emoji).toBe('😊');
    expect(searchEmojis(index, 'suss')[0].emoji).toBe('😊');
  });
  it('finds by English shortcode', () => {
    expect(searchEmojis(index, 'fire')[0].emoji).toBe('🔥');
    expect(searchEmojis(index, 'pray')[0].emoji).toBe('🙏');
  });
  it('requires all words and ranks exact matches first', () => {
    const hits = searchEmojis(index, 'herz').map((e) => e.emoji);
    expect(hits).toEqual(['❤️', '💖']);
    expect(searchEmojis(index, 'rotes herz').map((e) => e.emoji)).toEqual(['❤️']);
    expect(searchEmojis(index, 'rotes feuer')).toEqual([]);
  });
  it('returns nothing for an empty query', () => {
    expect(searchEmojis(index, '  ')).toEqual([]);
  });
});

describe('findShortcodeToken', () => {
  it('detects a shortcode at the caret', () => {
    expect(findShortcodeToken('Hallo :fi')).toEqual({
      start: 6,
      end: 9,
      query: 'fi',
      closed: false,
    });
    expect(findShortcodeToken(':fire')).toMatchObject({ start: 0, query: 'fire' });
  });
  it('marks a closed shortcode', () => {
    expect(findShortcodeToken('x :fire:')).toMatchObject({ query: 'fire', closed: true });
  });
  it('ignores a single colon, times and URLs', () => {
    expect(findShortcodeToken('Hallo :f')).toBeNull();
    expect(findShortcodeToken('um 12:30')).toBeNull();
    expect(findShortcodeToken('https://thetribe.at')).toBeNull();
  });
  it('only looks before the caret', () => {
    expect(findShortcodeToken('Hallo :fire danach', 11)).toMatchObject({ query: 'fire' });
  });
});

describe('exactShortcode and replaceToken', () => {
  it('finds an exact shortcode only', () => {
    expect(exactShortcode(index, 'fire')?.emoji).toBe('🔥');
    expect(exactShortcode(index, 'fir')).toBeNull();
  });
  it('replaces the token with the emoji', () => {
    const token = findShortcodeToken('Hi :fire')!;
    expect(replaceToken('Hi :fire', token, '🔥')).toBe('Hi 🔥');
  });
});

describe('real index', () => {
  it('finds common German terms', async () => {
    const real = await loadEmojiIndex();
    expect(real.length).toBeGreaterThan(1500);
    expect(searchEmojis(real, 'feuer')[0].emoji).toBe('🔥');
    expect(searchEmojis(real, 'fire')[0].emoji).toBe('🔥');
    expect(searchEmojis(real, 'herz').length).toBeGreaterThan(10);
    expect(searchEmojis(real, 'pray')[0].emoji).toBe('🙏');
  });
});
