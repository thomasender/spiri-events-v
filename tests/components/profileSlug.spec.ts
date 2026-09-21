import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collectionGroup: vi.fn((_, name) => ({ name })),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
}));

vi.mock('../../src/lib/firebase', () => ({
  db: {},
}));

import { slugifyName } from '../../src/lib/slug';

describe('slugifyName', () => {
  it('lowercases and dashes spaces', () => {
    expect(slugifyName('Anna Schmidt')).toBe('anna-schmidt');
  });

  it('collapses multiple separators into one', () => {
    expect(slugifyName('Anna  --  Schmidt')).toBe('anna-schmidt');
    expect(slugifyName('Anna   Schmidt')).toBe('anna-schmidt');
  });

  it('strips leading and trailing separators', () => {
    expect(slugifyName('--Anna Schmidt--')).toBe('anna-schmidt');
  });

  it('replaces German umlauts with ASCII digraphs', () => {
    expect(slugifyName('Jörg Müller')).toBe('joerg-mueller');
    expect(slugifyName('Äpfel über')).toBe('aepfel-ueber');
    expect(slugifyName('Straße')).toBe('strasse');
  });

  it('removes punctuation', () => {
    expect(slugifyName('Anna! Schmidt?')).toBe('anna-schmidt');
    expect(slugifyName('Anna & Co.')).toBe('anna-co');
  });

  it('returns an empty string for empty or nullish input', () => {
    expect(slugifyName('')).toBe('');
    expect(slugifyName(null)).toBe('');
    expect(slugifyName(undefined)).toBe('');
  });
});
