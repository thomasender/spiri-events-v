import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeRegions } from '../../src/utils/regions';
import { writePlaceSelection } from '../../src/utils/placeSelection';

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

const donateHref = () => screen.getByTestId('footer-donate-link').getAttribute('href');

describe('Footer donation link', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.regions = { regions: mergeRegions([]), loading: false };
  });

  it('points to the #spenden section of the general about page', () => {
    renderAt('/');
    expect(donateHref()).toBe('/ueber-uns#spenden');
    expect(screen.getByTestId('footer-donate-link').textContent).toBe('Den Kalender unterstützen');
  });

  it("points to the region's about page when the visitor is in another region", () => {
    renderAt('/tirol');
    expect(donateHref()).toBe('/tirol/ueber-uns#spenden');
  });

  it('comes first in the footer navigation', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Footer-Navigation' });
    expect(nav.firstElementChild).toBe(screen.getByTestId('footer-donate-link'));
  });
});

describe('Footer "Über uns" link', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
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

  describe('on Impressum / Datenschutz (neutral pages)', () => {
    const twoActive = () => {
      mocks.regions = {
        regions: mergeRegions([{ id: 'steiermark', active: true }]),
        loading: false,
      };
    };
    const openLegal = (name: 'Impressum' | 'Datenschutz') =>
      fireEvent.click(screen.getByRole('link', { name }));

    it('keeps the region the visitor came from, even if the remembered place is elsewhere', () => {
      twoActive();
      writePlaceSelection({ label: 'Bregenz', lat: 47.5, lon: 9.75, regionId: 'vorarlberg' });
      renderAt('/steiermark');
      openLegal('Impressum');
      expect(aboutHref()).toBe('/steiermark/ueber-uns');
      openLegal('Datenschutz');
      expect(aboutHref()).toBe('/steiermark/ueber-uns');
    });

    it('keeps a region that is not open yet', () => {
      twoActive();
      renderAt('/tirol');
      openLegal('Datenschutz');
      expect(aboutHref()).toBe('/tirol/ueber-uns');
    });

    it('keeps the general page after a combined view', () => {
      twoActive();
      renderAt('/alle-tribes');
      openLegal('Impressum');
      expect(aboutHref()).toBe('/ueber-uns');
    });

    it('survives a reload of the neutral page', () => {
      twoActive();
      renderAt('/steiermark').unmount();
      renderAt('/impressum');
      expect(aboutHref()).toBe('/steiermark/ueber-uns');
    });

    it('stays /ueber-uns while Vorarlberg is the only open region (dark launch)', () => {
      renderAt('/tirol');
      openLegal('Impressum');
      expect(aboutHref()).toBe('/ueber-uns');
    });
  });
});
