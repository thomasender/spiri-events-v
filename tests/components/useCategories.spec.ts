import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCategories } from '../../src/hooks/useCategories';

const mockRegistry = vi.hoisted(() => ({ categories: [] }));

vi.mock('../../src/hooks/useCategoryRegistry', () => ({
  useCategoryRegistry: () => mockRegistry,
}));

beforeEach(() => {
  mockRegistry.categories = [];
});

const SEED_NAMES = [
  'Breathwork',
  'Meditation',
  'Singen',
  'Sonstiges',
  'Soundhealing',
  'Tanz',
  'Yoga',
];

describe('useCategories', () => {
  it('returns an empty list when the registry is empty', () => {
    const { result } = renderHook(() => useCategories());
    expect(result.current).toEqual([]);
  });

  it('returns registry category names in the registry order', () => {
    mockRegistry.categories = [
      { id: 'a', name: 'Ayurveda' },
      { id: 'm', name: 'Meditation' },
      { id: 'z', name: 'Zumba' },
    ];
    const { result } = renderHook(() => useCategories());
    expect(result.current).toEqual(['Ayurveda', 'Meditation', 'Zumba']);
  });

  it('mirrors the registry names including duplicates from case differences', () => {
    mockRegistry.categories = [
      { id: 'yoga', name: 'Yoga' },
      { id: 'yoga-flow', name: 'yoga' },
    ];
    const { result } = renderHook(() => useCategories());
    expect(result.current).toContain('Yoga');
    expect(result.current).toContain('yoga');
    expect(result.current).toHaveLength(2);
  });
});
