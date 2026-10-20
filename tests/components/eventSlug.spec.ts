import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory "events collection" the mocked Firestore queries run against.
type FakeEvent = { id: string; slug: string; status: string; createdBy: string };
let fakeEvents: FakeEvent[] = [];

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_, name) => ({ name })),
  collectionGroup: vi.fn((_, name) => ({ name })),
  query: vi.fn((_col, ...filters) => filters),
  where: vi.fn((field, _op, value) => ({ field, value })),
  getDocs: vi.fn(async (filters: { field: keyof FakeEvent; value: string }[] = []) => {
    const docs = fakeEvents
      .filter((e) => filters.every((f) => e[f.field] === f.value))
      .map((e) => ({ id: e.id, data: () => e }));
    return { docs, empty: docs.length === 0 };
  }),
}));

vi.mock('../../src/lib/firebase', () => ({
  db: {},
}));

import {
  generateEventSlug,
  eventSlugPlace,
  planMissingEventSlugs,
} from '../../src/lib/slug-helpers';
import { findUniqueSlug, resolveSlugForApproval } from '../../src/lib/slug';
import { findFreeSlug, slugBase } from '../../functions/src/eventSlug';

describe('generateEventSlug', () => {
  it('joins title, category, "in", place, and date with hyphens', () => {
    expect(generateEventSlug('Lasst uns singen', 'Singkreis', 'Dornbirn', '2026-11-02')).toBe(
      'lasst-uns-singen-singkreis-in-dornbirn-20261102'
    );
  });

  it('writes "veranstaltung" when category is missing', () => {
    expect(generateEventSlug('Yoga Workshop', '', 'Bregenz', '2026-09-15')).toBe(
      'yoga-workshop-veranstaltung-in-bregenz-20260915'
    );
  });

  it('writes "veranstaltung" instead of the category "Sonstiges"', () => {
    expect(generateEventSlug('Vollmondfeier', 'Sonstiges', 'Hohenems', '2026-09-15')).toBe(
      'vollmondfeier-veranstaltung-in-hohenems-20260915'
    );
  });

  it('falls back to "online" when bezirk is missing', () => {
    expect(generateEventSlug('Online Yoga', 'Yoga', '', '2026-09-15')).toBe(
      'online-yoga-yoga-in-online-20260915'
    );
  });

  it('uses both fallbacks for events without category and bezirk', () => {
    expect(generateEventSlug('Offene Meditation', '', '', '2026-09-15')).toBe(
      'offene-meditation-veranstaltung-in-online-20260915'
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

describe('eventSlugPlace', () => {
  it('uses the Ort (city) rather than the Bezirk', () => {
    expect(eventSlugPlace({ city: ' Hohenems ', bezirk: 'Dornbirn', isOnline: false })).toBe(
      'Hohenems'
    );
    expect(
      generateEventSlug(
        'Yoga',
        'Yoga',
        eventSlugPlace({ city: 'Hohenems', bezirk: 'Dornbirn' }),
        '2026-09-15'
      )
    ).toBe('yoga-yoga-in-hohenems-20260915');
  });

  it('falls back to the Bezirk when the event has no Ort', () => {
    expect(eventSlugPlace({ city: '', bezirk: 'Dornbirn' })).toBe('Dornbirn');
  });

  it('gives online events the "online" place, even with a stale city', () => {
    const place = eventSlugPlace({ isOnline: true, city: 'Hohenems', bezirk: 'Dornbirn' });
    expect(generateEventSlug('Yoga', 'Yoga', place, '2026-09-15')).toBe(
      'yoga-yoga-in-online-20260915'
    );
  });
});

describe('planMissingEventSlugs (deploy slug migration)', () => {
  it('never rewrites an existing slug, even in an older format', () => {
    const events = [
      {
        id: 'old',
        data: {
          title: 'Vollmondfeier',
          category: 'Sonstiges',
          city: 'Hohenems',
          bezirk: 'Dornbirn',
          date: '2026-09-15',
          slug: 'vollmondfeier-sonstiges-in-dornbirn-20260915',
        },
      },
    ];
    expect(planMissingEventSlugs(events)).toEqual([]);
  });

  it('gives events without a slug one in the new format, avoiding taken slugs', () => {
    const data = { title: 'Yoga', category: 'Yoga', city: 'Hohenems', date: '2026-09-15' };
    const events = [
      { id: 'a', data: { ...data, slug: 'yoga-yoga-in-hohenems-20260915' } },
      { id: 'b', data },
      { id: 'c', data },
    ];
    expect(planMissingEventSlugs(events)).toEqual([
      { id: 'b', slug: 'yoga-yoga-in-hohenems-20260915-2' },
      { id: 'c', slug: 'yoga-yoga-in-hohenems-20260915-3' },
    ]);
  });
});

describe('event slug uniqueness', () => {
  const BASE = 'yoga-yoga-in-bregenz-20260915';

  beforeEach(() => {
    fakeEvents = [];
  });

  it("does not reuse the slug of the creator's own draft", async () => {
    fakeEvents = [{ id: 'd1', slug: BASE, status: 'draft', createdBy: 'u1' }];
    expect(await findUniqueSlug('Yoga', 'Yoga', 'Bregenz', '2026-09-15', 'u1')).toBe(`${BASE}-2`);
  });

  it('skips slugs used by approved events and by own pending submissions', async () => {
    fakeEvents = [
      { id: 'a1', slug: BASE, status: 'approved', createdBy: 'other' },
      { id: 'p1', slug: `${BASE}-2`, status: 'pending', createdBy: 'u1' },
    ];
    expect(await findUniqueSlug('Yoga', 'Yoga', 'Bregenz', '2026-09-15', 'u1')).toBe(`${BASE}-3`);
  });

  it('keeps the slug on approval when no other approved event owns it', async () => {
    fakeEvents = [
      { id: 'e1', slug: BASE, status: 'pending', createdBy: 'u1' },
      { id: 'e2', slug: BASE, status: 'draft', createdBy: 'u2' },
    ];
    expect(await resolveSlugForApproval('e1', BASE)).toBe(BASE);
  });

  it('gives an event a free slug on approval when an approved event already owns it', async () => {
    fakeEvents = [
      { id: 'a1', slug: BASE, status: 'approved', createdBy: 'u2' },
      { id: 'x1', slug: `${BASE}-2`, status: 'draft', createdBy: 'u3' },
      { id: 'e1', slug: BASE, status: 'pending', createdBy: 'u1' },
    ];
    expect(await resolveSlugForApproval('e1', BASE)).toBe(`${BASE}-3`);
  });

  it('server-side: keeps a free slug and renames a taken one after the date suffix', async () => {
    const taken = new Set([BASE, `${BASE}-2`]);
    const isTaken = async (s: string) => taken.has(s);
    expect(await findFreeSlug('frei-yoga-in-bregenz-20260915', isTaken)).toBe(
      'frei-yoga-in-bregenz-20260915'
    );
    expect(await findFreeSlug(`${BASE}-2`, isTaken)).toBe(`${BASE}-3`);
    expect(slugBase(`${BASE}-12`)).toBe(BASE);
    expect(slugBase(BASE)).toBe(BASE);
  });
});
