import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from '../../src/components/Header';

const mockAuth = vi.hoisted(() => ({
  user: null as { uid: string } | null,
}));

const mockUseUnread = vi.hoisted(() => ({
  count: 0,
  loading: false,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockAuth.user,
    logout: () => {},
  }),
}));

vi.mock('../../src/hooks/useUnreadMessageCount', () => ({
  useUnreadMessageCount: () => mockUseUnread,
}));

beforeEach(() => {
  mockAuth.user = null;
  mockUseUnread.count = 0;
  mockUseUnread.loading = false;
});

describe('Header Verwaltung unread badge (zejdjTnm)', () => {
  it('does not render the Verwaltung link at all when no user is signed in', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('verwaltung-unread-badge')).not.toBeInTheDocument();
  });

  it('does not show an unread badge on the Verwaltung link when count is zero', () => {
    mockAuth.user = { uid: 'test-uid' };
    mockUseUnread.count = 0;

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('verwaltung-unread-badge')).not.toBeInTheDocument();
  });

  it('shows the unread count badge on the Verwaltung link when count > 0', () => {
    mockAuth.user = { uid: 'test-uid' };
    mockUseUnread.count = 3;

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const badge = screen.getAllByTestId('verwaltung-unread-badge')[0];
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('3');
  });

  it('caps the badge text at 9+ when count exceeds 9', () => {
    mockAuth.user = { uid: 'test-uid' };
    mockUseUnread.count = 25;

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(screen.getAllByTestId('verwaltung-unread-badge')[0]).toHaveTextContent('9+');
  });

  it('announces the unread count to screen readers via aria-label on the Verwaltung link', () => {
    mockAuth.user = { uid: 'test-uid' };
    mockUseUnread.count = 4;

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const adminLinks = screen.getAllByRole('link', { name: /Verwaltung/ });
    expect(adminLinks.length).toBeGreaterThan(0);
    adminLinks.forEach((link) => {
      expect(link.getAttribute('aria-label')).toBe('Verwaltung (4 ungelesene Nachrichten)');
    });
  });

  it('falls back to a plain "Verwaltung" aria-label when there are no unread messages', () => {
    mockAuth.user = { uid: 'test-uid' };
    mockUseUnread.count = 0;

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const adminLinks = screen.getAllByRole('link', { name: /Verwaltung/ });
    adminLinks.forEach((link) => {
      expect(link.getAttribute('aria-label')).toBe('Verwaltung');
    });
  });

  it('does not render a Nachrichten nav link anymore', () => {
    mockAuth.user = { uid: 'test-uid' };

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('notification-bell')).not.toBeInTheDocument();
    const navLinks = screen.queryAllByRole('link', { name: /nachrichten/i });
    expect(navLinks.length).toBe(0);
  });
});
