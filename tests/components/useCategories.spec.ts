import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCategories } from '../../src/hooks/useCategories';

const mockUseAllEvents = vi.hoisted(() => ({ events: [] }));

vi.mock('../../src/hooks/useEvents', () => ({
  useAllEvents: () => mockUseAllEvents,
  KATEGORIEN: ['Yoga', 'Breathwork', 'Meditation', 'Tanz', 'Singen', 'Soundhealing', 'Sonstiges'],
}));

beforeEach(() => {
  mockUseAllEvents.events = [];
});

describe('useCategories', () => {
  it('returns the seed categories when no events exist', () => {
    const { result } = renderHook(() => useCategories());
    expect(result.current).toEqual([
      'Breathwork',
      'Meditation',
      'Singen',
      'Sonstiges',
      'Soundhealing',
      'Tanz',
      'Yoga',
    ]);
  });

  it('merges in categories from events', () => {
    mockUseAllEvents.events = [{ category: 'Pilates' }, { category: 'Qi Gong' }];
    const { result } = renderHook(() => useCategories());
    expect(result.current).toContain('Pilates');
    expect(result.current).toContain('Qi Gong');
    expect(result.current).toContain('Yoga');
  });

  it('deduplicates case-sensitively while keeping original casing', () => {
    mockUseAllEvents.events = [
      { category: 'Yoga' },
      { category: 'Pilates' },
      { category: 'pilates' },
    ];
    const { result } = renderHook(() => useCategories());
    const occurrences = result.current.filter((c) => c.toLowerCase() === 'pilates');
    expect(occurrences).toHaveLength(2);
    expect(result.current).toContain('Pilates');
    expect(result.current).toContain('pilates');
  });

  it('ignores events without a category', () => {
    mockUseAllEvents.events = [{ category: '' }, { category: null }, {}];
    const { result } = renderHook(() => useCategories());
    expect(result.current).toEqual([
      'Breathwork',
      'Meditation',
      'Singen',
      'Sonstiges',
      'Soundhealing',
      'Tanz',
      'Yoga',
    ]);
  });

  it('sorts the result using German collation', () => {
    mockUseAllEvents.events = [{ category: 'Äpfel' }, { category: 'Banane' }];
    const { result } = renderHook(() => useCategories());
    const idxA = result.current.indexOf('Äpfel');
    const idxB = result.current.indexOf('Banane');
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThan(idxA);
  });
});
