import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockPublicProfile = vi.hoisted(() => ({
  profile: null,
  loading: false,
  exists: false,
}));

vi.mock('../../src/hooks/usePublicProfile', () => ({
  usePublicProfile: () => mockPublicProfile,
}));

vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="helmet">{children}</div>
  ),
}));

import PublicProfilePage from '../../src/pages/PublicProfilePage';

const renderPage = (uid = 'user-42') =>
  render(
    <MemoryRouter initialEntries={[`/veranstalter/${uid}`]}>
      <Routes>
        <Route path="/veranstalter/:uid" element={<PublicProfilePage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  mockPublicProfile.profile = null;
  mockPublicProfile.loading = false;
  mockPublicProfile.exists = false;
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
      updatedAt: null,
    };

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
      updatedAt: null,
    };

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
      updatedAt: null,
    };

    renderPage();

    const websiteLink = screen.getByTestId('public-profile-website');
    expect(websiteLink).toHaveAttribute('href', 'https://carla.example');
  });
});
