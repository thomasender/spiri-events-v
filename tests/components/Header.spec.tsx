import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

beforeEach(() => {
  mockAuth.user = null;
});

describe('Header (logged out)', () => {
  it('renders logo with title', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByText('tribe')).toBeInTheDocument();
  });

  it('renders the Kalender nav link', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getAllByText('Kalender').length).toBeGreaterThan(0);
  });

  it('renders the Anmelden link instead of profile/admin actions', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getAllByText('Anmelden').length).toBeGreaterThan(0);
    expect(screen.queryByText('Mein Profil')).toBeNull();
    expect(screen.queryByText('Event erstellen')).toBeNull();
  });
});

describe('Header (logged in)', () => {
  it('keeps the nav-link--admin modifier on the Verwaltung link', () => {
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const adminLinks = container.querySelectorAll('a[href="/admin"]');
    expect(adminLinks.length).toBeGreaterThan(0);
    adminLinks.forEach((link) => {
      expect(link.className).toContain('nav-link--admin');
    });
  });

  it('renders every nav label in both desktop and mobile menus for the logged-in user', () => {
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
      expect(
        rendered.filter((l) => l === label).length,
        `label "${label}" should appear in both desktop and mobile menus`
      ).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('Header active nav state', () => {
  it('highlights Kalender on the home route and no other nav link', () => {
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>
    );

    const activeLinks = container.querySelectorAll('a.nav-link--active');
    expect(activeLinks.length).toBeGreaterThan(0);
    activeLinks.forEach((link) => {
      expect(link.getAttribute('href')).toBe('/');
      expect(link.getAttribute('aria-current')).toBe('page');
    });
  });

  it('highlights Verwaltung on /admin', () => {
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter initialEntries={['/admin']}>
        <Header />
      </MemoryRouter>
    );

    const activeLinks = container.querySelectorAll('a.nav-link--active');
    expect(activeLinks.length).toBeGreaterThan(0);
    activeLinks.forEach((link) => {
      expect(link.getAttribute('href')).toBe('/admin');
    });
  });

  it('highlights Event erstellen on /admin/new with the same visual style as the other nav links', () => {
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter initialEntries={['/admin/new']}>
        <Header />
      </MemoryRouter>
    );

    const createLinks = container.querySelectorAll('a[href="/admin/new"]');
    expect(createLinks.length).toBeGreaterThan(0);
    createLinks.forEach((link) => {
      expect(link.className).toContain('nav-link');
      expect(link.className).toContain('nav-link--active');
      expect(link.className).not.toContain('nav-link--cta');
    });

    const otherLinks = Array.from(container.querySelectorAll('a.nav-link')).filter(
      (el) => el.getAttribute('href') !== '/admin/new'
    );
    otherLinks.forEach((link) => {
      expect(link.className).not.toContain('nav-link--cta');
    });
  });

  it('does NOT highlight Verwaltung on /admin/new - only Event erstellen should be active', () => {
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter initialEntries={['/admin/new']}>
        <Header />
      </MemoryRouter>
    );

    const adminLink = container.querySelector('a[href="/admin"]');
    expect(adminLink?.className).not.toContain('nav-link--active');

    const activeLinks = container.querySelectorAll('a.nav-link--active');
    expect(activeLinks.length).toBe(2);
    const activeHrefs = Array.from(activeLinks)
      .map((l) => l.getAttribute('href'))
      .sort();
    expect(activeHrefs).toEqual(['/admin/new', '/admin/new']);
  });

  it('highlights Mein Profil on /profil', () => {
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter initialEntries={['/profil']}>
        <Header />
      </MemoryRouter>
    );

    const activeLinks = container.querySelectorAll('a.nav-link--active');
    expect(activeLinks.length).toBeGreaterThan(0);
    activeLinks.forEach((link) => {
      expect(link.getAttribute('href')).toBe('/profil');
    });
  });

  it('highlights Anmelden on /login when logged out', () => {
    mockAuth.user = null;

    const { container } = render(
      <MemoryRouter initialEntries={['/login']}>
        <Header />
      </MemoryRouter>
    );

    const activeLinks = container.querySelectorAll('a.nav-link--active');
    expect(activeLinks.length).toBeGreaterThan(0);
    activeLinks.forEach((link) => {
      expect(link.getAttribute('href')).toBe('/login');
    });
  });
});

describe('Header mobile menu', () => {
  it('renders a menu toggle button with proper a11y attributes', () => {
    mockAuth.user = { uid: 'test-uid' };

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const toggle = screen.getByRole('button', { name: /menü öffnen/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'mobile-menu');
  });

  it('opens the mobile menu when the toggle is clicked and exposes all nav links including Abmelden', () => {
    mockAuth.user = { uid: 'test-uid' };

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const toggle = screen.getByRole('button', { name: /menü öffnen/i });
    fireEvent.click(toggle);

    const openToggle = screen.getByRole('button', { name: /menü schließen/i });
    expect(openToggle).toHaveAttribute('aria-expanded', 'true');

    const mobileMenu = document.getElementById('mobile-menu');
    expect(mobileMenu).not.toBeNull();
    expect(mobileMenu?.className).toContain('nav-mobile--open');

    const mobileLinks = mobileMenu?.querySelectorAll('a.nav-link, button.nav-link') ?? [];
    const mobileLabels = Array.from(mobileLinks).map((el) => el.textContent?.trim() ?? '');
    expect(mobileLabels).toContain('Kalender');
    expect(mobileLabels).toContain('Verwaltung');
    expect(mobileLabels).toContain('Mein Profil');
    expect(mobileLabels).toContain('Event erstellen');
    expect(mobileLabels).toContain('Abmelden');
  });

  it('closes the mobile menu when the toggle is clicked a second time', () => {
    mockAuth.user = { uid: 'test-uid' };

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const toggle = screen.getByRole('button', { name: /menü öffnen/i });
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /menü schließen/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: /menü schließen/i }));
    expect(screen.getByRole('button', { name: /menü öffnen/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('closes the mobile menu when the Escape key is pressed', () => {
    mockAuth.user = { uid: 'test-uid' };

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /menü öffnen/i }));
    expect(screen.getByRole('button', { name: /menü schließen/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /menü öffnen/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('closes the mobile menu when a nav link inside it is clicked', () => {
    mockAuth.user = { uid: 'test-uid' };

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /menü öffnen/i }));
    expect(screen.getByRole('button', { name: /menü schließen/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    const mobileMenu = document.getElementById('mobile-menu');
    const profilLink = Array.from(mobileMenu?.querySelectorAll('a.nav-link') ?? []).find(
      (link) => link.getAttribute('href') === '/profil'
    );
    expect(profilLink).toBeDefined();
    fireEvent.click(profilLink!);

    expect(screen.getByRole('button', { name: /menü öffnen/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('shows all nav links including Abmelden and Mein Profil in the mobile menu even on narrow viewports', () => {
    mockAuth.user = { uid: 'test-uid' };

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const mobileMenu = document.getElementById('mobile-menu');
    expect(mobileMenu).not.toBeNull();

    const mobileLinks = mobileMenu?.querySelectorAll('a.nav-link, button.nav-link') ?? [];
    const hrefs = Array.from(mobileLinks).map((el) => el.getAttribute('href'));
    expect(hrefs).toContain('/');
    expect(hrefs).toContain('/admin');
    expect(hrefs).toContain('/profil');
    expect(hrefs).toContain('/admin/new');

    const logoutButton = Array.from(mobileLinks).find((el) => el.tagName === 'BUTTON');
    expect(logoutButton).toBeDefined();
    expect(logoutButton?.textContent).toContain('Abmelden');
  });
});
