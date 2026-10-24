import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeRegions } from '../../src/utils/regions';

const mocks = vi.hoisted(() => ({
  regions: { regions: [] as unknown[], loading: false },
}));

vi.mock('../../src/hooks/useRegions', () => ({ useRegions: () => mocks.regions }));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ role: null, user: null }) }));
vi.mock('react-helmet-async', () => ({
  Helmet: () => null,
  HelmetProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../src/hooks/useRegionEventCount', () => ({ useRegionEventCount: () => 0 }));
vi.mock('../../src/pages/AboutPage', async () => {
  const { useRegion } = await import('../../src/hooks/useRegion');
  return {
    default: function AboutStub() {
      const { regionId } = useRegion();
      return <div data-testid="about-page">{regionId}</div>;
    },
  };
});

import Footer from '../../src/components/Footer';
import RegionProvider from '../../src/components/RegionProvider';
import { RegionAboutRoute } from '../../src/components/RegionRoutes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RegionProvider>
        <Routes>
          <Route path="/:regionSlug/ueber-uns" element={<RegionAboutRoute />} />
          <Route path="*" element={<div />} />
        </Routes>
        <Footer />
      </RegionProvider>
    </MemoryRouter>
  );
}

const aboutHref = () => screen.getByRole('link', { name: 'Über uns' }).getAttribute('href');

describe('Footer "Über uns" link', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.regions = { regions: mergeRegions([]), loading: false };
  });

  it('links to the coming-soon region the visitor is in', () => {
    renderAt('/tirol');
    expect(aboutHref()).toBe('/tirol/ueber-uns');
  });

  it("renders that region's about page, not the coming-soon page", () => {
    renderAt('/tirol/ueber-uns');
    expect(screen.getByTestId('about-page').textContent).toBe('tirol');
    expect(aboutHref()).toBe('/tirol/ueber-uns');
  });

  it('keeps the general page on combined views, also not yet open ones', () => {
    renderAt('/deutschland');
    expect(aboutHref()).toBe('/ueber-uns');
  });

  it('keeps /ueber-uns for Vorarlberg while it is the only open region', () => {
    renderAt('/');
    expect(aboutHref()).toBe('/ueber-uns');
  });
});
