import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EventModal from '../../src/components/EventModal';

const mockEvent = {
  id: '1',
  title: 'Test Event',
  date: '2026-07-15',
  time: '10:00',
  place: 'Test Place',
  bezirk: 'Bregenz',
  contribution: 'free',
  description: 'Test description',
  category: 'Yoga',
  recurrence: 'none',
};

describe('EventModal', () => {
  it('renders event title', () => {
    render(<EventModal event={mockEvent} onClose={() => {}} />);
    expect(screen.getByText('Test Event')).toBeInTheDocument();
  });

  it('renders close button', () => {
    render(<EventModal event={mockEvent} onClose={() => {}} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  describe('formatRecurrence', () => {
    it('shows weekday for weekly recurrence', () => {
      const event = { ...mockEvent, recurrence: 'weekly', date: '2026-07-15' };
      render(<EventModal event={event} onClose={() => {}} />);
      expect(screen.getByText(/Jeden Mittwoch/)).toBeInTheDocument();
    });

    it('shows weekday and end date for weekly recurrence with end date', () => {
      const event = {
        ...mockEvent,
        recurrence: 'weekly',
        date: '2026-07-15',
        recurrenceEndDate: '2026-08-30',
      };
      render(<EventModal event={event} onClose={() => {}} />);
      expect(screen.getByText(/Jeden Mittwoch bis 30. August 2026/)).toBeInTheDocument();
    });

    it('shows weekday for biweekly recurrence', () => {
      const event = { ...mockEvent, recurrence: 'biweekly', date: '2026-07-15' };
      render(<EventModal event={event} onClose={() => {}} />);
      expect(screen.getByText(/Jeden zweiten Mittwoch/)).toBeInTheDocument();
    });

    it('shows "Jeden Monat" for monthly recurrence without date suffix', () => {
      const event = { ...mockEvent, recurrence: 'monthly' };
      render(<EventModal event={event} onClose={() => {}} />);
      expect(screen.getByText('Jeden Monat')).toBeInTheDocument();
    });

    it('does not show recurrence section when recurrence is none', () => {
      const event = { ...mockEvent, recurrence: 'none' };
      render(<EventModal event={event} onClose={() => {}} />);
      expect(screen.queryByText('Wiederholung')).not.toBeInTheDocument();
    });
  });
});
