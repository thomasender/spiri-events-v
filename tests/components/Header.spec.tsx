import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from '../../src/components/Header';

const mockAuth = vi.hoisted(() => ({
  user: null as { uid: string; photoURL?: string | null } | null,
  canCreateEvents: true,
}));

const mockProfile = vi.hoisted(() => ({
  photoURL: null as string | null,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockAuth.user,
    canCreateEvents: mockAuth.canCreateEvents,
    logout: () => {},
  }),
}));

vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: { photoURL: mockProfile.photoURL },
    loading: false,
    exists: mockProfile.photoURL !== null,
    save: () => {},
  }),
}));

beforeEach(() => {
  mockAuth.user = null;
  mockAuth.canCreateEvents = true;
  if (mockAuth.user) mockAuth.user.photoURL = undefined;
  mockProfile.photoURL = null;
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

  it('renders the tagline inside the logo block', () => {
    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    const tagline = container.querySelector('.logo-tagline');
    expect(tagline).not.toBeNull();
    expect(tagline?.textContent).toContain('Tribe ist für alle da.');
    expect(tagline?.textContent).toContain(
      'Ein Ort für Begegnung, Inspiration und echtes Miteinander.'
    );
  });

  it('renders a Sparkles icon next to the tagline', () => {
    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    const tagline = container.querySelector('.logo-tagline');
    expect(tagline).not.toBeNull();
    const icon = tagline?.querySelector('svg.logo-tagline-icon');
    expect(icon).not.toBeNull();
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
    expect(screen.queryByText('Verwaltung')).toBeNull();
    expect(screen.queryByText('Abmelden')).toBeNull();
  });

  it('renders an "Event erstellen" link for logged-out users that points to /login', () => {
    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const createLinks = container.querySelectorAll('a[href="/login"]');
    expect(createLinks.length).toBeGreaterThan(0);
    const labels = Array.from(createLinks).map((link) => link.textContent?.trim() ?? '');
    expect(labels.some((l) => l.includes('Event erstellen'))).toBe(true);
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

    const logoutButton = Array.from(mobileLinks).find(
      (el) => el.tagName === 'BUTTON' && el.classList.contains('nav-link--logout')
    );
    expect(logoutButton).toBeDefined();
    expect(logoutButton?.textContent).toContain('Abmelden');
  });
});

describe('Header profile nav avatar', () => {
  it('shows the fallback user icon when the logged-in user has no profile photo', () => {
    mockAuth.user = { uid: 'test-uid' };
    mockProfile.photoURL = null;

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const profilLinks = Array.from(container.querySelectorAll('a[href="/profil"]'));
    expect(profilLinks.length).toBeGreaterThan(0);

    profilLinks.forEach((link) => {
      expect(link.querySelector('img.nav-link-avatar')).toBeNull();
    });

    const svgs = profilLinks.flatMap((link) => Array.from(link.querySelectorAll('svg')));
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders the user uploaded profile photo as a circular avatar in the Mein Profil nav link', () => {
    mockAuth.user = { uid: 'test-uid' };
    mockProfile.photoURL = 'https://example.com/uploads/avatar.jpg';

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const avatars = Array.from(container.querySelectorAll('img.nav-link-avatar'));
    expect(avatars.length).toBeGreaterThanOrEqual(2);
    avatars.forEach((img) => {
      expect(img.getAttribute('src')).toBe('https://example.com/uploads/avatar.jpg');
      expect(img.getAttribute('alt')).toBe('');
      expect(img.getAttribute('aria-hidden')).toBe('true');
    });

    const profilLinks = Array.from(container.querySelectorAll('a[href="/profil"]'));
    profilLinks.forEach((link) => {
      expect(link.querySelector('img.nav-link-avatar')).not.toBeNull();
    });
  });

  it('falls back to the auth provider photoURL when no Firestore profile photo is set', () => {
    mockAuth.user = { uid: 'test-uid', photoURL: 'https://example.com/google-avatar.jpg' };
    mockProfile.photoURL = null;

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const avatars = Array.from(container.querySelectorAll('img.nav-link-avatar'));
    expect(avatars.length).toBeGreaterThanOrEqual(2);
    avatars.forEach((img) => {
      expect(img.getAttribute('src')).toBe('https://example.com/google-avatar.jpg');
    });
  });

  it('prefers the Firestore profile photoURL over the auth provider photoURL', () => {
    mockAuth.user = { uid: 'test-uid', photoURL: 'https://example.com/google-avatar.jpg' };
    mockProfile.photoURL = 'https://example.com/uploads/avatar.jpg';

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const avatars = Array.from(container.querySelectorAll('img.nav-link-avatar'));
    expect(avatars.length).toBeGreaterThanOrEqual(2);
    avatars.forEach((img) => {
      expect(img.getAttribute('src')).toBe('https://example.com/uploads/avatar.jpg');
    });
  });

  it('does not render any avatar in the Mein Profil nav when the user is logged out', () => {
    mockAuth.user = null;

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(container.querySelectorAll('img.nav-link-avatar').length).toBe(0);
    expect(container.querySelectorAll('a[href="/profil"]').length).toBe(0);
  });
});
