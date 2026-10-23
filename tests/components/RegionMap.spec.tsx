import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegionMap from '../../src/components/RegionMap';
import { REGION_MAP } from '../../src/data/regionMap';
import landkreisMap from '../../src/data/landkreisMap.json';

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

  it('draws Germany from the Landkreise with the current names and assignment', async () => {
    const onChoose = vi.fn();
    // Roth was moved from Franken to the renamed Tauberfranken: it is drawn in it.
    const withCulture = [
      ...regions,
      {
        slug: 'franken',
        name: 'Frankenland',
        country: 'DE',
        home: false,
        bezirke: ['Ansbach (Stadt)'],
      },
      { slug: 'tauberfranken', name: 'Taubertal', country: 'DE', home: false, bezirke: ['Roth'] },
    ];
    const { container } = render(
      <RegionMap regions={withCulture} activeSlugs={new Set()} onChoose={onChoose} />
    );
    fireEvent.click(screen.getByTestId('region-map-view-de'));
    const shape = await waitFor(() => {
      const el = container.querySelector('path[data-region="tauberfranken"]');
      if (!el) throw new Error('map not loaded');
      return el;
    });
    const roth = (landkreisMap.districts as Record<string, { d: string }>)['DE|Roth'].d;
    expect(shape.getAttribute('d')).toBe(roth);
    expect(container.querySelector('path[data-region="franken"]')!.getAttribute('d')).not.toContain(
      roth
    );
    fireEvent.mouseEnter(shape);
    expect(screen.getByTestId('region-map-caption').textContent).toContain('Taubertal');
    fireEvent.click(shape);
    expect(onChoose).toHaveBeenCalledWith('tauberfranken');
  });
});
