import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockAuth = vi.hoisted(() => ({
  user: null as { uid: string } | null,
  role: null as string | null,
}));

const mockProfile = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
}));

const mockEvents = vi.hoisted(() => ({
  addEvent: vi.fn(async () => ({})),
  updateEvent: vi.fn(async () => ({})),
  deleteEvent: vi.fn(async () => {}),
  submitForReview: vi.fn(async () => {}),
  revertToDraft: vi.fn(async () => {}),
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockAuth.user,
    role: mockAuth.role,
  }),
}));

vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: mockProfile.profile }),
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockEvents,
  KATEGORIEN: ['Yoga', 'Breathwork', 'Meditation', 'Tanz', 'Singen', 'Soundhealing', 'Sonstiges'],
  BEZIRKE: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'],
}));

vi.mock('../../src/lib/imageUpload', () => ({
  uploadImage: vi.fn(async () => 'https://example.com/test.jpg'),
  deleteImageByUrl: vi.fn(async () => {}),
  getImageDimensions: vi.fn(async () => ({ width: 1200, height: 800 })),
  getAspectRatioRecommendation: vi.fn(() => ({ isRecommended: true })),
  MAX_INPUT_SIZE_BYTES: 5 * 1024 * 1024,
}));

import EventForm from '../../src/components/EventForm';

const baseEvent = {
  id: 'event-x',
  title: 'Test Event',
  date: '2026-08-10',
  endDate: null,
  time: '10:00',
  endTime: '11:00',
  place: 'Test Place',
  contribution: 'free',
  fee: null,
  description: 'desc',
  link: '',
  recurrence: 'none',
  recurrenceEndDate: '',
  category: 'Yoga',
  bezirk: 'Bregenz',
  organizer: { firstName: 'A', lastName: 'B', email: 'a@b.c' },
  kontakt: '0676 1234567',
  status: 'pending',
  imageUrl: null,
  createdBy: 'owner-uid',
};

beforeEach(() => {
  mockAuth.user = { uid: 'owner-uid' };
  mockAuth.role = null;
  mockProfile.profile = null;
});

function findSaveIconInButton(button: HTMLElement): SVGSVGElement {
  const svg = button.querySelector('svg');
  if (!svg) throw new Error('Expected the save button to contain an SVG icon');
  return svg as SVGSVGElement;
}

describe('EventForm — save button icon size (4wypZR9P)', () => {
  it('renders the primary save button with a Save icon larger than the standard 18px', () => {
    render(
      <MemoryRouter>
        <EventForm event={baseEvent} />
      </MemoryRouter>
    );

    const submitButton = screen.getByRole('button', {
      name: /änderungen speichern/i,
    }) as HTMLButtonElement;

    const icon = findSaveIconInButton(submitButton);
    const widthAttr = icon.getAttribute('width');
    const heightAttr = icon.getAttribute('height');

    expect(widthAttr).not.toBe('18');
    expect(heightAttr).not.toBe('18');
    expect(Number(widthAttr)).toBeGreaterThan(18);
    expect(Number(heightAttr)).toBeGreaterThan(18);
  });

  it('still shows the visible text label alongside the icon', () => {
    render(
      <MemoryRouter>
        <EventForm event={baseEvent} />
      </MemoryRouter>
    );

    const submitButton = screen.getByRole('button', {
      name: /änderungen speichern/i,
    }) as HTMLButtonElement;

    expect(submitButton).toHaveTextContent(/änderungen speichern/i);
    expect(submitButton.querySelector('svg')).not.toBeNull();
  });
});
