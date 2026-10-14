import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import type { ReactNode } from 'react';
import Header from '../../src/components/Header';
import Footer from '../../src/components/Footer';
import SeoMeta from '../../src/components/SeoMeta';
import { DEFAULT_REGION_CONTEXT, RegionContext } from '../../src/hooks/useRegion';
import { STATIC_REGIONS, getRegionBySlug } from '../../src/utils/regions';

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, canCreateEvents: true, logout: () => {} }),
}));
vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: null, loading: false, exists: false, save: () => {} }),
}));
vi.mock('../../src/hooks/useUnreadMessageCount', () => ({
  useUnreadMessageCount: () => ({ count: 0, loading: false }),
}));
vi.mock('../../src/hooks/usePwaInstall', () => ({
  usePwaInstall: () => ({
    installAvailable: false,
    isStandalone: false,
    isMobileViewport: false,
    requestInstall: () => {},
  }),
  isIOSDevice: () => false,
}));

// Steiermark visited while Steiermark and Vorarlberg are both active.
const STEIERMARK_CONTEXT = {
  ...DEFAULT_REGION_CONTEXT,
  region: getRegionBySlug('steiermark'),
  regionId: 'steiermark',
  regions: STATIC_REGIONS.filter((r) => ['vorarlberg', 'steiermark'].includes(r.id)),
};

function Wrap({ value, children }: { value?: typeof DEFAULT_REGION_CONTEXT; children: ReactNode }) {
  const inner = value ? (
    <RegionContext.Provider value={value}>{children}</RegionContext.Provider>
  ) : (
    children
  );
  return (
    <HelmetProvider>
      <MemoryRouter>{inner}</MemoryRouter>
    </HelmetProvider>
  );
}

describe('Header subtitle and footer follow the region', () => {
  it('Vorarlberg (one active region): unchanged texts', () => {
    render(
      <Wrap>
        <Header />
        <Footer />
      </Wrap>
    );
    expect(screen.getByText('Dein Vorarlberger Kalender')).toBeInTheDocument();
    expect(screen.getByText('© 2026 tribe Vorarlberg')).toBeInTheDocument();
  });

  it('Steiermark: region subtitle, footer keeps the association name', () => {
    const { container } = render(
      <Wrap value={STEIERMARK_CONTEXT}>
        <Header />
        <Footer />
      </Wrap>
    );
    expect(screen.getByText('Dein steirischer Kalender')).toBeInTheDocument();
    // The footer names the legal entity in every region.
    expect(screen.getByText('© 2026 tribe Vorarlberg')).toBeInTheDocument();
  });
});

describe('SeoMeta title and description follow the region', () => {
  it('Vorarlberg: "Kalender | tribe Vorarlberg" and the legacy description', async () => {
    render(
      <Wrap>
        <SeoMeta title="Kalender" />
      </Wrap>
    );
    await waitFor(() => expect(document.title).toBe('Kalender | tribe Vorarlberg'));
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toMatch(
      /in Vorarlberg - Bregenz/
    );
  });

  it('Steiermark: exact region title, brand and generated description', async () => {
    render(
      <Wrap value={STEIERMARK_CONTEXT}>
        <SeoMeta title="Spirituelle Events Steiermark – The Tribe" exactTitle />
      </Wrap>
    );
    await waitFor(() => expect(document.title).toBe('Spirituelle Events Steiermark – The Tribe'));
    expect(document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')).toBe(
      'The Tribe'
    );
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in der Steiermark.'
    );
  });
});
