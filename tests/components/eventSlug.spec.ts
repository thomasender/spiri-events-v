import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_, name) => ({ name })),
  collectionGroup: vi.fn((_, name) => ({ name })),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
}));

vi.mock('../../src/lib/firebase', () => ({
  db: {},
}));

import { generateEventSlug } from '../../src/lib/slug-helpers';

describe('generateEventSlug', () => {
  it('joins title, category, "in", bezirk, and date with hyphens', () => {
    expect(generateEventSlug('Lasst uns singen', 'Singkreis', 'Dornbirn', '2026-11-02')).toBe(
      'lasst-uns-singen-singkreis-in-dornbirn-20261102'
    );
  });

  it('falls back to "sonstiges" when category is missing', () => {
    expect(generateEventSlug('Yoga Workshop', '', 'Bregenz', '2026-09-15')).toBe(
      'yoga-workshop-sonstiges-in-bregenz-20260915'
    );
  });

  it('falls back to "online" when bezirk is missing', () => {
    expect(generateEventSlug('Online Yoga', 'Yoga', '', '2026-09-15')).toBe(
      'online-yoga-yoga-in-online-20260915'
    );
  });

  it('uses both fallbacks for events without category and bezirk', () => {
    expect(generateEventSlug('Offene Meditation', '', '', '2026-09-15')).toBe(
      'offene-meditation-sonstiges-in-online-20260915'
    );
  });

  it('strips surrounding separators and collapses runs in every part', () => {
    expect(generateEventSlug('  Yoga   Workshop  ', '  Yoga  ', '  Dornbirn  ', '2026-09-15')).toBe(
      'yoga-workshop-yoga-in-dornbirn-20260915'
    );
  });

  it('replaces German umlauts with ASCII digraphs instead of stripping them (y0sPCm0P)', () => {
    expect(generateEventSlug('Hörst du den Käfer?', 'Kultur', 'Götzis', '2026-09-15')).toBe(
      'hoerst-du-den-kaefer-kultur-in-goetzis-20260915'
    );
  });

  it('handles uppercase German umlaute at the start of a word', () => {
    expect(generateEventSlug('Äpfel über die Alpen', 'Yoga', 'Ölberg', '2026-09-15')).toBe(
      'aepfel-ueber-die-alpen-yoga-in-oelberg-20260915'
    );
  });

  it('expands & to "und" inside the title (y0sPCm0P)', () => {
    expect(generateEventSlug('Yoga & Meditation', 'Yoga', 'Dornbirn', '2026-09-15')).toBe(
      'yoga-und-meditation-yoga-in-dornbirn-20260915'
    );
    expect(generateEventSlug('Körper & Geist', 'Yoga', 'Bregenz', '2026-09-15')).toBe(
      'koerper-und-geist-yoga-in-bregenz-20260915'
    );
  });

  it('strips punctuation that has no mapping (e.g. ?, !, .)', () => {
    expect(generateEventSlug('Workshop!', 'Yoga', 'Bregenz', '2026-09-15')).toBe(
      'workshop-yoga-in-bregenz-20260915'
    );
  });
});
