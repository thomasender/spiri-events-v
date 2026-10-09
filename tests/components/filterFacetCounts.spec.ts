import { describe, it, expect } from 'vitest';
import { computeFacetCounts } from '../../src/utils/filterFacetCounts';

const ref = new Date(2026, 9, 14); // Wed 2026-10-14
const occ = (date: string, category: string, bezirk: string, isOnline = false) => ({
  date,
  category,
  bezirk,
  isOnline,
});

const occurrences = [
  occ('2026-10-14', 'Yoga', 'Dornbirn'),
  occ('2026-10-16', 'Yoga', 'Bregenz'),
  occ('2026-10-17', 'Tanz', 'Dornbirn'),
  occ('2026-10-20', 'Tanz', '', true),
  occ('2026-11-02', 'Yoga', 'Dornbirn'),
];

const base = {
  occurrences,
  monthKey: '2026-10',
  selectedCategories: [] as string[],
  selectedOrte: [] as string[],
  dateFilter: null,
  onlineLocation: 'Online',
  reference: ref,
};

describe('computeFacetCounts', () => {
  it('counts category, Ort and date chips for the visible month', () => {
    const c = computeFacetCounts(base);
    expect(c.category).toEqual({ Yoga: 2, Tanz: 2 });
    expect(c.ort).toEqual({ Dornbirn: 2, Bregenz: 1, Online: 1 });
    expect(c.date.heute).toBe(1);
    expect(c.date.wochenende).toBe(2);
    expect(c.date.aktuelleWoche).toBe(3);
  });

  it("ignores a filter's own selection for its own counts", () => {
    const c = computeFacetCounts({ ...base, selectedCategories: ['Yoga'] });
    expect(c.category).toEqual({ Yoga: 2, Tanz: 2 });
    expect(c.ort).toEqual({ Dornbirn: 1, Bregenz: 1 });
  });

  it('applies the other filters to each facet', () => {
    const c = computeFacetCounts({
      ...base,
      selectedOrte: ['Dornbirn'],
      dateFilter: 'aktuelleWoche',
    });
    expect(c.category).toEqual({ Yoga: 1, Tanz: 1 });
    expect(c.date.aktuelleWoche).toBe(2);
  });

  it('counts date chips across months, not only the visible one', () => {
    const c = computeFacetCounts({ ...base, monthKey: '2026-11' });
    expect(c.category).toEqual({ Yoga: 1 });
    expect(c.date.heute).toBe(1);
  });
});
