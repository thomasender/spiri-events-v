import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_REGION_CONTEXT, RegionContext } from '../../src/hooks/useRegion';
import { mergeRegions } from '../../src/utils/regions';
import SpendenPage from '../../src/pages/SpendenPage';

vi.mock('react-helmet-async', () => ({
  Helmet: () => null,
  HelmetProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../src/components/DonationBlock', () => ({
  default: ({ regionId }: { regionId: string }) => (
    <div data-testid="donation-block">{regionId}</div>
  ),
}));

function renderWith(regionId: string, active: string[]) {
  const ctx = {
    ...DEFAULT_REGION_CONTEXT,
    regionId,
    allRegions: mergeRegions(active.map((id) => ({ id, active: true }))),
  };
  return render(
    <RegionContext.Provider value={ctx}>
      <MemoryRouter>
        <SpendenPage />
      </MemoryRouter>
    </RegionContext.Provider>
  );
}

describe('SpendenPage', () => {
  it("counts the donation for the visitor's region and links back to its about page", () => {
    renderWith('tirol', ['tirol']);
    expect(screen.getByTestId('donation-block')).toHaveTextContent('tirol');
    expect(screen.getByRole('link', { name: /Zurück zu/ })).toHaveAttribute(
      'href',
      '/tirol/ueber-uns'
    );
  });

  it('keeps /ueber-uns for Vorarlberg', () => {
    renderWith('vorarlberg', []);
    expect(screen.getByTestId('donation-block')).toHaveTextContent('vorarlberg');
    expect(screen.getByRole('link', { name: /Zurück zu/ })).toHaveAttribute('href', '/ueber-uns');
  });
});
