import { render, screen, fireEvent } from '@testing-library/react';
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

vi.mock('../../src/hooks/useHelpers', () => ({
  useHelpers: () => mockHelpers,
}));

vi.mock('../../src/hooks/useDonors', () => ({
  useDonors: () => mockDonors,
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
  mockDonors.donors = [];
  mockDonors.loading = false;
  mockDonors.error = null;
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

  it('renders a fallback placeholder when no photoURL is provided', () => {
    mockHelpers.helpers = [{ id: 'h1', name: 'Bernd Berger' }];
    renderAboutPage();
    const card = screen.getByTestId('helpers-list-card');
    const placeholder = card.querySelector('.helpers-list-photo-placeholder');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent?.trim()).toBe('');
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

describe('AboutPage contact CTAs (6ab4f6e5 + VHzOoH6Y)', () => {
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
