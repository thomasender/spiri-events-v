import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = {
  user: { uid: 'u1', emailVerified: true, displayName: 'Sandra' } as any,
  available: true,
  profile: { photoURL: null, bio: '' } as any,
  loading: false,
  exists: true,
};
const save = vi.fn().mockResolvedValue('slug');

vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../../src/hooks/useChatSettings', () => ({
  useOnboardingAccess: () => ({ available: state.available }),
}));
vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: state.profile,
    loading: state.loading,
    exists: state.exists,
    save,
  }),
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
    sessionStorage.clear();
    state.user = { uid: 'u1', emailVerified: true, displayName: 'Sandra' };
    state.available = true;
    state.profile = { photoURL: null, bio: '' };
    state.loading = false;
    state.exists = true;
    save.mockClear();
  });

  it('renders nothing while the flag is off for this person', () => {
    state.available = false;
    renderGate();
    expect(screen.queryByTestId('profile-onboarding')).toBeNull();
    expect(screen.queryByTestId('onboarding-banner')).toBeNull();
  });

  it('opens right after registration, before the e-mail is confirmed', () => {
    state.user = { uid: 'u1', emailVerified: false };
    state.profile = { photoURL: null, bio: '', onboardingCompleted: false };
    renderGate();
    expect(screen.getByTestId('profile-onboarding')).toBeInTheDocument();
  });

  it('opens on its own when photo and description are missing', () => {
    renderGate();
    expect(screen.getByTestId('profile-onboarding')).toBeInTheDocument();
  });

  it('stays closed for a complete profile of an older account', () => {
    state.profile = { photoURL: 'u', bio: 'Hallo' };
    renderGate();
    expect(screen.queryByTestId('profile-onboarding')).toBeNull();
    expect(screen.queryByTestId('onboarding-banner')).toBeNull();
  });

  it('opens for a new account that has not finished it, even with photo and description', () => {
    state.profile = { photoURL: 'u', bio: 'Hallo', onboardingCompleted: false };
    renderGate();
    expect(screen.getByTestId('profile-onboarding')).toBeInTheDocument();
  });

  it('never opens again once finished, on any device', () => {
    state.profile = { photoURL: null, bio: '', onboardingCompleted: true };
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

  it('closing hides it for this visit only and stores nothing on the account', () => {
    const first = renderGate();
    fireEvent.click(screen.getByText('close'));
    expect(save).not.toHaveBeenCalled();
    first.unmount();

    // same visit: stays closed, the banner offers it
    renderGate().unmount();
    sessionStorage.clear(); // next visit
    renderGate();
    expect(screen.getByTestId('profile-onboarding')).toBeInTheDocument();
  });

  it('stays closed within the visit after closing', () => {
    sessionStorage.setItem('onboarding-dismissed:u1', '1');
    renderGate();
    expect(screen.queryByTestId('profile-onboarding')).toBeNull();
    expect(screen.getByTestId('onboarding-banner')).toBeInTheDocument();
  });

  it('ignores the old "closed for good" flag: not finished means offered again', () => {
    state.profile = { photoURL: null, bio: '', onboardingDismissed: true };
    renderGate();
    expect(screen.getByTestId('profile-onboarding')).toBeInTheDocument();
  });

  it('stays out of the way on the profile page', () => {
    renderGate('/profil');
    expect(screen.queryByTestId('profile-onboarding')).toBeNull();
    expect(screen.queryByTestId('onboarding-banner')).toBeNull();
  });
});
