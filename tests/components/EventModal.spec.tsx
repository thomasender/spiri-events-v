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

    it('shows "An einzelnen Terminen" for custom recurrence', () => {
      const event = {
        ...mockEvent,
        recurrence: 'custom',
        customDates: ['2026-09-10', '2026-09-24'],
      };
      render(<EventModal event={event} onClose={() => {}} />);
      expect(screen.getByText('An einzelnen Terminen')).toBeInTheDocument();
    });

    it('does not show recurrence section when recurrence is none', () => {
      const event = { ...mockEvent, recurrence: 'none' };
      render(<EventModal event={event} onClose={() => {}} />);
      expect(screen.queryByText('Wiederholung')).not.toBeInTheDocument();
    });
  });

  describe('organizer profile photo', () => {
    it('renders organizer profile photo when organizer has photoURL', () => {
      const event = {
        ...mockEvent,
        organizer: {
          firstName: 'Anna',
          lastName: 'Schmidt',
          email: 'anna@example.com',
          photoURL: 'https://example.com/anna.png',
        },
      };
      render(<EventModal event={event} onClose={() => {}} />);
      const photo = screen.getByTestId('organizer-photo');
      expect(photo).toBeInTheDocument();
      expect(photo.tagName).toBe('IMG');
      expect(photo).toHaveAttribute('src', 'https://example.com/anna.png');
    });

    it('does not render organizer photo when organizer has no photoURL', () => {
      const event = {
        ...mockEvent,
        organizer: { firstName: 'Anna', lastName: 'Schmidt', email: 'anna@example.com' },
      };
      render(<EventModal event={event} onClose={() => {}} />);
      expect(screen.queryByTestId('organizer-photo')).toBeNull();
    });
  });

  describe('contribution badge (VtFz800s)', () => {
    it('shows "Kostenlos" for free events', () => {
      render(<EventModal event={{ ...mockEvent, contribution: 'free' }} onClose={() => {}} />);
      expect(screen.getByText('Kostenlos')).toBeInTheDocument();
    });

    it('shows "Freie Spende" for donation events', () => {
      render(<EventModal event={{ ...mockEvent, contribution: 'donation' }} onClose={() => {}} />);
      expect(screen.getByText('Freie Spende')).toBeInTheDocument();
    });

    it('shows formatted price for paid events without a note', () => {
      render(
        <EventModal
          event={{ ...mockEvent, contribution: 'fee', fee: 25, priceCurrency: 'EUR' }}
          onClose={() => {}}
        />
      );
      expect(screen.getByText('25 €')).toBeInTheDocument();
    });

    it('shows price with feeNote separator when both are present', () => {
      render(
        <EventModal
          event={{
            ...mockEvent,
            contribution: 'fee',
            fee: 120,
            priceCurrency: 'EUR',
            feeNote: '10er-Block',
          }}
          onClose={() => {}}
        />
      );
      expect(screen.getByText('120 € / 10er-Block')).toBeInTheDocument();
    });

    it('shows "Kostenpflichtig" when contribution is fee but fee and feeNote are missing', () => {
      render(
        <EventModal event={{ ...mockEvent, contribution: 'fee', fee: null }} onClose={() => {}} />
      );
      expect(screen.getByText('Kostenpflichtig')).toBeInTheDocument();
    });

    it('shows feeNote alone when contribution is fee but no fee is set', () => {
      render(
        <EventModal
          event={{ ...mockEvent, contribution: 'fee', fee: null, feeNote: 'Einzelstunde' }}
          onClose={() => {}}
        />
      );
      expect(screen.getByText('Einzelstunde')).toBeInTheDocument();
    });
  });

  describe('registration', () => {
    it('shows the Anmeldung with a clickable link', () => {
      render(
        <EventModal
          event={{ ...mockEvent, registration: 'Buchen: https://example.com/buchen' }}
          onClose={() => {}}
        />
      );
      expect(screen.getByTestId('event-modal-registration')).toHaveTextContent('Anmeldung');
      expect(screen.getByRole('link', { name: 'https://example.com/buchen' })).toHaveAttribute(
        'href',
        'https://example.com/buchen'
      );
    });

    it('omits the Anmeldung when empty or blank', () => {
      render(<EventModal event={{ ...mockEvent, registration: '  ' }} onClose={() => {}} />);
      expect(screen.queryByTestId('event-modal-registration')).toBeNull();
    });
  });
});

describe('EventModal location', () => {
  it('shows the district badge and the Ort (Bezirk for Vorarlberg, Landkreis for Germany)', () => {
    const { unmount } = render(
      <EventModal
        event={{ ...mockEvent, city: 'Altach', bezirk: 'Feldkirch' }}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('Ort')).toBeInTheDocument();
    expect(screen.getByTestId('district-badge')).toHaveTextContent('Feldkirch');
    expect(screen.getByText('Ort').parentElement).toHaveTextContent('Feldkirch Altach');
    unmount();
    render(
      <EventModal
        event={{ ...mockEvent, regionId: 'bayern', city: 'Garching', bezirk: 'München' }}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('district-badge')).toHaveTextContent('München');
    expect(screen.getByText('Ort').parentElement).toHaveTextContent('München Garching');
  });

  it('falls back to the district for events without a city', () => {
    render(<EventModal event={{ ...mockEvent, bezirk: 'Dornbirn' }} onClose={() => {}} />);
    expect(screen.getByText('Dornbirn')).toBeInTheDocument();
  });
});
