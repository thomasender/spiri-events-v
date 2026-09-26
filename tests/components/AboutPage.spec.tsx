import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AboutPage from '../../src/pages/AboutPage';

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
}));

const mockAuth = vi.hoisted(() => ({
  user: null as null | { uid: string; email?: string | null; displayName?: string | null },
  loading: false,
}));

vi.mock('../../src/hooks/useHelpers', () => ({
  useHelpers: () => mockHelpers,
}));

vi.mock('../../src/hooks/useDonors', () => ({
  useDonors: () => mockDonors,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../../src/components/FeedbackModal', () => ({
  default: () => null,
}));

function renderAboutPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/ueber-uns']}>
        <Routes>
          <Route path="/ueber-uns" element={<AboutPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  mockHelpers.helpers = [];
  mockHelpers.loading = false;
  mockHelpers.error = null;
  mockDonors.donors = [];
  mockDonors.loading = false;
  mockDonors.error = null;
  mockAuth.user = null;
  mockAuth.loading = false;
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
    expect(screen.getByRole('heading', { name: /Hände hinter tribe/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Spende — damit tribe/ })).toBeInTheDocument();
  });

  it('renders the founders with photos and links', () => {
    renderAboutPage();

    const peterImg = screen.getByAltText(/Peter Mathis/);
    expect(peterImg).toHaveAttribute('src', '/peter.jpg');

    const thomasImg = screen.getByAltText(/Thomas Ender/);
    expect(thomasImg).toHaveAttribute('src', '/thomas.jpg');

    const janaImg = screen.getByAltText(/Jana Sunjevic/);
    expect(janaImg).toHaveAttribute('src', '/jana.jpg');

    const links = document.querySelectorAll('.about-founder-link');
    const hrefs = Array.from(links).map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('https://www.petermathis.at');
    expect(hrefs).toContain('https://www.blissofkundalini.yoga');
    expect(hrefs).toContain('https://www.instagram.com/jana.select/');
  });

  it('embeds the donation block on the support section', () => {
    renderAboutPage();

    const supportSection = document.getElementById('spenden');
    expect(supportSection).not.toBeNull();
    expect(supportSection?.querySelector('.donation-block')).not.toBeNull();
  });

  it('highlights the core line "Zurück zu uns Selbst zu kommen"', () => {
    renderAboutPage();
    const highlight = document.querySelector('.about-highlight');
    expect(highlight).not.toBeNull();
    expect(highlight?.textContent).toContain('Zurück zu uns Selbst zu kommen');
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

  it('renders the helpers list and donor list blocks', () => {
    renderAboutPage();
    expect(document.querySelector('.about-section--helpers')).not.toBeNull();
    expect(screen.getByTestId('about-donors-block')).toBeInTheDocument();
  });
});

describe('AboutPage helpers list (5dlVbOmf)', () => {
  it('renders an empty-state when no helpers exist', () => {
    mockHelpers.helpers = [];
    renderAboutPage();
    expect(screen.getByTestId('helpers-list-empty')).toBeInTheDocument();
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

  it('renders a placeholder initial when no photoURL is provided', () => {
    mockHelpers.helpers = [{ id: 'h1', name: 'Bernd Berger' }];
    renderAboutPage();
    const card = screen.getByTestId('helpers-list-card');
    const placeholder = card.querySelector('.helpers-list-photo-placeholder');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toBe('B');
  });

  it('shows a loading hint while the helpers registry loads', () => {
    mockHelpers.loading = true;
    renderAboutPage();
    expect(screen.getByTestId('helpers-list-loading')).toBeInTheDocument();
  });

  it('falls back to a friendly error message on registry failure', () => {
    mockHelpers.error = 'permission-denied';
    renderAboutPage();
    expect(screen.getByTestId('helpers-list-error')).toBeInTheDocument();
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

describe('AboutPage contact CTAs (6ab4f6e5)', () => {
  it('renders the three contact CTAs as mailto links when no user is logged in', () => {
    renderAboutPage();

    const sayHello = screen.getByTestId('about-say-hello-link');
    expect(sayHello.tagName).toBe('A');
    expect(sayHello).toHaveAttribute('href', 'mailto:admin@thetribe.at');
    expect(sayHello).toHaveTextContent('Sag uns Hallo');

    const joinUs = screen.getByTestId('about-contact-us-link');
    expect(joinUs.tagName).toBe('A');
    expect(joinUs).toHaveAttribute('href', 'mailto:admin@thetribe.at');
    expect(joinUs).toHaveTextContent('melde dich gerne bei uns');

    const getInTouch = screen.getByTestId('about-get-in-touch-link');
    expect(getInTouch.tagName).toBe('A');
    expect(getInTouch).toHaveAttribute('href', 'mailto:admin@thetribe.at');
    expect(getInTouch).toHaveTextContent('Kontakt mit uns auf');
  });

  it('renders the three contact CTAs as buttons that open the modal when a user is logged in', () => {
    mockAuth.user = { uid: 'user-1', email: 'peter@example.com', displayName: 'Peter' };
    renderAboutPage();

    const sayHello = screen.getByTestId('about-say-hello-link');
    expect(sayHello.tagName).toBe('BUTTON');
    expect(sayHello).toHaveTextContent('Sag uns Hallo');

    const joinUs = screen.getByTestId('about-contact-us-link');
    expect(joinUs.tagName).toBe('BUTTON');

    const getInTouch = screen.getByTestId('about-get-in-touch-link');
    expect(getInTouch.tagName).toBe('BUTTON');

    expect(screen.queryByTestId('feedback-modal')).not.toBeInTheDocument();
  });
});
