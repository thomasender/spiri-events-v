import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventListRow from '../../src/components/EventListRow';

const renderRow = (event) =>
  render(
    <MemoryRouter>
      <EventListRow event={event} categoryColor="#abc" onClick={() => {}} />
    </MemoryRouter>
  );

const baseEvent = {
  id: 'evt-1',
  slug: 'sample-event',
  title: 'Sample Event',
  date: '2026-09-15',
  time: '18:00',
  bezirk: 'Bregenz',
  category: 'Yoga',
  organizer: { name: 'Anna Schmidt' },
};

describe('EventListRow', () => {
  it('shows the initial-letter avatar when organizer has no photoURL', () => {
    renderRow({ ...baseEvent, organizer: { name: 'Anna Schmidt' } });
    expect(screen.queryByTestId('event-row-organizer-photo')).toBeNull();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('Anna Schmidt')).toBeInTheDocument();
  });

  it('renders the organizer profile photo when organizer has photoURL', () => {
    renderRow({
      ...baseEvent,
      organizer: {
        name: 'Anna Schmidt',
        photoURL: 'https://example.com/anna.png',
      },
    });
    const photo = screen.getByTestId('event-row-organizer-photo');
    expect(photo).toBeInTheDocument();
    expect(photo.tagName).toBe('IMG');
    expect(photo).toHaveAttribute('src', 'https://example.com/anna.png');
    expect(screen.queryByText('A')).toBeNull();
  });

  it('does not wrap the organizer photo in its own profile link', () => {
    renderRow({
      ...baseEvent,
      organizer: {
        name: 'Anna Schmidt',
        photoURL: 'https://example.com/anna.png',
      },
    });
    const photo = screen.getByTestId('event-row-organizer-photo');
    expect(photo.parentElement?.tagName).not.toBe('A');
  });
});
