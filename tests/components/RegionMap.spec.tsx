import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('has no Germany view while no Kulturregion has districts', () => {
    render(<RegionMap regions={regions} activeSlugs={new Set()} onChoose={() => {}} />);
    expect(screen.queryByTestId('region-map-view-de')).not.toBeInTheDocument();
  });

  it('draws Germany from the Kulturregionen with their current names', async () => {
    const onChoose = vi.fn();
    const withCulture = [
      ...regions,
      { slug: 'franken', name: 'Frankenland', country: 'DE', home: false },
    ];
    const { container } = render(
      <RegionMap regions={withCulture} activeSlugs={new Set()} onChoose={onChoose} />
    );
    fireEvent.click(screen.getByTestId('region-map-view-de'));
    const shape = await waitFor(() => {
      const el = container.querySelector('[data-region="franken"]');
      if (!el) throw new Error('map not loaded');
      return el;
    });
    fireEvent.mouseEnter(shape);
    expect(screen.getByTestId('region-map-caption').textContent).toContain('Frankenland');
    fireEvent.click(shape);
    expect(onChoose).toHaveBeenCalledWith('franken');
  });
});
