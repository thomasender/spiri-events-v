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

import { generateSlug } from '../../src/lib/slug';

describe('generateSlug (events)', () => {
  it('joins title, place, and date with hyphens', () => {
    expect(generateSlug('Yoga Workshop', 'Yogastudio Bregenz', '2026-09-15')).toBe(
      'yoga-workshop-yogastudio-bregenz-20260915'
    );
  });

  it('omits empty place and date parts', () => {
    expect(generateSlug('Offene Meditation', '', '')).toBe('offene-meditation');
    expect(generateSlug('Online Yoga', 'Yoga Online', '')).toBe('online-yoga-yoga-online');
  });

  it('strips surrounding separators and collapses runs', () => {
    expect(generateSlug('  Yoga   Workshop  ', '  Yogastudio  ', '2026-09-15')).toBe(
      'yoga-workshop-yogastudio-20260915'
    );
  });

  it('replaces German umlauts with ASCII digraphs instead of stripping them (y0sPCm0P)', () => {
    expect(generateSlug('Hörst du den Käfer?', 'Kulturhaus Götzis', '2026-09-15')).toBe(
      'hoerst-du-den-kaefer-kulturhaus-goetzis-20260915'
    );
  });

  it('handles uppercase German umlauts at the start of a word', () => {
    expect(generateSlug('Äpfel über die Alpen', 'Ölberg Hütte', '2026-09-15')).toBe(
      'aepfel-ueber-die-alpen-oelberg-huette-20260915'
    );
  });

  it('expands & to "und" inside the title (y0sPCm0P)', () => {
    expect(generateSlug('Yoga & Meditation', 'Studio Dornbirn', '2026-09-15')).toBe(
      'yoga-und-meditation-studio-dornbirn-20260915'
    );
    expect(generateSlug('Körper & Geist', 'Räumlichkeit', '2026-09-15')).toBe(
      'koerper-und-geist-raeumlichkeit-20260915'
    );
  });

  it('strips punctuation that has no mapping (e.g. ?, !, .)', () => {
    expect(generateSlug('Workshop!', 'Atelier?', '2026-09-15')).toBe('workshop-atelier-20260915');
  });

  it('returns a date-only slug when title and place are empty', () => {
    expect(generateSlug('', '', '2026-09-15')).toBe('20260915');
  });
});
