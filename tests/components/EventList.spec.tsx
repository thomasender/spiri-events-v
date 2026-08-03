import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventList from '../../src/components/EventList';

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'test' }, role: null }),
}));

const mockEvents = vi.fn(() => ({
  events: [],
  loading: false,
  deleteEvent: vi.fn(),
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockEvents(),
  usePendingEvents: () => ({
    pendingEvents: [],
    loading: false,
    approveEvent: vi.fn(),
  }),
  useEventById: () => ({
    event: null,
    loading: false,
    error: null,
  }),
}));

describe('EventList', () => {
  it('renders empty state when no events', () => {
    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );
    expect(screen.getByText(/noch keine events/i)).toBeInTheDocument();
  });

  it('sorts pending events before approved ones', () => {
    mockEvents.mockReturnValueOnce({
      events: [
        { id: '1', title: 'Approved Event', status: 'approved', date: '2026-08-01', place: 'A' },
        { id: '2', title: 'Pending Event', status: 'pending', date: '2026-08-02', place: 'B' },
      ],
      loading: false,
      deleteEvent: vi.fn(),
    });

    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    );

    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['Pending Event', 'Approved Event']);
  });
});
