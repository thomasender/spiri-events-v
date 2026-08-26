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
  KATEGORIEN: ['Yoga', 'Breathwork', 'Meditation', 'Tanz', 'Singen', 'Soundhealing', 'Sonstiges'],
  BEZIRKE: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'],
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

  it('includes Grenznahe as a selectable district for events in the Allgäu/Lindau/St. Gallen area', () => {
    render(
      <MemoryRouter>
        <EventForm />
      </MemoryRouter>
    );
    expect(screen.getByRole('option', { name: 'Grenznahe' })).toBeInTheDocument();
  });
});
