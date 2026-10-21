// @vitest-environment happy-dom
import { EVENTS } from '../../src/lib/analytics';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  directory: {
    entries: [] as unknown[],
    loading: false,
    error: null as string | null,
    setHidden: vi.fn(),
  },
  auth: { role: 'User', user: null as { uid: string } | null },
  messengerOpen: false,
}));

vi.mock('../../src/hooks/useDirectory', () => ({ useDirectory: () => mocks.directory }));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../src/hooks/useChatSettings', () => ({
  useMessengerAccess: () => ({ available: mocks.messengerOpen, mode: 'all', loading: false }),
}));
vi.mock('../../src/hooks/useCategoryRegistry', () => ({
  useCategoryRegistry: () => ({
    categories: [
      { id: 'yoga', name: 'Yoga' },
      { id: 'coaching', name: 'Coaching' },
    ],
    colorByName: new Map([['Yoga', '#c48e6a']]),
  }),
}));
vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { DEFAULT_REGION_CONTEXT, RegionContext } from '../../src/hooks/useRegion';
import { STATIC_REGIONS } from '../../src/utils/regions.js';
import DirectoryPage from '../../src/pages/DirectoryPage';

const e = (uid: string, over = {}) => ({
  uid,
  slug: uid,
  displayName: uid,
  bio: '',
  photoURL: null,
  categories: ['Yoga'],
  regions: [],
  hidden: false,
  ...over,
});

const renderPage = (url = '/verzeichnis') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <DirectoryPage />
    </MemoryRouter>
  );

const names = () =>
  screen
    .queryAllByRole('heading', { level: 2 })
    .map((h) => h.textContent)
    .filter((t) => !['Kategorie', 'Region', 'Bezirk'].includes(t || ''))
    .sort(); // display order is random

beforeEach(() => {
  mocks.auth.role = 'User';
  mocks.directory.loading = false;
  mocks.directory.error = null;
  mocks.directory.setHidden = vi.fn().mockResolvedValue(undefined);
  mocks.directory.entries = [
    e('zoe', { displayName: 'Zoe', categories: ['Coaching'], regions: ['Online'] }),
    e('anna', { displayName: 'Anna', regions: ['Dornbirn'] }),
    e('geheim', { displayName: 'Geheim', hidden: true }),
  ];
});

describe('DirectoryPage', () => {
  it('lists entries in random order and hides moderated ones from visitors', () => {
    renderPage();
    expect(names()).toEqual(['Anna', 'Zoe']);
    expect(screen.getByTestId('directory-count')).toHaveTextContent('2 Einträge');
    expect(screen.queryByTestId('directory-toggle-hidden')).not.toBeInTheDocument();
  });

  it('filters by category chip and shows counts', () => {
    renderPage();
    expect(
      within(screen.getByTestId('directory-category-Yoga')).getByText('1')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('directory-category-Coaching'));
    expect(names()).toEqual(['Zoe']);
    fireEvent.click(screen.getByTestId('directory-clear'));
    expect(names()).toEqual(['Anna', 'Zoe']);
  });

  it('reads filters from the URL', () => {
    renderPage('/verzeichnis?kategorie=Yoga&region=Dornbirn');
    expect(names()).toEqual(['Anna']);
    expect(screen.getByTestId('directory-category-Yoga')).toHaveAttribute('aria-pressed', 'true');
  });

  it('searches by name', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('directory-search'), { target: { value: 'zo' } });
    expect(names()).toEqual(['Zoe']);
  });

  it('shows an empty state with a reset when nothing matches', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('directory-search'), { target: { value: 'xyz' } });
    expect(screen.getByTestId('directory-empty')).toHaveTextContent(/Keine Treffer/);
  });

  it('lets admins see hidden entries and restore them', async () => {
    mocks.auth.role = 'Admin';
    renderPage();
    expect(names()).toContain('Geheim');
    const card = screen
      .getAllByTestId('directory-card')
      .find((c) => c.textContent?.includes('Geheim'))!;
    fireEvent.click(within(card).getByTestId('directory-toggle-hidden'));
    await waitFor(() => expect(mocks.directory.setHidden).toHaveBeenCalledWith('geheim', false));
  });

  it('shows a CTA at the top linking to the profile directory section', () => {
    renderPage();
    const cta = screen.getByTestId('directory-top-cta');
    expect(cta.getAttribute('href')).toBe('/profil#verzeichnis');
  });
});

const track = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/analytics')>()),
  trackEvent: track,
}));

describe('DirectoryPage analytics', () => {
  beforeEach(() => {
    track.mockClear();
    mocks.directory.entries = [e('anna')];
  });

  it('reports filter_apply with the category name when a chip is selected', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('directory-category-Yoga'));
    expect(track).toHaveBeenCalledWith(EVENTS.FILTER_APPLY, {
      filter_type: 'category',
      value: 'Yoga',
    });
  });

  it('reports only the length of the search term, after typing pauses', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      renderPage();
      fireEvent.change(screen.getByTestId('directory-search'), { target: { value: 'Anna' } });
      fireEvent.change(screen.getByTestId('directory-search'), { target: { value: 'Annabel' } });
      expect(track).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith(EVENTS.SEARCH, { search_term_length: 7 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('DirectoryPage — regions (ticket 14)', () => {
  const regionOf = (slug: string, active = true) => ({
    ...STATIC_REGIONS.find((r) => r.id === slug)!,
    active,
  });
  const allRegions = [regionOf('vorarlberg'), regionOf('steiermark'), regionOf('wien', false)];

  const renderIn = (regionId: string, isNational = false) =>
    render(
      <MemoryRouter initialEntries={['/verzeichnis']}>
        <RegionContext.Provider
          value={{
            ...DEFAULT_REGION_CONTEXT,
            region: allRegions.find((r) => r.id === regionId)!,
            regionId,
            regions: allRegions.filter((r) => r.active),
            allRegions,
            isNational,
            combinedRegions: isNational ? allRegions.filter((r) => r.active) : [],
          }}
        >
          <DirectoryPage />
        </RegionContext.Provider>
      </MemoryRouter>
    );

  beforeEach(() => {
    mocks.directory.entries = [
      e('anna', { displayName: 'Anna', regions: ['Dornbirn'] }), // no regionIds = Vorarlberg
      e('berta', { displayName: 'Berta', regions: ['Graz'], regionIds: ['steiermark'] }),
      e('clara', {
        displayName: 'Clara',
        regions: ['Online'],
        regionIds: ['vorarlberg', 'steiermark'],
      }),
      e('dora', { displayName: 'Dora', regions: ['Wien'], regionIds: ['wien'] }),
    ];
  });

  it("lists only profiles of the region, with that region's Bezirke as chips", () => {
    renderIn('steiermark');
    expect(names()).toEqual(['Berta', 'Clara']);
    expect(screen.getByTestId('directory-region-Graz')).toBeInTheDocument();
    expect(screen.queryByTestId('directory-region-Dornbirn')).not.toBeInTheDocument();
    expect(screen.getByText('Bezirk')).toBeInTheDocument();
  });

  it('Vorarlberg keeps its profiles and the "Region" heading', () => {
    renderIn('vorarlberg');
    expect(names()).toEqual(['Anna', 'Clara']);
    expect(screen.getByTestId('directory-region-Dornbirn')).toBeInTheDocument();
    expect(screen.queryByTestId('directory-region-Graz')).not.toBeInTheDocument();
  });

  it('combined view shows profiles of all active regions, not of inactive ones', () => {
    renderIn('vorarlberg', true);
    expect(names()).toEqual(['Anna', 'Berta', 'Clara']);
    expect(screen.getByTestId('directory-count')).toHaveTextContent('3 Einträge');
  });
});

describe('DirectoryPage: private message shortcut', () => {
  beforeEach(() => {
    mocks.directory.entries = [e('anna'), e('me')];
    mocks.directory.loading = false;
    mocks.auth.user = { uid: 'me' };
    mocks.messengerOpen = true;
  });

  it('offers "Nachricht" on other people\'s listings, not on your own', () => {
    renderPage();
    const links = screen.getAllByTestId('dm-link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/postfach/anna');
  });

  it('shows nothing while the messenger is closed or when logged out', () => {
    mocks.messengerOpen = false;
    const { unmount } = renderPage();
    expect(screen.queryByTestId('dm-link')).toBeNull();
    unmount();
    mocks.messengerOpen = true;
    mocks.auth.user = null;
    renderPage();
    expect(screen.queryByTestId('dm-link')).toBeNull();
  });
});
