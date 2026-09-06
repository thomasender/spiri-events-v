import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import EventFormPage from '../../src/pages/EventFormPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'admin-uid' }, role: 'Admin' }),
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEventById: vi.fn(),
  useEvents: () => ({
    events: [],
    loading: false,
    addEvent: vi.fn(),
    updateEvent: vi.fn(),
  }),
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

import { useEventById } from '../../src/hooks/useEvents';

describe('EventFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  it('shows loading spinner while checking auth and loading event', () => {
    useEventById.mockReturnValue({
      event: null,
      loading: true,
      error: null,
    });

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/admin/edit/test-id']}>
          <Routes>
            <Route path="/admin/edit/:id" element={<EventFormPage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(document.querySelector('.loading-spinner')).toBeTruthy();
  });

  it('redirects to /admin when event is not found', () => {
    useEventById.mockReturnValue({
      event: null,
      loading: false,
      error: 'Event not found',
    });

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/admin/edit/non-existent-id']}>
          <Routes>
            <Route path="/admin/edit/:id" element={<EventFormPage />} />
            <Route path="/admin" element={<div>Admin Page</div>} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/admin');
  });

  it('renders EventForm when event is found', () => {
    const mockEvent = {
      id: 'test-id',
      title: 'Test Event',
      date: '2026-07-24',
      place: 'Test Place',
      bezirk: 'Bregenz',
      category: 'Yoga',
      status: 'pending',
    };

    useEventById.mockReturnValue({
      event: mockEvent,
      loading: false,
      error: null,
    });

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/admin/edit/test-id']}>
          <Routes>
            <Route path="/admin/edit/:id" element={<EventFormPage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByText('Event bearbeiten')).toBeTruthy();
  });

  it('shows loading spinner when event is still loading', () => {
    useEventById.mockReturnValue({
      event: null,
      loading: true,
      error: null,
    });

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/admin/edit/test-id']}>
          <Routes>
            <Route path="/admin/edit/:id" element={<EventFormPage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.queryByText('Event bearbeiten')).not.toBeInTheDocument();
  });
});
