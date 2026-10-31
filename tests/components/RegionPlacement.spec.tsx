import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeRegions } from '../../src/utils/regions';
import { defaultAboutBodyHtml, customAboutText } from '../../src/utils/regionAboutText';

const mocks = vi.hoisted(() => ({
  regions: { regions: [] as unknown[], loading: false },
  auth: { role: null as string | null, user: null as { uid: string } | null },
}));

vi.mock('../../src/hooks/useRegions', () => ({ useRegions: () => mocks.regions }));
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ ...mocks.auth, canCreateEvents: true, logout: () => {} }),
}));
vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: {}, loading: false, save: () => {} }),
}));
vi.mock('../../src/hooks/useUnreadMessageCount', () => ({
  useUnreadMessageCount: () => ({ count: 0 }),
}));
vi.mock('../../src/hooks/useFeedbackList', () => ({
  useUnreadFeedbackCount: () => ({ count: 0 }),
}));
vi.mock('../../src/components/EmailVerificationModal', () => ({ default: () => null }));

import RegionProvider from '../../src/components/RegionProvider';
import Header from '../../src/components/Header';
import Footer from '../../src/components/Footer';
import ProfilePage from '../../src/pages/ProfilePage';

const TWO_ACTIVE = mergeRegions([{ id: 'tirol', active: true }]);

function renderProfile() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/profil']}>
        <RegionProvider>
          <ProfilePage />
        </RegionProvider>
      </MemoryRouter>
    </HelmetProvider>
  );
}

function renderChrome() {
  return render(
    <MemoryRouter>
      <RegionProvider>
        <Header />
        <Footer />
      </RegionProvider>
    </MemoryRouter>
  );
}

describe('where the region can be chosen', () => {
  beforeEach(() => {
    window.localStorage.setItem('tribe:regionChooserSeen', '1');
    mocks.regions = { regions: TWO_ACTIVE, loading: false };
    mocks.auth = { role: null, user: null };
  });

  it('visitors without an account choose in the header and in the footer', () => {
    renderChrome();
    expect(screen.getByTestId('region-switcher')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('footer-region-pick'));
    const picker = screen.getByTestId('region-picker');
    expect(within(picker).getByRole('combobox')).toBeInTheDocument();
  });

  it('the footer button names the searched place on its coming-soon page', () => {
    window.localStorage.setItem(
      'tribe:placeSelection',
      JSON.stringify({
        label: 'Köln',
        lat: 50.94,
        lon: 6.96,
        radiusKm: 25,
        regionId: 'koeln-bonn-eifel',
        source: 'search',
        updatedAt: 1,
      })
    );
    render(
      <MemoryRouter initialEntries={['/koeln-bonn-eifel']}>
        <RegionProvider>
          <Footer />
        </RegionProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId('footer-region-pick')).toHaveTextContent('Köln · 25 km');
  });

  it('signed-in users change the region from the profile card', () => {
    mocks.auth = { role: 'User', user: { uid: 'u1' } };
    renderProfile();
    fireEvent.click(screen.getByTestId('profile-region-pick'));
    expect(screen.getByTestId('region-picker')).toBeInTheDocument();
  });

  it('no empty region card in the profile with only Vorarlberg open (dark launch)', () => {
    mocks.regions = { regions: mergeRegions([]), loading: false };
    mocks.auth = { role: 'User', user: { uid: 'u1' } };
    renderProfile();
    expect(screen.getByTestId('profile-page')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-region')).toBeNull();
  });

  it('signed-in users and moderators have no region button in header or footer', () => {
    mocks.auth = { role: 'RegionModerator', user: { uid: 'u1' } };
    renderChrome();
    expect(screen.queryByTestId('region-switcher')).toBeNull();
    expect(screen.queryByTestId('region-menu-list')).toBeNull();
    expect(screen.queryByTestId('footer-region-pick')).toBeNull();
  });

  it('Super-Admins choose in the footer, not in the header', () => {
    mocks.auth = { role: 'Admin', user: { uid: 'a1' } };
    renderChrome();
    expect(screen.queryByTestId('region-switcher')).toBeNull();
    expect(screen.getByTestId('footer-region-pick')).toBeInTheDocument();
  });

  it('the footer button stays hidden with only Vorarlberg open (dark launch)', () => {
    mocks.regions = { regions: mergeRegions([]), loading: false };
    mocks.auth = { role: 'Admin', user: { uid: 'a1' } };
    renderChrome();
    expect(screen.queryByTestId('footer-region-pick')).toBeNull();
    mocks.auth = { role: null, user: null };
    renderChrome();
    expect(screen.queryByTestId('footer-region-pick')).toBeNull();
  });
});

describe('region about text', () => {
  it('the default body names the place and matches the page wording', () => {
    const html = defaultAboutBodyHtml('in Tirol');
    expect(html).toContain('Wir sind der Tribe in Tirol');
    expect(html).toContain('Erwachen in Tirol vergrößern');
  });

  it('escapes the place phrase', () => {
    expect(defaultAboutBodyHtml('in <b>x</b>')).not.toContain('<b>x</b>');
  });

  it('customAboutText ignores missing or blank text', () => {
    expect(customAboutText({})).toBe('');
    expect(customAboutText({ aboutText: '  ' })).toBe('');
    expect(customAboutText({ aboutText: ' <p>a</p> ' })).toBe('<p>a</p>');
  });
});

describe('Verwaltung header while the chosen region is not open yet (gflD7CXa)', () => {
  const place = (regionId: string) =>
    JSON.stringify({
      label: 'Wiener Neustadt',
      lat: 47.8,
      lon: 16.2,
      radiusKm: 25,
      regionId,
      source: 'search',
      updatedAt: 1,
    });

  beforeEach(() => {
    window.localStorage.setItem('tribe:regionChooserSeen', '1');
    mocks.regions = { regions: TWO_ACTIVE, loading: false };
    mocks.auth = { role: 'User', user: { uid: 'u1' } };
  });

  const renderAdminHeader = () =>
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <RegionProvider>
          <Header />
        </RegionProvider>
      </MemoryRouter>
    );

  it('shows the neutral header in Verwaltung for a region that is not open yet', () => {
    window.localStorage.setItem('tribe:placeSelection', place('niederoesterreich'));
    renderAdminHeader();
    expect(screen.getByText('Dein Kalender')).toBeInTheDocument();
  });

  it('keeps the region header in Verwaltung for an active region', () => {
    window.localStorage.setItem('tribe:placeSelection', place('tirol'));
    renderAdminHeader();
    expect(screen.queryByText('Dein Kalender')).toBeNull();
  });

  it('Favoriten and Profil never fall back to the Vorarlberg header', () => {
    for (const path of ['/favoriten', '/profil']) {
      for (const [regionId, title] of [
        ['niederoesterreich', 'Dein Kalender'],
        ['tirol', 'Dein Tiroler Kalender'],
      ]) {
        window.localStorage.setItem('tribe:placeSelection', place(regionId));
        const { unmount } = render(
          <MemoryRouter initialEntries={[path]}>
            <RegionProvider>
              <Header />
            </RegionProvider>
          </MemoryRouter>
        );
        expect(screen.getByText(title)).toBeInTheDocument();
        expect(screen.queryByText('Dein Vorarlberger Kalender')).toBeNull();
        unmount();
      }
    }
  });
});
