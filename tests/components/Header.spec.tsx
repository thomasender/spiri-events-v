import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from '../../src/components/Header';

const mockAuth = vi.hoisted(() => ({
  user: null as { uid: string } | null,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockAuth.user,
    logout: () => {},
  }),
}));

describe('Header (logged out)', () => {
  it('renders logo with title', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByText('Spirituelle Events')).toBeInTheDocument();
  });

  it('renders the Kalender nav link', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByText('Kalender')).toBeInTheDocument();
  });

  it('renders the Anmelden link instead of profile/admin actions', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByText('Anmelden')).toBeInTheDocument();
    expect(screen.queryByText('Mein Profil')).toBeNull();
    expect(screen.queryByText('Event erstellen')).toBeNull();
  });
});

describe('Header (logged in)', () => {
  it('marks the Verwaltung link with nav-link--admin so it can be hidden on narrow viewports', () => {
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const adminLink = container.querySelector('a[href="/admin"]');
    expect(adminLink).not.toBeNull();
    expect(adminLink?.className).toContain('nav-link--admin');
  });

  it('renders every nav label inline (no wrapping) for the logged-in user', () => {
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const labels = ['Kalender', 'Verwaltung', 'Mein Profil', 'Event erstellen', 'Abmelden'];
    const rendered = Array.from(container.querySelectorAll('.nav-link span')).map(
      (el) => el.textContent
    );

    for (const label of labels) {
      expect(rendered, `label "${label}" should be rendered`).toContain(label);
    }
  });
});
