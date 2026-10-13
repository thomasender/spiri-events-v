import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATIC_REGIONS, mergeRegions } from '../../src/utils/regions';
import { LAST_REGION_STORAGE_KEY } from '../../src/utils/regionRouting';

const mocks = vi.hoisted(() => ({
  regions: { regions: [] as unknown[], loading: false },
  auth: { role: null as string | null, user: null },
}));

vi.mock('../../src/hooks/useRegions', () => ({ useRegions: () => mocks.regions }));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('react-helmet-async', () => ({
  Helmet: () => null,
  HelmetProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../src/pages/CalendarPage', () => ({
  default: () => <div data-testid="calendar-page" />,
}));
vi.mock('../../src/pages/DirectoryPage', () => ({
  default: () => <div data-testid="directory-page" />,
}));
vi.mock('../../src/pages/PublicProfilePage', () => ({
  default: () => <div data-testid="profile-page" />,
}));

import RegionProvider from '../../src/components/RegionProvider';
import { RegionDirectoryRoute, RegionOrProfileRoute } from '../../src/components/RegionRoutes';
import { useEventRegionContext, useRegion } from '../../src/hooks/useRegion';

const WITH_TIROL = mergeRegions([{ id: 'tirol', active: true }]);

function RegionProbe() {
  const { regionId, isNational } = useRegion();
  return (
    <output data-testid="region-probe">{`${regionId}${isNational ? ' national' : ''}`}</output>
  );
}

function EventStub() {
  useEventRegionContext({ regionId: 'tirol' });
  return <div data-testid="event-page" />;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RegionProvider>
        <RegionProbe />
        <Routes>
          <Route path="/" element={<div data-testid="home-calendar" />} />
          <Route path="/event/:slug" element={<EventStub />} />
          <Route path="/:regionSlug/verzeichnis" element={<RegionDirectoryRoute />} />
          <Route path="/:slug" element={<RegionOrProfileRoute />} />
        </Routes>
      </RegionProvider>
    </MemoryRouter>
  );
}

const probe = () => screen.getByTestId('region-probe').textContent;

beforeEach(() => {
  mocks.regions = { regions: STATIC_REGIONS, loading: false };
  mocks.auth = { role: null, user: null };
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('region or profile at /:slug', () => {
  it('an active region shows the calendar and becomes the context', () => {
    renderAt('/vorarlberg');
    expect(screen.getByTestId('calendar-page')).toBeInTheDocument();
    expect(probe()).toBe('vorarlberg');
  });

  it('a username shows the profile', () => {
    renderAt('/maria-muster');
    expect(screen.getByTestId('profile-page')).toBeInTheDocument();
    expect(screen.queryByTestId('region-coming-soon')).not.toBeInTheDocument();
  });

  it('an inactive region shows the coming-soon page with a link to the Vorarlberg calendar', () => {
    renderAt('/steiermark');
    const page = screen.getByTestId('region-coming-soon');
    expect(page).toHaveTextContent('The Tribe – Steiermark kommt bald');
    expect(page).toHaveTextContent('in der Steiermark');
    expect(screen.getByRole('link', { name: 'Zum Kalender Vorarlberg' })).toHaveAttribute(
      'href',
      '/'
    );
    expect(screen.queryByTestId('profile-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('calendar-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('region-preview-note')).not.toBeInTheDocument();
    // An inactive region in the URL does not become the context.
    expect(probe()).toBe('vorarlberg');
  });

  it('waits for the region config instead of flashing the coming-soon page', () => {
    mocks.regions = { regions: STATIC_REGIONS, loading: true };
    renderAt('/tirol');
    expect(screen.getByTestId('region-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('region-coming-soon')).not.toBeInTheDocument();
  });

  it('a region activated in Firestore shows its calendar', () => {
    mocks.regions = { regions: WITH_TIROL, loading: false };
    renderAt('/tirol');
    expect(screen.getByTestId('calendar-page')).toBeInTheDocument();
    expect(probe()).toBe('tirol');
  });

  it('admins get a note on the coming-soon page (preview seam)', () => {
    mocks.auth = { role: 'Admin', user: null };
    renderAt('/steiermark');
    expect(screen.getByTestId('region-preview-note')).toBeInTheDocument();
  });

  it('/oesterreich is coming soon while only Vorarlberg is active', () => {
    renderAt('/oesterreich');
    expect(screen.getByTestId('region-coming-soon')).toHaveTextContent(
      'The Tribe – Ganz Österreich kommt bald'
    );
  });

  it('/oesterreich is the combined view once two regions are active', () => {
    mocks.regions = { regions: WITH_TIROL, loading: false };
    renderAt('/oesterreich');
    expect(screen.getByTestId('calendar-page')).toBeInTheDocument();
    expect(probe()).toBe('vorarlberg national');
  });
});

describe('/:regionSlug/verzeichnis', () => {
  it('shows the directory of an active region', () => {
    renderAt('/vorarlberg/verzeichnis');
    expect(screen.getByTestId('directory-page')).toBeInTheDocument();
  });
  it('shows the coming-soon page for an inactive region', () => {
    renderAt('/wien/verzeichnis');
    expect(screen.getByTestId('region-coming-soon')).toHaveTextContent('Wien kommt bald');
  });
  it('is a 404 for anything that is not a region', () => {
    renderAt('/maria-muster/verzeichnis');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seite nicht gefunden');
  });
});

describe('remembered region', () => {
  it('/ uses the last region opened through its address', () => {
    mocks.regions = { regions: WITH_TIROL, loading: false };
    window.localStorage.setItem(LAST_REGION_STORAGE_KEY, 'tirol');
    renderAt('/');
    expect(screen.getByTestId('home-calendar')).toBeInTheDocument();
    expect(probe()).toBe('tirol');
  });

  it('the URL beats localStorage and is remembered', () => {
    mocks.regions = { regions: WITH_TIROL, loading: false };
    window.localStorage.setItem(LAST_REGION_STORAGE_KEY, 'tirol');
    renderAt('/vorarlberg');
    expect(probe()).toBe('vorarlberg');
    expect(window.localStorage.getItem(LAST_REGION_STORAGE_KEY)).toBe('vorarlberg');
  });

  it('a remembered region that is not active falls back to Vorarlberg', () => {
    window.localStorage.setItem(LAST_REGION_STORAGE_KEY, 'tirol');
    renderAt('/');
    expect(probe()).toBe('vorarlberg');
  });

  it('a throwing localStorage does not crash the app', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    renderAt('/vorarlberg');
    expect(screen.getByTestId('calendar-page')).toBeInTheDocument();
    expect(probe()).toBe('vorarlberg');
  });
});

describe('event pages', () => {
  it("use the event's region as context, the URL stays the event address", () => {
    renderAt('/event/yoga-innsbruck');
    expect(screen.getByTestId('event-page')).toBeInTheDocument();
    expect(probe()).toBe('tirol');
  });
});
