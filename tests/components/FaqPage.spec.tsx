import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FaqPage from '../../src/pages/FaqPage';

type Faq = {
  id: string;
  question: string;
  answerHtml: string;
  topic: string;
  order: number;
  published: boolean;
};

const mockFaqs = vi.hoisted(() => ({
  faqs: [] as Faq[],
  loading: false,
  error: null as string | null,
  args: undefined as unknown,
}));

vi.mock('../../src/hooks/useFaqs', () => ({
  useFaqs: (args: unknown) => {
    mockFaqs.args = args;
    return mockFaqs;
  },
}));

// DOMPurify does not clean in this jsdom setup (see RichTextView.spec.tsx); the
// sanitising rules are covered in sanitize.spec.ts. Here: the answer goes through
// sanitizeHtml before it reaches the page.
const mockSanitize = vi.hoisted(() =>
  vi.fn((html: string) => (html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''))
);
vi.mock('../../src/utils/sanitize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/sanitize')>();
  return { ...actual, sanitizeHtml: (html: string) => mockSanitize(html) };
});

vi.mock('../../src/components/ContactFormModal', () => ({
  default: ({ open, defaultSubject }: { open: boolean; defaultSubject: string }) =>
    open ? <div data-testid="contact-modal">{defaultSubject}</div> : null,
}));

const SEED: Faq[] = [
  {
    id: 'e1',
    question: 'Wer darf Events eintragen?',
    answerHtml: '<p>Alle mit einem Konto.</p>',
    topic: 'Events',
    order: 100,
    published: true,
  },
  {
    id: 'p1',
    question: 'Warum heißt die Plattform „dein tribe“?',
    answerHtml: '<p>Weil wir <strong>verbinden</strong>.</p><script>alert(1)</script>',
    topic: 'Plattform',
    order: 0,
    published: true,
  },
  {
    id: 'd1',
    question: 'Geheimer Entwurf?',
    answerHtml: '<p>Noch nicht fertig.</p>',
    topic: 'Plattform',
    order: 50,
    published: false,
  },
];

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/faq']}>
        <FaqPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  mockFaqs.faqs = SEED;
  mockFaqs.loading = false;
  mockFaqs.error = null;
});

describe('FaqPage', () => {
  it('shows the intro text from the ticket', () => {
    renderPage();
    expect(screen.getByTestId('faq-intro')).toHaveTextContent(
      /^Transparenz, Offenheit und ehrliche Kommunikation gehören zu unseren zentralen Werten\..*mehr Menschen, als man denkt\.$/
    );
  });

  it('reads published entries only (no drafts option)', () => {
    renderPage();
    expect(mockFaqs.args).toBeUndefined();
  });

  it('groups by topic in order and hides drafts', () => {
    renderPage();
    const sections = screen.getAllByTestId('faq-section');
    expect(sections.map((s) => s.querySelector('h2')?.textContent)).toEqual([
      'Plattform',
      'Events',
    ]);
    expect(within(sections[0]).getAllByTestId('faq-item')).toHaveLength(1);
    expect(screen.queryByText('Geheimer Entwurf?')).not.toBeInTheDocument();
    expect(screen.getByTestId('faq-topics')).toHaveTextContent('PlattformEvents');
    expect(sections[0]).toHaveAttribute('id', 'thema-plattform');
    expect(within(sections[0]).getByTestId('faq-item')).toHaveAttribute(
      'id',
      'frage-warum-heisst-die-plattform-dein-tribe'
    );
  });

  it('renders the answer sanitised', () => {
    const { container } = renderPage();
    expect(mockSanitize).toHaveBeenCalledWith(SEED[1].answerHtml);
    expect(screen.getByText('verbinden').tagName).toBe('STRONG');
    expect(container.querySelector('script')).toBeNull();
  });

  it('filters while typing and opens the hits', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('faq-search'), { target: { value: 'konto' } });
    const items = screen.getAllByTestId('faq-item');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Wer darf Events eintragen?');
    expect(items[0]).toHaveAttribute('open');
    expect(screen.getByTestId('faq-search-status')).toHaveTextContent('1 Frage gefunden');
    expect(screen.queryByTestId('faq-topics')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('faq-search'), { target: { value: 'nichtsda' } });
    expect(screen.queryAllByTestId('faq-item')).toHaveLength(0);
    expect(screen.getByTestId('faq-search-status')).toHaveTextContent(
      'Keine passende Frage gefunden.'
    );

    fireEvent.change(screen.getByTestId('faq-search'), { target: { value: '' } });
    expect(screen.getAllByTestId('faq-item')).toHaveLength(2);
  });

  it('shows an empty state when nothing is published', () => {
    mockFaqs.faqs = [SEED[2]];
    renderPage();
    expect(screen.getByTestId('faq-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('faq-search')).not.toBeInTheDocument();
    // Asking a question is still possible.
    expect(screen.getByTestId('faq-ask')).toBeInTheDocument();
  });

  it('shows an error instead of the list when loading fails', () => {
    mockFaqs.error = 'permission-denied';
    renderPage();
    expect(screen.getByTestId('faq-error')).toBeInTheDocument();
  });

  it('opens the contact form from "Deine Frage fehlt?"', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('faq-ask-button'));
    expect(screen.getByTestId('contact-modal')).toHaveTextContent('Frage für die FAQ');
  });
});
