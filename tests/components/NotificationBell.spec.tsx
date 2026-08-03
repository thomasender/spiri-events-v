import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../src/hooks/useUnreadMessageCount', () => ({
  useUnreadMessageCount: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: () => ({ type: 'collection' }),
  query: () => ({ type: 'query' }),
  where: () => ({ type: 'where' }),
  getFirestore: () => ({}),
  connectFirestoreEmulator: () => {},
  onSnapshot: (_q, callback) => {
    if (typeof callback === 'function') callback({ docs: [] });
    return () => {};
  },
}));

vi.mock('firebase/app', () => ({
  initializeApp: () => ({}),
  getApp: () => ({}),
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  connectAuthEmulator: () => {},
}));

vi.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  connectStorageEmulator: () => {},
}));

import NotificationBell from '../../src/components/NotificationBell';
import { useAuth } from '../../src/hooks/useAuth';
import { useUnreadMessageCount } from '../../src/hooks/useUnreadMessageCount';

describe('NotificationBell', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { uid: 'user-1' }, role: 'User' });
    useUnreadMessageCount.mockReturnValue({ count: 0, loading: false });
  });

  it('renders nothing when no user is signed in', () => {
    useAuth.mockReturnValue({ user: null, role: null });
    const { container } = render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the bell button when user is signed in', () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
  });

  it('does not show a badge when there are no unread messages', () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('notification-bell-badge')).not.toBeInTheDocument();
  });

  it('shows the unread count badge when there are unread messages', () => {
    useUnreadMessageCount.mockReturnValue({ count: 3, loading: false });
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    const badge = screen.getByTestId('notification-bell-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('3');
  });

  it('caps the displayed badge at 9+', () => {
    useUnreadMessageCount.mockReturnValue({ count: 25, loading: false });
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    expect(screen.getByTestId('notification-bell-badge')).toHaveTextContent('9+');
  });

  it('opens the dropdown when clicked', () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('notification-dropdown')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('notification-dropdown')).toBeInTheDocument();
  });
});
