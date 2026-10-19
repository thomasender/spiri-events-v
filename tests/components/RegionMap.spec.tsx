import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RegionMap from '../../src/components/RegionMap';
import { REGION_MAP } from '../../src/data/regionMap';

const regions = REGION_MAP.regions.map((r: { id: string }) => ({
  slug: r.id,
  name: `Name ${r.id}`,
}));

describe('RegionMap', () => {
  it('draws no permanent region names, only on hover', () => {
    const { container } = render(
      <RegionMap regions={regions} activeSlugs={new Set()} onChoose={() => {}} />
    );
    expect(container.querySelectorAll('svg text').length).toBe(0);
    const first = REGION_MAP.regions[0].id;
    expect(screen.getByTestId('region-map-caption').textContent).not.toContain('Name ');
    fireEvent.mouseEnter(container.querySelector(`[data-region="${first}"]`)!);
    expect(screen.getByTestId('region-map-caption').textContent).toContain(`Name ${first}`);
    fireEvent.mouseLeave(container.querySelector(`[data-region="${first}"]`)!);
    expect(screen.getByTestId('region-map-caption').textContent).not.toContain('Name ');
  });
});
