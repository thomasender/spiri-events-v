import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RegionContext, DEFAULT_REGION_CONTEXT } from '../../src/hooks/useRegion';
import Header from '../../src/components/Header';
import { mergeRegions } from '../../src/utils/regions';

const mockAuth = vi.hoisted(() => ({
  user: null as { uid: string; photoURL?: string | null } | null,
  canCreateEvents: true,
}));

const mockProfile = vi.hoisted(() => ({
  photoURL: null as string | null,
  placeSelection: null as { regionId: string | null } | null,
}));

const mockUseUnread = vi.hoisted(() => ({
  count: 0,
  loading: false,
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
    profile: { photoURL: mockProfile.photoURL, placeSelection: mockProfile.placeSelection },
    loading: false,
    exists: mockProfile.photoURL !== null,
    save: () => {},
  }),
}));

vi.mock('../../src/hooks/useUnreadMessageCount', () => ({
  useUnreadMessageCount: () => mockUseUnread,
}));

const mockChat = vi.hoisted(() => ({ available: false, online: 0, dm: false, unread: 0 }));

vi.mock('../../src/hooks/useChatSettings', () => ({
  useChatAccess: () => ({ available: mockChat.available, mode: 'off', loading: false }),
  useMessengerAccess: () => ({ available: mockChat.dm, mode: 'off', loading: false }),
}));

vi.mock('../../src/hooks/useMessenger', () => ({
  useThreads: () => ({ threads: [], loading: false, unreadCount: mockChat.unread }),
}));

vi.mock('../../src/hooks/useMentionNotifications', () => ({
  useMentionNotifications: () => ({
    items: [],
    unreadCount: 0,
    markRead: async () => {},
    markAllRead: async () => {},
  }),
}));

vi.mock('../../src/hooks/useChatPresence', () => ({
  useChatPresence: () => ({ online: [], count: mockChat.online, loading: false }),
}));

beforeEach(() => {
  mockAuth.user = null;
  mockAuth.canCreateEvents = true;
  if (mockAuth.user) mockAuth.user.photoURL = undefined;
  mockProfile.photoURL = null;
  mockProfile.placeSelection = null;
  mockUseUnread.count = 0;
  mockUseUnread.loading = false;
  mockChat.available = false;
  mockChat.online = 0;
  mockChat.dm = false;
  mockChat.unread = 0;
});

describe('Header (logged out)', () => {
  it('renders logo with title', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByText('Dein Vorarlberger Kalender')).toBeInTheDocument();
  });

  it('does not render the "Tribe ist für alle da" tagline inside the header (it lives in the hero)', () => {
    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(container.querySelector('.logo-tagline')).toBeNull();
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

    // Scope to nav links only — the header profile shortcut (also a
    // /profil anchor) renders its own `header-profile-avatar` img, not
    // the nav-link one, so we check the nav-link variants here.
    const profilNavLinks = Array.from(container.querySelectorAll('a.nav-link[href="/profil"]'));
    expect(profilNavLinks.length).toBeGreaterThanOrEqual(2);
    profilNavLinks.forEach((link) => {
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

  it('shows the unread count badge on the Verwaltung link when count > 0, capped at 9+', () => {
    mockAuth.user = { uid: 'test-uid' };
    mockUseUnread.count = 3;

    const { rerender } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(screen.getAllByTestId('verwaltung-unread-badge')[0]).toHaveTextContent('3');

    mockUseUnread.count = 25;
    rerender(
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

    // On desktop Verwaltung lives in the account menu.
    fireEvent.click(screen.getByTestId('account-menu-toggle'));
    const adminLinks = screen.getAllByRole('link', { name: /Verwaltung/ });
    expect(adminLinks.length).toBeGreaterThan(0);
    adminLinks.forEach((link) => {
      expect(link.getAttribute('aria-label')).toBe('Verwaltung (4 ungelesene Benachrichtigungen)');
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

    fireEvent.click(screen.getByTestId('account-menu-toggle'));

    const adminLinks = screen.getAllByRole('link', { name: /Verwaltung/ });
    adminLinks.forEach((link) => {
      expect(link.getAttribute('aria-label')).toBe('Verwaltung');
    });
  });
});

describe('Header two-line tagline on every viewport (zh4jJzje)', () => {
  // The two-line desktop tagline ("Dein Vorarlberger Kalender" /
  // "für bewusste Events") replaces the previous phone-only single-line
  // variant. The same `.logo-text` block now ships on every viewport —
  // CSS shrinks it on phones rather than swapping in a different
  // element. jsdom does not apply CSS, so we only assert the DOM
  // scaffolding here; the responsive sizing is verified by Playwright.
  it('renders both lines of the German tagline inside the logo link', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(screen.getByText('Dein Vorarlberger Kalender')).toBeInTheDocument();
    expect(screen.getByText('für bewusste Events')).toBeInTheDocument();
  });

  it('keeps the two-line tagline inside the home link (next to the logo icon)', () => {
    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const logoLink = container.querySelector('a.logo');
    expect(logoLink).not.toBeNull();
    expect(logoLink?.querySelector('.logo-text')).not.toBeNull();
  });

  it('does not render the old single-line `.header-tagline-mobile` variant anymore', () => {
    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(container.querySelector('.header-tagline-mobile')).toBeNull();
  });
});

describe('Header profile/login shortcut button (zh4jJzje)', () => {
  it('renders the shortcut button next to the burger with a login target when logged out', () => {
    mockAuth.user = null;

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const buttons = screen.getAllByTestId('header-profile-button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      expect(btn.getAttribute('href')).toBe('/login');
      expect(btn.getAttribute('aria-label')).toBe('Anmelden');
    });

    // The button is hidden on desktop (display: none in CSS) but the DOM
    // node is always rendered so we can assert the markup regardless of
    // the test viewport.
    expect(container.querySelector('.header-profile-button')).not.toBeNull();
  });

  it('shows a directory shortcut in the mobile header', () => {
    mockAuth.user = null;

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const button = screen.getByTestId('header-directory-button');
    expect(button.getAttribute('href')).toBe('/verzeichnis');
    expect(button.getAttribute('aria-label')).toBe('Verzeichnis');
  });

  it('points the shortcut button at /profil and labels it "Mein Profil" when signed in', () => {
    mockAuth.user = { uid: 'test-uid' };

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const buttons = screen.getAllByTestId('header-profile-button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      expect(btn.getAttribute('href')).toBe('/profil');
      expect(btn.getAttribute('aria-label')).toBe('Mein Profil');
    });
  });

  it('renders the profile photo as a circular avatar inside the shortcut button when one is available', () => {
    mockAuth.user = { uid: 'test-uid' };
    mockProfile.photoURL = 'https://example.com/uploads/avatar.jpg';

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const buttons = screen.getAllByTestId('header-profile-button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      const avatar = btn.querySelector('img.header-profile-avatar');
      expect(avatar).not.toBeNull();
      expect(avatar?.getAttribute('src')).toBe('https://example.com/uploads/avatar.jpg');
    });

    // Sanity: no lucide UserCircle fallback should render inside the
    // shortcut when the user has a photo.
    const firstButton = container.querySelectorAll('[data-testid="header-profile-button"]')[0];
    expect(firstButton?.querySelector('svg')).toBeNull();
  });

  it('falls back to a lucide user icon inside the shortcut button when no photo is available', () => {
    mockAuth.user = { uid: 'test-uid' };
    mockProfile.photoURL = null;

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const buttons = screen.getAllByTestId('header-profile-button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      expect(btn.querySelector('img.header-profile-avatar')).toBeNull();
      expect(btn.querySelector('svg')).not.toBeNull();
    });
  });

  it('falls back to the auth provider photoURL when no Firestore profile photo is set', () => {
    mockAuth.user = { uid: 'test-uid', photoURL: 'https://example.com/google-avatar.jpg' };
    mockProfile.photoURL = null;

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const buttons = screen.getAllByTestId('header-profile-button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      const avatar = btn.querySelector('img.header-profile-avatar');
      expect(avatar?.getAttribute('src')).toBe('https://example.com/google-avatar.jpg');
    });
  });
});

describe('Header mobile hide-on-scroll behaviour (kq5ob4S0)', () => {
  type MediaListener = (event: { matches: boolean }) => void;

  interface FakeMediaQueryList {
    matches: boolean;
    media: string;
    onchange: MediaListener | null;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    addListener: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
    dispatch: (matches: boolean) => void;
  }

  const mediaQueries: FakeMediaQueryList[] = [];

  function installMatchMedia(initialMatches: boolean) {
    const lists: FakeMediaQueryList[] = [];
    const listeners: MediaListener[] = [];

    const factory = (query: string): FakeMediaQueryList => {
      const list: FakeMediaQueryList = {
        matches: initialMatches,
        media: query,
        onchange: null,
        addEventListener: vi.fn((event: string, cb: MediaListener) => {
          if (event === 'change') listeners.push(cb);
        }),
        removeEventListener: vi.fn((event: string, cb: MediaListener) => {
          if (event !== 'change') return;
          const i = listeners.indexOf(cb);
          if (i !== -1) listeners.splice(i, 1);
        }),
        addListener: vi.fn((cb: MediaListener) => listeners.push(cb)),
        removeListener: vi.fn((cb: MediaListener) => {
          const i = listeners.indexOf(cb);
          if (i !== -1) listeners.splice(i, 1);
        }),
        dispatch: (matches: boolean) => {
          list.matches = matches;
          listeners.forEach((l) => l({ matches }));
        },
      };
      lists.push(list);
      mediaQueries.push(list);
      return list;
    };

    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: factory,
    });

    return {
      lists,
      restore: () => {
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          configurable: true,
          value: original,
        });
      },
    };
  }

  function setScrollY(y: number) {
    Object.defineProperty(window, 'scrollY', {
      writable: true,
      configurable: true,
      value: y,
    });
  }

  async function flushAnimationFrames() {
    // The Header scroll handler schedules a single rAF; resolve it
    // inside an act() boundary so React commits the resulting
    // setState cleanly without warning about un-wrapped updates, then
    // yield once more so microtasks flush.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function scrollTo(y: number) {
    setScrollY(y);
    act(() => {
      fireEvent.scroll(window);
    });
  }

  beforeEach(() => {
    mediaQueries.length = 0;
    setScrollY(0);
  });

  it('hides the header on mobile after scrolling down past the threshold', async () => {
    installMatchMedia(true);
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const header = container.querySelector('header.header');
    expect(header).not.toBeNull();
    expect(header?.classList.contains('header--hidden')).toBe(false);

    scrollTo(200);
    await flushAnimationFrames();

    expect(header?.classList.contains('header--hidden')).toBe(true);
  });

  it('shows the header again after scrolling up past the threshold', async () => {
    installMatchMedia(true);
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const header = container.querySelector('header.header');
    expect(header).not.toBeNull();

    scrollTo(300);
    await flushAnimationFrames();
    expect(header?.classList.contains('header--hidden')).toBe(true);

    scrollTo(100);
    await flushAnimationFrames();
    expect(header?.classList.contains('header--hidden')).toBe(false);
  });

  it('keeps the header visible while the user is still inside the top buffer', async () => {
    installMatchMedia(true);
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const header = container.querySelector('header.header');

    scrollTo(40);
    await flushAnimationFrames();
    expect(header?.classList.contains('header--hidden')).toBe(false);

    scrollTo(70);
    await flushAnimationFrames();
    expect(header?.classList.contains('header--hidden')).toBe(false);
  });

  it('forces the header back to visible when the user reaches the top', async () => {
    installMatchMedia(true);
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const header = container.querySelector('header.header');

    scrollTo(500);
    await flushAnimationFrames();
    expect(header?.classList.contains('header--hidden')).toBe(true);

    scrollTo(0);
    await flushAnimationFrames();
    expect(header?.classList.contains('header--hidden')).toBe(false);
  });

  it('ignores tiny scroll deltas to avoid jitter at the threshold', async () => {
    installMatchMedia(true);
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const header = container.querySelector('header.header');

    // Cross the top buffer with a decisive downward scroll — header
    // hides as expected.
    scrollTo(200);
    await flushAnimationFrames();
    expect(header?.classList.contains('header--hidden')).toBe(true);

    // A 4px upward nudge (below SCROLL_DIRECTION_THRESHOLD = 8) must
    // NOT flip the state back to visible — bouncing back and forth a
    // handful of pixels is exactly the jitter this guard exists to
    // swallow.
    scrollTo(196);
    await flushAnimationFrames();
    expect(header?.classList.contains('header--hidden')).toBe(true);
  });

  it('does NOT hide the header on desktop viewports', async () => {
    installMatchMedia(false);
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const header = container.querySelector('header.header');
    expect(header).not.toBeNull();

    scrollTo(500);
    await flushAnimationFrames();

    expect(header?.classList.contains('header--hidden')).toBe(false);
  });

  it('does not hide the header while the mobile menu is open even on a scroll down', async () => {
    installMatchMedia(true);
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const header = container.querySelector('header.header');

    fireEvent.click(screen.getByRole('button', { name: /menü öffnen/i }));
    expect(header?.classList.contains('header--menu-open')).toBe(true);

    scrollTo(400);
    await flushAnimationFrames();
    expect(header?.classList.contains('header--hidden')).toBe(false);
  });

  it('reflects the visibility state in a data-header-visible attribute', async () => {
    installMatchMedia(true);
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const header = container.querySelector('header.header');
    expect(header?.getAttribute('data-header-visible')).toBe('true');

    scrollTo(400);
    await flushAnimationFrames();
    expect(header?.getAttribute('data-header-visible')).toBe('false');
  });

  it('restores the header when the viewport grows back into mobile range', async () => {
    const media = installMatchMedia(true);
    mockAuth.user = { uid: 'test-uid' };

    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const header = container.querySelector('header.header');

    scrollTo(400);
    await flushAnimationFrames();
    expect(header?.classList.contains('header--hidden')).toBe(true);

    // Cross the breakpoint into desktop — the hidden class must come
    // off and the header must be reachable again.
    act(() => {
      media.lists[0].dispatch(false);
    });
    await flushAnimationFrames();
    expect(header?.classList.contains('header--hidden')).toBe(false);
  });
});

describe('Header: Lagerfeuer chat link', () => {
  const renderHeader = () =>
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

  it('is hidden while the chat is closed for this person', () => {
    mockAuth.user = { uid: 'u1' };
    renderHeader();
    expect(screen.queryByTestId('nav-chat')).toBeNull();
  });

  it('shows a bubble with the number of people at the fire', () => {
    mockAuth.user = { uid: 'u1' };
    mockChat.available = true;
    mockChat.online = 3;
    renderHeader();
    expect(screen.getAllByTestId('chat-online-badge')[0]).toHaveTextContent('3');
    expect(screen.getAllByTestId('nav-chat')[0]).toHaveAttribute(
      'aria-label',
      'Lagerfeuer (3 Personen online)'
    );
  });

  it('shows no bubble when nobody is there', () => {
    mockAuth.user = { uid: 'u1' };
    mockChat.available = true;
    renderHeader();
    expect(screen.getAllByTestId('nav-chat').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('chat-online-badge')).toBeNull();
  });
});

describe('Header: Postfach link', () => {
  const renderHeader = () =>
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

  it('is hidden while the messenger is closed', () => {
    mockAuth.user = { uid: 'u1' };
    renderHeader();
    expect(screen.queryByTestId('nav-messenger')).toBeNull();
  });

  it('shows a bubble with the number of unread conversations', () => {
    mockAuth.user = { uid: 'u1' };
    mockChat.dm = true;
    mockChat.unread = 2;
    renderHeader();
    expect(screen.getAllByTestId('messenger-unread-badge')[0]).toHaveTextContent('2');
    expect(screen.getAllByTestId('nav-messenger')[0]).toHaveAttribute(
      'aria-label',
      'Postfach (2 ungelesene Unterhaltungen)'
    );
  });

  it('shows the link without a bubble when everything is read', () => {
    mockAuth.user = { uid: 'u1' };
    mockChat.dm = true;
    renderHeader();
    expect(screen.getAllByTestId('nav-messenger').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('messenger-unread-badge')).toBeNull();
  });
});

describe('Header: desktop account menu', () => {
  const renderHeader = () =>
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

  it('keeps favorites, profile, Verwaltung and logout out of the main row until it is opened', () => {
    mockAuth.user = { uid: 'u1' };
    renderHeader();
    const toggle = screen.getByTestId('account-menu-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-haspopup', 'menu');
    const panel = document.getElementById('account-menu-panel') as HTMLElement;
    expect(panel).toHaveAttribute('hidden');
    ['Mein Profil', 'Meine Favoriten', 'Verwaltung', 'Abmelden'].forEach((label) => {
      expect(panel.textContent).toContain(label);
    });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toHaveAttribute('hidden');
  });

  it('closes on Escape and on a click outside', () => {
    mockAuth.user = { uid: 'u1' };
    renderHeader();
    const toggle = screen.getByTestId('account-menu-toggle');
    fireEvent.click(toggle);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();

    fireEvent.click(toggle);
    fireEvent.mouseDown(document.body);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes after choosing an entry', () => {
    mockAuth.user = { uid: 'u1' };
    renderHeader();
    const toggle = screen.getByTestId('account-menu-toggle');
    fireEvent.click(toggle);
    const panel = document.getElementById('account-menu-panel') as HTMLElement;
    fireEvent.click(panel.querySelector('a[href="/favoriten"]') as HTMLElement);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the unread count on the avatar while the menu is closed', () => {
    mockAuth.user = { uid: 'u1' };
    mockUseUnread.count = 3;
    renderHeader();
    expect(screen.getByTestId('account-unread-badge')).toHaveTextContent('3');
    expect(screen.getByTestId('account-menu-toggle')).toHaveAttribute(
      'aria-label',
      'Mein Konto (3 ungelesene Benachrichtigungen)'
    );
    fireEvent.click(screen.getByTestId('account-menu-toggle'));
    expect(screen.queryByTestId('account-unread-badge')).toBeNull();
  });

  it('has no account menu when logged out; login and create stay in the row', () => {
    mockAuth.user = null;
    renderHeader();
    expect(screen.queryByTestId('account-menu-toggle')).toBeNull();
    expect(screen.getAllByTestId('event-create-cta').length).toBeGreaterThan(0);
  });

  it('keeps the Postfach link as an icon with an accessible name on desktop', () => {
    mockAuth.user = { uid: 'u1' };
    mockChat.dm = true;
    renderHeader();
    const link = document.querySelector(
      '.nav-desktop [data-testid="nav-messenger"]'
    ) as HTMLElement;
    expect(link.className).toContain('nav-link--icon');
    expect(link).toHaveAttribute('aria-label', 'Postfach');
  });
});

describe('Header slogan saved in Über uns', () => {
  const withSlogan = (extra: Record<string, unknown>) => ({
    ...DEFAULT_REGION_CONTEXT,
    region: { ...DEFAULT_REGION_CONTEXT.region, ...extra },
  });
  const renderWith = (ctx: typeof DEFAULT_REGION_CONTEXT) =>
    render(
      <RegionContext.Provider value={ctx}>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </RegionContext.Provider>
    );

  it('shows the saved two lines instead of the defaults', () => {
    renderWith(withSlogan({ aboutSlogan1: 'Dein Kalender', aboutSlogan2: 'für Bewusstsein' }));
    expect(screen.getByText('Dein Kalender')).toBeInTheDocument();
    expect(screen.getByText('für Bewusstsein')).toBeInTheDocument();
    expect(screen.queryByText('für bewusste Events')).not.toBeInTheDocument();
  });

  it("falls back to today's text for a line that is empty", () => {
    renderWith(withSlogan({ aboutSlogan1: '', aboutSlogan2: 'für Bewusstsein' }));
    expect(screen.getByText('Dein Vorarlberger Kalender')).toBeInTheDocument();
    expect(screen.getByText('für Bewusstsein')).toBeInTheDocument();
  });
});

describe('Header above "Wo suchst du?"', () => {
  it('shows the neutral title and subtitle and no region switcher', () => {
    const regions = mergeRegions([{ id: 'tirol', active: true }]).filter((r) => r.active);
    const ctx = {
      ...DEFAULT_REGION_CONTEXT,
      region: { ...DEFAULT_REGION_CONTEXT.region, aboutSlogan1: 'Ländle', aboutSlogan2: 'Events' },
      regions,
      neutralHeader: true,
      regionChooserOpen: true,
    };
    render(
      <RegionContext.Provider value={ctx}>
        <MemoryRouter initialEntries={['/regionen']}>
          <Header />
        </MemoryRouter>
      </RegionContext.Provider>
    );
    expect(screen.getByText('Dein Kalender')).toBeInTheDocument();
    expect(screen.getByText('für bewusste Events')).toBeInTheDocument();
    expect(screen.queryByText(/Vorarlberg|Ländle/)).toBeNull();
    expect(screen.queryByTestId('region-switcher')).toBeNull();
  });
});

describe('Header logo target', () => {
  const WITH_TIROL = mergeRegions([{ id: 'tirol', active: true }]);
  const renderLogo = (ctx: Partial<typeof DEFAULT_REGION_CONTEXT> = {}) => {
    render(
      <RegionContext.Provider
        value={
          {
            ...DEFAULT_REGION_CONTEXT,
            allRegions: WITH_TIROL,
            ...ctx,
          } as typeof DEFAULT_REGION_CONTEXT
        }
      >
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </RegionContext.Provider>
    );
    return screen.getByTestId('header-logo');
  };
  const signIn = (regionId: string | null) => {
    mockAuth.user = { uid: 'u1' };
    mockProfile.placeSelection = { regionId };
  };

  it('leads a signed-in person to the active region of the profile', () => {
    signIn('tirol');
    expect(renderLogo()).toHaveAttribute('href', '/tirol');
  });

  it('leads to "Wo suchst du?" when the profile region is not active', () => {
    signIn('steiermark');
    expect(renderLogo()).toHaveAttribute('href', '/regionen');
  });

  it('leads to "Wo suchst du?" when the profile region is unknown', () => {
    signIn('atlantis');
    expect(renderLogo()).toHaveAttribute('href', '/regionen');
  });

  it('stays / for a signed-in person without a place in the profile', () => {
    mockAuth.user = { uid: 'u1' };
    expect(renderLogo()).toHaveAttribute('href', '/');
  });

  it('stays / for signed-out visitors even with a profile place in the mock', () => {
    mockProfile.placeSelection = { regionId: 'tirol' };
    expect(renderLogo()).toHaveAttribute('href', '/');
  });

  it('stays / while the region config is loading (no early jump to /regionen)', () => {
    signIn('tirol');
    expect(renderLogo({ loading: true })).toHaveAttribute('href', '/');
  });

  it('stays / with only Vorarlberg active (dark launch)', () => {
    signIn('tirol');
    expect(renderLogo({ allRegions: DEFAULT_REGION_CONTEXT.allRegions })).toHaveAttribute(
      'href',
      '/'
    );
  });
});
