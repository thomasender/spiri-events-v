import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  normalizeTitle,
  titleSimilarity,
  findDuplicateCandidates,
} from '../../src/utils/duplicateEvents';

const mockFirestore = vi.hoisted(() => ({ getDocs: vi.fn() }));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn(() => ({})),
    query: vi.fn(() => ({})),
    where: vi.fn(() => ({})),
    getDocs: mockFirestore.getDocs,
  };
});
vi.mock('../../src/lib/firebase', () => ({ db: {} }));

import { useDuplicateCheck } from '../../src/hooks/useDuplicateCheck';

const draft = {
  title: 'Kakaozeremonie mit Anna',
  date: '2026-12-05',
  time: '19:00',
  city: 'Dornbirn',
  place: 'Marktplatz 3',
  isOnline: false,
  recurrence: 'none',
};

const existing = (over = {}) => ({
  id: 'e1',
  status: 'approved',
  title: 'Kakaozeremonie mit Anna',
  date: '2026-12-05',
  time: '19:00',
  city: 'Dornbirn',
  place: 'Marktplatz 3',
  isOnline: false,
  ...over,
});

describe('normalizeTitle / titleSimilarity', () => {
  it('folds case, umlauts, special characters and filler words', () => {
    expect(normalizeTitle('Tanz & Klänge – der Frühling!')).toEqual([
      'tanz',
      'klaenge',
      'fruehling',
    ]);
    expect(titleSimilarity('Frühlings-Fest', 'FRUEHLINGS FEST')).toBe(1);
  });

  it('scores a slightly different title high and an unrelated one low', () => {
    expect(titleSimilarity('Kakaozeremonie mit Anna', 'Kakaozeremonie')).toBeGreaterThanOrEqual(
      0.6
    );
    expect(titleSimilarity('Kakaozeremonie mit Anna', 'Yoga für Anfänger')).toBe(0);
    expect(titleSimilarity('', 'Yoga')).toBe(0);
  });
});

describe('findDuplicateCandidates', () => {
  it('finds the same event with a slightly different title', () => {
    const hits = findDuplicateCandidates(draft, [existing({ title: 'Kakao-Zeremonie mit Anna!' })]);
    expect(hits).toHaveLength(1);
    expect(hits[0].event.id).toBe('e1');
  });

  it('ignores another day', () => {
    expect(findDuplicateCandidates(draft, [existing({ date: '2026-12-06' })])).toEqual([]);
  });

  it('matches a series through one of its dates', () => {
    const series = {
      ...draft,
      recurrence: 'custom',
      date: '2026-12-01',
      customDates: ['2026-12-05'],
    };
    expect(findDuplicateCandidates(series, [existing()])).toHaveLength(1);
  });

  it('does not match the same title at a clearly different place', () => {
    const other = existing({ city: 'Bregenz', place: 'Seestraße 5' });
    expect(findDuplicateCandidates(draft, [other])).toEqual([]);
    const sameCity = existing({ place: 'Bahnhofstraße 12' });
    expect(findDuplicateCandidates(draft, [sameCity])).toEqual([]);
  });

  it('matches a different title at the same place within an hour', () => {
    const hit = existing({ title: 'Abendkreis', time: '19:30' });
    expect(findDuplicateCandidates(draft, [hit])).toHaveLength(1);
  });

  it('does not match a similar title with a clearly different time', () => {
    expect(findDuplicateCandidates(draft, [existing({ time: '10:00' })])).toEqual([]);
  });

  it('does not match another place at the same time with a different title', () => {
    const hit = existing({ title: 'Abendkreis', city: 'Feldkirch', place: 'Gasse 1' });
    expect(findDuplicateCandidates(draft, [hit])).toEqual([]);
  });

  it('leaves out the own event and events that are not approved', () => {
    const own = existing({ id: 'mine' });
    const pending = existing({ id: 'p', status: 'pending' });
    expect(findDuplicateCandidates({ ...draft, id: 'mine' }, [own, pending])).toEqual([]);
  });

  it('sorts best first and returns at most three', () => {
    const events = [
      existing({ id: 'a', title: 'Kakaozeremonie', time: '19:45' }),
      existing({ id: 'b' }),
      existing({ id: 'c', title: 'Kakaozeremonie mit Anna und Ben' }),
      existing({ id: 'd', title: 'Kakaozeremonie Anna' }),
    ];
    const hits = findDuplicateCandidates(draft, events);
    expect(hits).toHaveLength(3);
    expect(hits[0].event.id).toBe('b');
  });

  it('returns nothing without a date or events', () => {
    expect(findDuplicateCandidates({ ...draft, date: '' }, [existing()])).toEqual([]);
    expect(findDuplicateCandidates(draft, [])).toEqual([]);
  });
});

describe('useDuplicateCheck', () => {
  beforeEach(() => mockFirestore.getDocs.mockReset());

  it('returns the hits of the approved events of that day', async () => {
    mockFirestore.getDocs.mockResolvedValue({
      docs: [{ id: 'e1', data: () => existing({ id: undefined }) }],
    });
    const { result } = renderHook(() => useDuplicateCheck());
    const hits = await result.current.findDuplicates(draft);
    expect(hits).toHaveLength(1);
    expect(mockFirestore.getDocs).toHaveBeenCalledTimes(1);
  });

  it('returns [] instead of throwing when the query fails', async () => {
    mockFirestore.getDocs.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useDuplicateCheck());
    await expect(result.current.findDuplicates(draft)).resolves.toEqual([]);
  });
});
