import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({}));
vi.mock('../../src/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('../../src/hooks/useRegionMigrationMarker', () => ({
  useRegionMigrationComplete: () => true,
}));
vi.mock('../../src/hooks/useRegions', () => ({ useRegions: () => ({ regions: [] }) }));

import { DEFAULT_REGION_CONTEXT, RegionContext, useRegionEvents } from '../../src/hooks/useRegion';
import { useRegionEventQueryPlan } from '../../src/hooks/useEvents';
import { STATIC_REGIONS, mergeRegions } from '../../src/utils/regions';
import { activeRegions } from '../../src/utils/regionRouting';

const REGIONS = mergeRegions([
  { id: 'tirol', active: true },
  { id: 'bayern', active: true },
]);

const EVENTS = [
  { id: 'bregenz', regionId: 'vorarlberg', lat: 47.503, lng: 9.747 },
  { id: 'lindau', regionId: 'bayern', lat: 47.55, lng: 9.69 },
  { id: 'innsbruck', regionId: 'tirol', lat: 47.269, lng: 11.404 },
  { id: 'old', regionId: 'vorarlberg' },
  { id: 'online', regionId: 'tirol', isOnline: true },
];

function wrap(value: Record<string, unknown>) {
  const full = {
    ...DEFAULT_REGION_CONTEXT,
    regions: activeRegions(REGIONS),
    allRegions: REGIONS,
    regionId: 'vorarlberg',
    ...value,
  };
  return ({ children }: { children: ReactNode }) =>
    createElement(RegionContext.Provider, { value: full as never }, children);
}

const BREGENZ_25 = { lat: 47.503, lon: 9.747, km: 25 };

describe('useRegionEvents with a radius', () => {
  it('shows everything within the radius, from any active region, and keeps old events of the region', () => {
    const { result } = renderHook(() => useRegionEvents(EVENTS), {
      wrapper: wrap({ radiusFilter: BREGENZ_25 }),
    });
    expect(result.current.map((e) => e.id)).toEqual(['bregenz', 'lindau', 'old', 'online']);
  });

  it('a bigger radius reaches Innsbruck as well', () => {
    const { result } = renderHook(() => useRegionEvents(EVENTS), {
      wrapper: wrap({ radiusFilter: { ...BREGENZ_25, km: 150 } }),
    });
    expect(result.current.map((e) => e.id)).toContain('innsbruck');
  });

  it('without a radius it is the plain region filter (Vorarlberg + online)', () => {
    const { result } = renderHook(() => useRegionEvents(EVENTS), {
      wrapper: wrap({ radiusFilter: null }),
    });
    expect(result.current.map((e) => e.id)).toEqual(['bregenz', 'old', 'online']);
  });

  it('favourites ignore the radius and use every active region', () => {
    const { result } = renderHook(() => useRegionEvents(EVENTS, { allActive: true }), {
      wrapper: wrap({ radiusFilter: BREGENZ_25 }),
    });
    expect(result.current).toHaveLength(EVENTS.length);
  });

  it('events of regions that are not open never pass, whatever the radius', () => {
    const { result } = renderHook(() => useRegionEvents(EVENTS), {
      wrapper: wrap({
        regions: activeRegions(STATIC_REGIONS),
        allRegions: STATIC_REGIONS,
        radiusFilter: { ...BREGENZ_25, km: 500 },
      }),
    });
    expect(result.current.map((e) => e.id)).toEqual(['bregenz', 'old']);
  });
});

describe('useRegionEvents: online events only where the organiser is listed', () => {
  const ANCHORED = [
    { id: 'bregenz', regionId: 'vorarlberg' },
    { id: 'online-tirol-only', regionId: 'tirol', isOnline: true, onlineRegionIds: ['tirol'] },
    { id: 'online-nowhere', regionId: 'vorarlberg', isOnline: true, onlineRegionIds: [] },
    { id: 'online-unannotated', regionId: 'tirol', isOnline: true },
  ];

  it('drops online events whose onlineRegionIds miss the region; unannotated ones stay', () => {
    const { result } = renderHook(() => useRegionEvents(ANCHORED), {
      wrapper: wrap({ radiusFilter: null }),
    });
    expect(result.current.map((e) => e.id)).toEqual(['bregenz', 'online-unannotated']);
    const tirol = renderHook(() => useRegionEvents(ANCHORED), {
      wrapper: wrap({ radiusFilter: null, regionId: 'tirol' }),
    });
    expect(tirol.result.current.map((e) => e.id)).toEqual([
      'online-tirol-only',
      'online-unannotated',
    ]);
  });

  it('favourites ignore it', () => {
    const { result } = renderHook(() => useRegionEvents(ANCHORED, { allActive: true }), {
      wrapper: wrap({ radiusFilter: null }),
    });
    expect(result.current).toHaveLength(ANCHORED.length);
  });
});

describe('query plan with a radius', () => {
  it('loads the events of all active regions, not only the current one', () => {
    const { result } = renderHook(() => useRegionEventQueryPlan({ regionScoped: true }), {
      wrapper: wrap({ radiusFilter: BREGENZ_25 }),
    });
    expect(result.current?.mode).toBe('national');
    expect(result.current?.queries[0].constraints).toContainEqual([
      'regionId',
      'in',
      ['vorarlberg', 'tirol', 'bayern'],
    ]);
  });

  it('is the region plan without a radius', () => {
    const { result } = renderHook(() => useRegionEventQueryPlan({ regionScoped: true }), {
      wrapper: wrap({ radiusFilter: null }),
    });
    expect(result.current?.mode).toBe('region');
  });
});
