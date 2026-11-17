import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

const mockAuth = vi.hoisted(() => ({
  user: { uid: 'user-uid', email: 'user@test.local', emailVerified: true },
  role: null,
  canCreateEvents: true,
}));

const mockProfile = vi.hoisted(() => ({ value: null }));

const mockEvents = vi.hoisted(() => ({
  addEvent: vi.fn(async () => ({ id: 'new-event-id' })),
  updateEvent: vi.fn(async () => {}),
}));

const mockNavigate = vi.fn();

const mockConfetti = vi.hoisted(() => Object.assign(vi.fn(), { reset: vi.fn() }));

vi.mock('canvas-confetti', () => ({
  default: Object.assign(vi.fn(), { create: () => mockConfetti }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({}),
  };
});

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: mockProfile.value }),
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockEvents,
  useAllEvents: () => ({ events: [], loading: false, error: null }),
  KATEGORIEN: ['Yoga', 'Breathwork', 'Meditation', 'Tanz', 'Singen', 'Soundhealing', 'Sonstiges'],
  BEZIRKE: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'],
}));

vi.mock('../../src/hooks/useCategories', () => ({
  useCategories: () => [
    'Yoga',
    'Breathwork',
    'Meditation',
    'Tanz',
    'Singen',
    'Soundhealing',
    'Sonstiges',
  ],
}));

vi.mock('../../src/lib/imageUpload', () => ({
  uploadImage: vi.fn(async () => 'https://example.com/test.jpg'),
  uploadEventCover: vi.fn(async () => ({ url: 'https://example.com/test.jpg', thumbUrl: null })),
  deleteImageByUrl: vi.fn(async () => {}),
  getImageDimensions: vi.fn(async () => ({ width: 1200, height: 800 })),
  getAspectRatioRecommendation: vi.fn(() => ({ isRecommended: true })),
  MAX_INPUT_SIZE_BYTES: 5 * 1024 * 1024,
}));

import EventFormWizard from '../../src/components/EventFormWizard';
import { clearWizardDraftFiles, saveWizardDraftFiles } from '../../src/utils/wizardDraftFiles';
import { FAQ_EVENT_GUIDE_PATH, FAQ_EVENT_GUIDE_QUESTION, faqSlug } from '../../src/utils/faqs';

const FUTURE_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
})();

function seedDraft(currentStep: number) {
  clearWizardDraftFiles('user-uid');
  saveWizardDraftFiles('user-uid', {
    cover: new File(['x'], 'cover.jpg', { type: 'image/jpeg' }),
  });
  localStorage.setItem(
    'eventWizardDraft:user-uid',
    JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      draft: {
        formData: {
          title: 'FAQ Link Event',
          date: FUTURE_DATE,
          time: '10:00',
          endDate: '',
          place: 'Test Place',
          contribution: 'free',
          fee: '',
          priceCurrency: 'EUR',
          feeNote: '',
          description: '<p>Beschreibung</p>',
          link: '',
          recurrence: 'none',
          recurrenceEndDate: '',
          customDates: [],
          category: 'Yoga',
          bezirk: 'Bregenz',
          city: 'Bregenz',
          isOnline: false,
          organizer: { name: 'Test User', email: 'user@test.local' },
          kontakt: 'user@test.local',
        },
        currentStep,
        rightsConfirmed: true,
      },
    })
  );
}

function renderWizard() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/admin/new']}>
        <EventFormWizard />
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  mockAuth.user = { uid: 'user-uid', email: 'user@test.local', emailVerified: true };
  mockAuth.role = null;
  mockProfile.value = null;
});

function expectGuideLink(link: HTMLElement) {
  expect(link).toHaveAttribute('href', FAQ_EVENT_GUIDE_PATH);
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  expect(link).toHaveTextContent(FAQ_EVENT_GUIDE_QUESTION);
}

describe('EventFormWizard FAQ guide link', () => {
  it('anchor constant matches the faqSlug of the question', () => {
    expect(FAQ_EVENT_GUIDE_PATH).toBe(`/faq#frage-${faqSlug(FAQ_EVENT_GUIDE_QUESTION)}`);
    expect(FAQ_EVENT_GUIDE_PATH).toBe('/faq#frage-welche-events-passen-in-unseren-kalender');
  });

  it('step 1 shows the link below the Weiter button', () => {
    renderWizard();
    const link = screen.getByTestId('faq-guide-link-step');
    expectGuideLink(link);
    const next = screen.getByTestId('continue-button');
    expect(next.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId('faq-guide-link-category')).not.toBeInTheDocument();
  });

  it('step 3 shows the link next to the Kategorie label', () => {
    seedDraft(3);
    renderWizard();
    const link = screen.getByTestId('faq-guide-link-category');
    expectGuideLink(link);
    expect(link.closest('.input-label-row')).toHaveTextContent('Kategorie');
    expect(screen.queryByTestId('faq-guide-link-step')).not.toBeInTheDocument();
  });

  it('step 4 shows the link below the submit button', () => {
    seedDraft(4);
    renderWizard();
    const link = screen.getByTestId('faq-guide-link-step');
    expectGuideLink(link);
    const submit = screen.getByTestId('submit-event-button');
    expect(submit.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('step 2 shows no link', () => {
    seedDraft(2);
    renderWizard();
    expect(screen.queryByTestId('faq-guide-link-step')).not.toBeInTheDocument();
    expect(screen.queryByTestId('faq-guide-link-category')).not.toBeInTheDocument();
  });
});
