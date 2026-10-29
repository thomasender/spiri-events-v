import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AboutPage from '../../src/pages/AboutPage';
import { RegionContext, DEFAULT_REGION_CONTEXT } from '../../src/hooks/useRegion';
import { STATIC_REGIONS, mergeRegions } from '../../src/utils/regions';

const mockHelpers = vi.hoisted(() => ({
  helpers: [] as Array<{
    id: string;
    name: string;
    profileSlug?: string | null;
    website?: string | null;
    photoURL?: string | null;
    description?: string | null;
  }>,
  loading: false,
  error: null as string | null,
  regionIdArg: null as string | null,
}));

const mockDonors = vi.hoisted(() => ({
  donors: [] as Array<{
    id: string;
    name?: string | null;
    amount?: number | null;
    frequency?: 'one-time' | 'monthly' | null;
  }>,
  loading: false,
  error: null as string | null,
  regionIdArg: null as string | null,
}));

vi.mock('../../src/hooks/useHelpers', () => ({
  useHelpers: (regionId: string) => {
    mockHelpers.regionIdArg = regionId;
    return mockHelpers;
  },
}));

vi.mock('../../src/hooks/useDonors', () => ({
  useDonors: (regionId: string) => {
    mockDonors.regionIdArg = regionId;
    return mockDonors;
  },
}));

vi.mock('../../src/components/ContactFormModal', () => ({
  default: ({ open, defaultSubject, recipientEmail } = {}) =>
    open ? (
      <div data-testid="contact-modal">
        <span data-testid="contact-modal-default-subject">{defaultSubject}</span>
        {recipientEmail && <span data-testid="contact-modal-recipient">{recipientEmail}</span>}
      </div>
    ) : null,
}));

function renderAboutPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/ueber-uns']}>
        <Routes>
          <Route path="/ueber-uns" element={<AboutPage />} />
          <Route path="/impressum" element={<div>Impressum page</div>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  mockHelpers.helpers = [];
  mockHelpers.loading = false;
  mockHelpers.error = null;
  mockHelpers.regionIdArg = null;
  mockDonors.donors = [];
  mockDonors.loading = false;
  mockDonors.error = null;
  mockDonors.regionIdArg = null;
});

describe('AboutPage', () => {
  it('renders the hero headline', () => {
    renderAboutPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dein Tribe ruft dich.');
  });

  it('renders the hero photo at the top of the page', () => {
    renderAboutPage();
    const heroImg = document.querySelector('.about-hero-image');
    expect(heroImg).not.toBeNull();
    expect(heroImg?.getAttribute('src')).toBe('/hero.jpeg');
  });

  it('renders all main content sections', () => {
    renderAboutPage();
    expect(screen.getByText('Deine Heimat Vorarlberg ruft dich.')).toBeInTheDocument();
    expect(screen.getByText('Kalender')).toBeInTheDocument();
    expect(screen.getByText('Unsere Werte')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Wer wir sind/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Spende — damit der Tribe/ })).toBeInTheDocument();
  });

  it('does not render the founder photo cards on the About page', () => {
    renderAboutPage();
    expect(document.querySelector('.about-founders')).toBeNull();
    expect(document.querySelector('.about-founder-card')).toBeNull();
    expect(screen.queryByAltText(/Peter Mathis/)).not.toBeInTheDocument();
    expect(screen.queryByAltText(/Thomas Ender/)).not.toBeInTheDocument();
    expect(screen.queryByAltText(/Jana Sunjevic/)).not.toBeInTheDocument();
  });

  it('links "drei Vorarlberger:innen" to the Impressum page', () => {
    renderAboutPage();
    const foundersLink = screen.getByTestId('about-founders-link');
    expect(foundersLink.tagName).toBe('A');
    expect(foundersLink).toHaveAttribute('href', '/impressum');
    expect(foundersLink).toHaveTextContent('drei Vorarlberger:innen');
  });

  it('embeds the donation block on the support section', () => {
    renderAboutPage();

    const supportSection = document.getElementById('spenden');
    expect(supportSection).not.toBeNull();
    expect(supportSection?.querySelector('.donation-block')).not.toBeNull();
  });

  it('re-aligns to #spenden when the layout above it changes after the first jump', () => {
    let resizeCb: () => void = () => {};
    class FakeResizeObserver {
      constructor(cb: () => void) {
        resizeCb = cb;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    try {
      render(
        <HelmetProvider>
          <MemoryRouter initialEntries={['/ueber-uns#spenden']}>
            <Routes>
              <Route path="/ueber-uns" element={<AboutPage />} />
            </Routes>
          </MemoryRouter>
        </HelmetProvider>
      );
      expect(scrollSpy).toHaveBeenCalledTimes(1);
      resizeCb();
      expect(scrollSpy).toHaveBeenCalledTimes(2);
      expect(scrollSpy.mock.contexts[1]).toBe(document.getElementById('spenden'));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('highlights the core line "Zurück zu uns Selbst zu kommen"', () => {
    renderAboutPage();
    const highlight = document.querySelector('.about-highlight');
    expect(highlight).not.toBeNull();
    expect(highlight?.textContent).toContain('Zurück zu uns Selbst zu kommen');
  });

  it('offers the donation button next to "Zum Kalender" (o9aEDPbY)', () => {
    renderAboutPage();
    const donate = screen.getByTestId('about-donate-link');
    expect(donate).toHaveTextContent('Den Kalender unterstützen');
    expect(donate).toHaveAttribute('href', '/ueber-uns#spenden');
    expect(donate.previousElementSibling).toBe(screen.getByRole('link', { name: 'Zum Kalender' }));
  });

  it('keeps a back link to the calendar', () => {
    renderAboutPage();
    const backLink = screen.getByRole('link', { name: /zurück zur startseite/i });
    expect(backLink).toHaveAttribute('href', '/');
  });

  it('includes a callout inviting visitors to join the tribe', () => {
    renderAboutPage();
    expect(screen.getByText(/du gehörst dazu/i)).toBeInTheDocument();
  });

  it('renders the donor list block', () => {
    renderAboutPage();
    expect(screen.getByTestId('about-donors-block')).toBeInTheDocument();
  });
});

describe('AboutPage helpers list (5dlVbOmf)', () => {
  it("shows Vorarlberg's helpers in their own section", () => {
    mockHelpers.helpers = [{ id: 'h1', name: 'Anna' }];
    renderAboutPage();
    expect(mockHelpers.regionIdArg).toBe('vorarlberg');
    const section = document.getElementById('helfer');
    expect(section).not.toBeNull();
    expect(section).toHaveTextContent('Die Hände hinter tribe Vorarlberg');
    expect(section).toHaveTextContent('Anna');
  });

  it.each([
    ['there are no helpers', {}],
    ['the helpers are still loading', { loading: true }],
    ['the helpers failed to load', { error: 'permission-denied' }],
  ])('leaves the whole section out while %s', (_name, patch) => {
    Object.assign(mockHelpers, patch);
    renderAboutPage();
    expect(document.getElementById('helfer')).toBeNull();
    expect(screen.queryByText(/Mithelfer:innen/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('helpers-list')).not.toBeInTheDocument();
  });

  it('renders a card for each helper with name, photo and links', () => {
    mockHelpers.helpers = [
      {
        id: 'h1',
        name: 'Anna Müller',
        profileSlug: '/anna',
        website: 'https://anna.example',
        photoURL: '/anna.jpg',
        description: 'Hilft bei Fotografie und Events.',
      },
    ];
    renderAboutPage();
    const cards = screen.getAllByTestId('helpers-list-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('Anna Müller');
    expect(cards[0]).toHaveTextContent('Hilft bei Fotografie und Events.');
    expect(cards[0].querySelector('.helpers-list-photo')).not.toBeNull();
    expect(screen.getByTestId('helpers-list-profile-link')).toHaveAttribute('href', '/anna');
    expect(screen.getByTestId('helpers-list-website-link')).toHaveAttribute(
      'href',
      'https://anna.example'
    );
  });

  it('renders a fallback placeholder when no photoURL is provided', () => {
    mockHelpers.helpers = [{ id: 'h1', name: 'Bernd Berger' }];
    renderAboutPage();
    const card = screen.getByTestId('helpers-list-card');
    const placeholder = card.querySelector('.helpers-list-photo-placeholder');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent?.trim()).toBe('');
  });
});

describe('AboutPage donors list (5dlVbOmf)', () => {
  it('renders an empty-state when no donors exist', () => {
    mockDonors.donors = [];
    renderAboutPage();
    expect(screen.getByTestId('donors-list-empty')).toBeInTheDocument();
  });

  it('renders each donor with their name and amount', () => {
    mockDonors.donors = [
      { id: 'd1', name: 'Anna Müller', amount: 25, frequency: 'one-time' },
      { id: 'd2', name: null, amount: 10, frequency: 'monthly' },
      { id: 'd3', name: 'Bernd Berger', amount: null, frequency: 'monthly' },
    ];
    renderAboutPage();
    const items = screen.getAllByTestId('donors-list-item');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Anna Müller');
    expect(items[0]).toHaveTextContent('25,00 €');
    expect(items[1]).toHaveAttribute('data-anonymous', 'true');
    expect(items[1]).toHaveTextContent('Anonyme:r Spender:in');
    expect(items[2]).toHaveTextContent('Bernd Berger');
    expect(items[2].querySelector('[data-testid="donors-list-amount"]')).toBeNull();
  });

  it('formats decimal amounts with a comma separator', () => {
    mockDonors.donors = [{ id: 'd1', name: 'Anna', amount: 12.5, frequency: 'one-time' }];
    renderAboutPage();
    expect(screen.getByTestId('donors-list-amount')).toHaveTextContent('12,50 €');
  });

  it('shows a loading hint while the donors registry loads', () => {
    mockDonors.loading = true;
    renderAboutPage();
    expect(screen.getByTestId('donors-list-loading')).toBeInTheDocument();
  });
});

describe('AboutPage contact CTAs (6ab4f6e5 + VHzOoH6Y)', () => {
  // "Sag uns Hallo" sits in the helpers section, which needs at least one helper.
  beforeEach(() => {
    mockHelpers.helpers = [{ id: 'h1', name: 'Anna' }];
  });

  it('renders the three contact CTAs as buttons (no mailto fallback)', () => {
    renderAboutPage();

    const sayHello = screen.getByTestId('about-say-hello-link');
    expect(sayHello.tagName).toBe('BUTTON');
    expect(sayHello).toHaveTextContent('Sag uns Hallo');

    const joinUs = screen.getByTestId('about-contact-us-link');
    expect(joinUs.tagName).toBe('BUTTON');
    expect(joinUs).toHaveTextContent('melde dich gerne bei uns');

    const getInTouch = screen.getByTestId('about-get-in-touch-link');
    expect(getInTouch.tagName).toBe('BUTTON');
    expect(getInTouch).toHaveTextContent('Kontakt mit uns auf');
  });

  it('opens the contact modal with the default subject when a CTA is clicked', () => {
    renderAboutPage();
    expect(screen.queryByTestId('contact-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('about-say-hello-link'));

    const modal = screen.getByTestId('contact-modal');
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId('contact-modal-default-subject')).toHaveTextContent(
      'Hallo Tribe Vorarlberg'
    );
    expect(screen.getByTestId('contact-modal-recipient')).toHaveTextContent('admin@thetribe.at');
  });
});

describe('AboutPage — region mode', () => {
  beforeEach(() => {
    mockHelpers.helpers = [
      { id: 'h1', name: 'Anna Alpha' },
      { id: 'h2', name: 'Berta Beta' },
    ];
    mockHelpers.loading = false;
    mockHelpers.error = null;
  });

  function renderRegion(
    aboutDoc: Record<string, unknown>,
    activeIds = ['vorarlberg', 'tirol'],
    overrides: Record<string, unknown> = {}
  ) {
    const allRegions = mergeRegions(
      STATIC_REGIONS.map((r) => ({
        id: r.id,
        active: activeIds.includes(r.id),
        ...(r.id === 'tirol' ? aboutDoc : {}),
      }))
    );
    const ctx = {
      ...DEFAULT_REGION_CONTEXT,
      allRegions,
      regions: allRegions.filter((r) => r.active),
      regionId: 'tirol',
      region: allRegions.find((r) => r.id === 'tirol'),
      ...overrides,
    };
    return render(
      <HelmetProvider>
        <RegionContext.Provider value={ctx as never}>
          <MemoryRouter initialEntries={['/tirol/ueber-uns']}>
            <Routes>
              <Route path="/tirol/ueber-uns" element={<AboutPage />} />
            </Routes>
          </MemoryRouter>
        </RegionContext.Provider>
      </HelmetProvider>
    );
  }

  it('names the region and shows its helpers, with the header photo of its moderators', () => {
    renderRegion({
      aboutHeaderImage: 'https://example.com/tirol-header.jpg',
    });

    expect(mockHelpers.regionIdArg).toBe('tirol');
    expect(
      screen.getByRole('heading', { name: /Deine Heimat Tirol ruft dich/ })
    ).toBeInTheDocument();
    expect(screen.getByText('Anna Alpha')).toBeInTheDocument();
    expect(screen.getByText('Berta Beta')).toBeInTheDocument();
    expect(document.querySelector('.about-hero-image')).toHaveAttribute(
      'src',
      'https://example.com/tirol-header.jpg'
    );
  });

  it('lists the donors of its region', () => {
    renderRegion({});
    expect(mockDonors.regionIdArg).toBe('tirol');
  });

  it('leaves the helpers section out when the region has none', () => {
    mockHelpers.helpers = [];
    renderRegion({});
    expect(mockHelpers.regionIdArg).toBe('tirol');
    expect(document.getElementById('helfer')).toBeNull();
  });

  it("a combined view (national page) shows Vorarlberg's helpers", () => {
    renderRegion({}, ['vorarlberg', 'tirol'], { isNational: true, region: null, regionId: null });
    expect(mockHelpers.regionIdArg).toBe('vorarlberg');
    expect(mockDonors.regionIdArg).toBe('vorarlberg');
    expect(screen.getByText('Anna Alpha')).toBeInTheDocument();
  });

  it('shows the text written by the moderators instead of the default text', () => {
    renderRegion({ aboutText: '<p>Unser eigener Tiroler Text</p>' });

    expect(
      screen.getByRole('heading', { name: /Deine Heimat Tirol ruft dich/ })
    ).toBeInTheDocument();
    expect(screen.getByText('Unser eigener Tiroler Text')).toBeInTheDocument();
    expect(screen.queryByText('Selbsterkenntnis')).not.toBeInTheDocument();
  });

  it('a region without own text shows the default text and the default photo', () => {
    renderRegion({});

    expect(screen.getByText('Selbsterkenntnis')).toBeInTheDocument();
    expect(document.querySelector('.about-hero-image')).toHaveAttribute('src', '/hero.jpeg');
  });

  it('links the Instagram name of the region, safely', () => {
    renderRegion({ instagramHandle: '@tribe.tirol' });

    const link = screen.getByTestId('about-instagram-link').querySelector('a')!;
    expect(link).toHaveAttribute('href', 'https://www.instagram.com/tribe.tirol/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent('@tribe.tirol');
  });

  it('shows no Instagram link for a region without a name', () => {
    renderRegion({});
    expect(screen.queryByTestId('about-instagram-link')).not.toBeInTheDocument();
  });
});
