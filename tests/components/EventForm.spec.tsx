import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventForm from '../../src/components/EventForm';

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'test' }, role: null }),
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => ({
    addEvent: vi.fn(),
    updateEvent: vi.fn(),
  }),
  KATEGORIEN: ['Yoga', 'Meditation', 'Tanz', 'Singen', 'Atemarbeit', 'Sonstiges'],
  BEZIRKE: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz'],
}));

describe('EventForm', () => {
  it('renders form title for non-admin', () => {
    render(
      <MemoryRouter>
        <EventForm />
      </MemoryRouter>
    );
    expect(screen.getByText('Event zur Genehmigung einreichen')).toBeInTheDocument();
  });

  it('renders submit button', () => {
    render(
      <MemoryRouter>
        <EventForm />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /einreichen/i })).toBeInTheDocument();
  });
});
