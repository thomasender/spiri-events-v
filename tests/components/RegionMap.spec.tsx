import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegionMap from '../../src/components/RegionMap';
import { REGION_MAP } from '../../src/data/regionMap';
import landkreisMap from '../../src/data/landkreisMap.json';

const AT = [
  'vorarlberg',
  'tirol',
  'salzburg',
  'kaernten',
  'steiermark',
  'oberoesterreich',
  'niederoesterreich',
  'wien',
  'burgenland',
];
const CH_START = REGION_MAP.regions.findIndex((r: { id: string }) => r.id === 'zuerich');
const countryOf = (slug: string) => {
  if (AT.includes(slug)) return 'AT';
  const i = REGION_MAP.regions.findIndex((r: { id: string }) => r.id === slug);
  return i >= CH_START ? 'CH' : 'DE';
};
const regions = REGION_MAP.regions.map((r: { id: string }) => ({
  slug: r.id,
  name: `Name ${r.id}`,
}));

describe('RegionMap', () => {
  it('draws no permanent region names, only on hover', () => {
    const { container } = render(
      <RegionMap regions={regions} activeSlugs={new Set()} onChoose={() => {}} />
    );
    // Only the soft country names are permanent; a region's name never is.
    container
      .querySelectorAll('svg text')
      .forEach((t) => expect(t.textContent).not.toContain('Name '));
    const first = REGION_MAP.regions[0].id;
    expect(screen.getByTestId('region-map-caption').textContent).not.toContain('Name ');
    fireEvent.mouseEnter(container.querySelector(`[data-region="${first}"]`)!);
    expect(screen.getByTestId('region-map-caption').textContent).toContain(`Name ${first}`);
    fireEvent.mouseLeave(container.querySelector(`[data-region="${first}"]`)!);
    expect(screen.getByTestId('region-map-caption').textContent).not.toContain('Name ');
  });

  it('is one map without a separate Germany view, and labels each country softly', () => {
    const { container } = render(
      <RegionMap
        regions={regions.map((r: { slug: string }) => ({ ...r, country: countryOf(r.slug) }))}
        activeSlugs={new Set()}
        onChoose={() => {}}
      />
    );
    expect(screen.queryByTestId('region-map-view-de')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Kartenausschnitt' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    const names = [...container.querySelectorAll('text.region-map-country')].map(
      (t) => t.textContent
    );
    expect(names.sort()).toEqual(['Deutschland', 'Schweiz', 'Österreich']);
  });

  it('draws Germany from the Landkreise with the current names and assignment', async () => {
    const onChoose = vi.fn();
    // Roth was moved from Franken to the renamed Tauberfranken: it is drawn in it.
    const withCulture = [
      ...regions.map((r: { slug: string }) => ({ ...r, country: countryOf(r.slug) })),
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
    const shape = await waitFor(() => {
      const el = container.querySelector('path[data-region="tauberfranken"]');
      if (!el) throw new Error('map not loaded');
      return el;
    });
    const roth = (landkreisMap.districts as Record<string, { d: string }>)['DE|Roth'].d;
    expect(shape.getAttribute('d')).toBe(roth);
    // Same map: Austria and Switzerland stay, the German Bundesländer give way to the Kulturregionen.
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('path[data-region="vorarlberg"]')).toBeInTheDocument();
    expect(container.querySelector('path[data-region="bayern"]')).not.toBeInTheDocument();
    expect(shape.closest('g[data-testid="region-map-de"]')!.getAttribute('transform')).toContain(
      'matrix('
    );
    expect(container.querySelector('path[data-region="franken"]')!.getAttribute('d')).not.toContain(
      roth
    );
    fireEvent.mouseEnter(shape);
    expect(screen.getByTestId('region-map-caption').textContent).toContain('Taubertal');
    fireEvent.click(shape);
    expect(onChoose).toHaveBeenCalledWith('tauberfranken');
  });
});
