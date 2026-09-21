import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockPublicProfile = vi.hoisted(() => ({
  profile: null,
  loading: false,
  exists: false,
  uid: null,
}));

const mockAuth = vi.hoisted(() => ({
  user: null,
}));

vi.mock('../../src/hooks/usePublicProfile', () => ({
  usePublicProfile: () => mockPublicProfile,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="helmet">{children}</div>
  ),
}));

vi.mock('../../src/components/OrganizerEvents', () => ({
  default: ({ organizerUid, organizerName }) => (
    <div data-testid="organizer-events-mock" data-uid={organizerUid} data-name={organizerName} />
  ),
}));

import PublicProfilePage from '../../src/pages/PublicProfilePage';

const renderPage = (slug = 'anna-schmidt') =>
  render(
    <MemoryRouter initialEntries={[`/${slug}`]}>
      <Routes>
        <Route path="/:slug" element={<PublicProfilePage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  mockPublicProfile.profile = null;
  mockPublicProfile.loading = false;
  mockPublicProfile.exists = false;
  mockPublicProfile.uid = null;
  mockAuth.user = null;
  window.history.replaceState({}, '', '/');
});

describe('PublicProfilePage (k9CYVFsc)', () => {
  it('renders a loading spinner while the profile is loading', () => {
    mockPublicProfile.loading = true;
    renderPage();
    expect(screen.getByTestId('public-profile-loading')).toBeInTheDocument();
  });

  it('renders a not-found state when the public profile does not exist', () => {
    mockPublicProfile.loading = false;
    mockPublicProfile.exists = false;
    renderPage();
    expect(screen.getByTestId('public-profile-not-found')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Profil nicht verfügbar/i })).toBeInTheDocument();
  });

  it('renders the name, photo, bio, and website link when the profile exists', () => {
    mockPublicProfile.loading = false;
    mockPublicProfile.exists = true;
    mockPublicProfile.profile = {
      displayName: 'Anna Schmidt',
      bio: 'Yoga-Lehrerin aus Vorarlberg.',
      website: 'www.anna-yoga.at',
      photoURL: 'https://example.com/anna.png',
      slug: 'anna-schmidt',
      updatedAt: null,
    };
    mockPublicProfile.uid = 'user-42';

    renderPage();

    expect(screen.getByTestId('public-profile-page')).toBeInTheDocument();
    expect(screen.getByTestId('public-profile-name')).toHaveTextContent('Anna Schmidt');
    expect(screen.getByTestId('public-profile-bio')).toHaveTextContent(
      'Yoga-Lehrerin aus Vorarlberg.'
    );

    const photo = screen.getByTestId('public-profile-photo');
    expect(photo.tagName).toBe('IMG');
    expect(photo).toHaveAttribute('src', 'https://example.com/anna.png');

    const websiteLink = screen.getByTestId('public-profile-website');
    expect(websiteLink).toHaveAttribute('href', 'https://www.anna-yoga.at');
    expect(websiteLink).toHaveAttribute('target', '_blank');
  });

  it('falls back to a placeholder avatar when the profile has no photoURL', () => {
    mockPublicProfile.loading = false;
    mockPublicProfile.exists = true;
    mockPublicProfile.profile = {
      displayName: 'Beatrice Brunner',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'beatrice-brunner',
      updatedAt: null,
    };
    mockPublicProfile.uid = 'user-43';

    renderPage();

    expect(screen.getByTestId('public-profile-photo-placeholder')).toBeInTheDocument();
    expect(screen.getByTestId('public-profile-photo-placeholder')).toHaveTextContent('B');
    expect(screen.queryByTestId('public-profile-bio')).toBeNull();
    expect(screen.queryByTestId('public-profile-website')).toBeNull();
  });

  it('preserves the protocol when the website already includes https://', () => {
    mockPublicProfile.loading = false;
    mockPublicProfile.exists = true;
    mockPublicProfile.profile = {
      displayName: 'Carla Carter',
      bio: '',
      website: 'https://carla.example',
      photoURL: null,
      slug: 'carla-carter',
      updatedAt: null,
    };
    mockPublicProfile.uid = 'user-44';

    renderPage();

    const websiteLink = screen.getByTestId('public-profile-website');
    expect(websiteLink).toHaveAttribute('href', 'https://carla.example');
  });

  it('shows a back button at the top of the page when the profile exists', () => {
    mockPublicProfile.loading = false;
    mockPublicProfile.exists = true;
    mockPublicProfile.profile = {
      displayName: 'Anna Schmidt',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'anna-schmidt',
      updatedAt: null,
    };
    mockPublicProfile.uid = 'user-42';

    renderPage();

    expect(screen.getByTestId('public-profile-back-top')).toBeInTheDocument();
  });

  it('does not render the edit button when the viewer is not the owner', () => {
    mockPublicProfile.loading = false;
    mockPublicProfile.exists = true;
    mockPublicProfile.profile = {
      displayName: 'Anna Schmidt',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'anna-schmidt',
      updatedAt: null,
    };
    mockPublicProfile.uid = 'user-42';
    mockAuth.user = { uid: 'other-user' };

    renderPage();

    expect(screen.queryByTestId('public-profile-edit')).toBeNull();
  });

  it('renders an edit button linking to /profil when the viewer is the owner', () => {
    mockPublicProfile.loading = false;
    mockPublicProfile.exists = true;
    mockPublicProfile.profile = {
      displayName: 'Anna Schmidt',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'anna-schmidt',
      updatedAt: null,
    };
    mockPublicProfile.uid = 'user-42';
    mockAuth.user = { uid: 'user-42' };

    renderPage();

    const editLink = screen.getByTestId('public-profile-edit');
    expect(editLink).toBeInTheDocument();
    expect(editLink).toHaveAttribute('href', '/profil');
  });

  it('renders the share button when the profile exists', () => {
    mockPublicProfile.loading = false;
    mockPublicProfile.exists = true;
    mockPublicProfile.profile = {
      displayName: 'Anna Schmidt',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'anna-schmidt',
      updatedAt: null,
    };
    mockPublicProfile.uid = 'user-42';

    renderPage();

    expect(screen.getByTestId('public-profile-share')).toBeInTheDocument();
  });

  it('renders the "Weitere Events" section when the profile has a uid', () => {
    mockPublicProfile.loading = false;
    mockPublicProfile.exists = true;
    mockPublicProfile.profile = {
      displayName: 'Anna Schmidt',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'anna-schmidt',
      updatedAt: null,
    };
    mockPublicProfile.uid = 'user-42';

    renderPage();

    const wrapper = screen.getByTestId('public-profile-events-wrapper');
    expect(wrapper).toBeInTheDocument();
    const events = screen.getByTestId('organizer-events-mock');
    expect(events).toHaveAttribute('data-uid', 'user-42');
    expect(events).toHaveAttribute('data-name', 'Anna Schmidt');
  });

  it('does not render the "Weitere Events" section when no uid is set', () => {
    mockPublicProfile.loading = false;
    mockPublicProfile.exists = true;
    mockPublicProfile.profile = {
      displayName: 'Anna Schmidt',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'anna-schmidt',
      updatedAt: null,
    };
    mockPublicProfile.uid = null;

    renderPage();

    expect(screen.queryByTestId('public-profile-events-wrapper')).toBeNull();
  });

  it('renders a back button on the not-found state too', () => {
    mockPublicProfile.loading = false;
    mockPublicProfile.exists = false;
    renderPage();
    const back = screen.getByTestId('public-profile-back');
    expect(back).toBeInTheDocument();
    fireEvent.click(back);
  });
});
