import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = {
  user: { uid: 'u1', emailVerified: true, displayName: 'Sandra' } as any,
  available: true,
  profile: { photoURL: null, bio: '' } as any,
  loading: false,
};

vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../../src/hooks/useChatSettings', () => ({
  useOnboardingAccess: () => ({ available: state.available }),
}));
vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: state.profile, loading: state.loading, save: vi.fn() }),
}));
vi.mock('../../src/components/ProfileOnboarding', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="profile-onboarding">
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

import ProfileOnboardingGate from '../../src/components/ProfileOnboardingGate';

const renderGate = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ProfileOnboardingGate />
    </MemoryRouter>
  );

describe('ProfileOnboardingGate', () => {
  beforeEach(() => {
    localStorage.clear();
    state.user = { uid: 'u1', emailVerified: true, displayName: 'Sandra' };
    state.available = true;
    state.profile = { photoURL: null, bio: '' };
    state.loading = false;
  });

  it('renders nothing while the flag is off for this person', () => {
    state.available = false;
    renderGate();
    expect(screen.queryByTestId('profile-onboarding')).toBeNull();
    expect(screen.queryByTestId('onboarding-banner')).toBeNull();
  });

  it('renders nothing for an unverified email', () => {
    state.user = { uid: 'u1', emailVerified: false };
    renderGate();
    expect(screen.queryByTestId('profile-onboarding')).toBeNull();
  });

  it('opens on its own when photo and description are missing', () => {
    renderGate();
    expect(screen.getByTestId('profile-onboarding')).toBeInTheDocument();
  });

  it('stays closed for a complete profile', () => {
    state.profile = { photoURL: 'u', bio: 'Hallo' };
    renderGate();
    expect(screen.queryByTestId('profile-onboarding')).toBeNull();
    expect(screen.queryByTestId('onboarding-banner')).toBeNull();
  });

  it('turns into a banner after closing and can be reopened', () => {
    renderGate();
    fireEvent.click(screen.getByText('close'));
    expect(screen.queryByTestId('profile-onboarding')).toBeNull();
    fireEvent.click(screen.getByTestId('onboarding-banner-open'));
    expect(screen.getByTestId('profile-onboarding')).toBeInTheDocument();
  });

  it('does not reopen by itself once dismissed', () => {
    localStorage.setItem('onboarding-dismissed:u1', '1');
    renderGate();
    expect(screen.queryByTestId('profile-onboarding')).toBeNull();
    expect(screen.getByTestId('onboarding-banner')).toBeInTheDocument();
  });

  it('stays out of the way on the profile page', () => {
    renderGate('/profil');
    expect(screen.queryByTestId('profile-onboarding')).toBeNull();
    expect(screen.queryByTestId('onboarding-banner')).toBeNull();
  });
});
