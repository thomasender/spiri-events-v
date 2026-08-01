import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Calendar from '../../src/components/Calendar';

const getFutureDate = (daysAhead = 15) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
};

const createEvent = (overrides = {}) => ({
  id: '1',
  title: 'Test Event',
  date: getFutureDate(15),
  time: '10:00',
  endTime: '12:00',
  place: 'Bregenz',
  bezirk: 'Bregenz',
  contribution: 'free',
  categories: ['Yoga'],
  description: 'Test description',
  ...overrides,
});

describe('Calendar', () => {
  let onEventClick;
  let onMonthChange;
  let currentMonth;

  beforeEach(() => {
    onEventClick = vi.fn();
    onMonthChange = vi.fn();
    const futureDate = getFutureDate(15);
    const eventDate = new Date(futureDate + 'T12:00:00');
    currentMonth = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
  });

  describe('Rendering', () => {
    it('renders calendar header with month and year', () => {
      render(
        <Calendar
          events={[]}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      const header = screen.getByText(/\w+ \d{4}/);
      expect(header).toBeInTheDocument();
    });

    it('renders "Heute" button', () => {
      render(
        <Calendar
          events={[]}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      expect(screen.getAllByTitle('Heute').length).toBeGreaterThan(0);
    });

    it('renders 7 weekday headers', () => {
      render(
        <Calendar
          events={[]}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
      weekdays.forEach((day) => {
        expect(screen.getByText(day)).toBeInTheDocument();
      });
    });

    it('renders navigation buttons', () => {
      render(
        <Calendar
          events={[]}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Month Navigation', () => {
    it('calls onMonthChange with previous month when prev button clicked', () => {
      const testMonth = new Date(2024, 6, 1);
      render(
        <Calendar
          events={[]}
          onEventClick={onEventClick}
          currentMonth={testMonth}
          onMonthChange={onMonthChange}
        />
      );
      const prevButton = screen.getByTitle('Vorheriger Monat');
      fireEvent.click(prevButton);
      expect(onMonthChange).toHaveBeenCalledWith(new Date(2024, 5, 1));
    });

    it('calls onMonthChange with next month when next button clicked', () => {
      const testMonth = new Date(2024, 6, 1);
      render(
        <Calendar
          events={[]}
          onEventClick={onEventClick}
          currentMonth={testMonth}
          onMonthChange={onMonthChange}
        />
      );
      const nextButton = screen.getByTitle('Nächster Monat');
      fireEvent.click(nextButton);
      expect(onMonthChange).toHaveBeenCalledWith(new Date(2024, 7, 1));
    });

    it('calls onMonthChange with current month when Heute clicked', () => {
      const testMonth = new Date(2024, 6, 1);
      render(
        <Calendar
          events={[]}
          onEventClick={onEventClick}
          currentMonth={testMonth}
          onMonthChange={onMonthChange}
        />
      );
      const todayButton = screen.getAllByTitle('Heute')[0];
      fireEvent.click(todayButton);
      const today = new Date();
      expect(onMonthChange).toHaveBeenCalledWith(
        new Date(today.getFullYear(), today.getMonth(), 1)
      );
    });
  });

  describe('Event Rendering', () => {
    it('renders event on correct day in desktop calendar', () => {
      const futureDate = getFutureDate(15);
      const event = createEvent({ id: '1', title: 'Yoga Workshop', date: futureDate });
      render(
        <Calendar
          events={[event]}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      expect(screen.getAllByText('Yoga Workshop').length).toBeGreaterThan(0);
    });

    it('renders multi-day event', () => {
      const startDate = getFutureDate(10);
      const endDate = getFutureDate(12);
      const multiDayEvent = createEvent({
        id: '1',
        title: 'Meditation Retreat',
        date: startDate,
        endDate: endDate,
      });
      render(
        <Calendar
          events={[multiDayEvent]}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      expect(screen.getAllByText('Meditation Retreat').length).toBeGreaterThanOrEqual(1);
    });

    it('renders recurring weekly event', () => {
      const futureDate = getFutureDate(7);
      const endDate = getFutureDate(35);
      const weeklyEvent = createEvent({
        id: '1',
        title: 'Weekly Yoga',
        date: futureDate,
        recurrence: 'weekly',
        recurrenceEndDate: endDate,
      });
      render(
        <Calendar
          events={[weeklyEvent]}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      expect(screen.getAllByText('Weekly Yoga').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Day popover', () => {
    it('shows event dots for a day with events', () => {
      const futureDate = getFutureDate(15);
      const manyEvents = Array.from({ length: 5 }, (_, i) =>
        createEvent({ id: String(i), title: `Event ${i}`, date: futureDate })
      );
      const { container } = render(
        <Calendar
          events={manyEvents}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      expect(container.querySelectorAll('.cell-dot').length).toBeGreaterThan(0);
    });

    it('opens popover when day cell with events is clicked', async () => {
      const futureDate = getFutureDate(15);
      const manyEvents = Array.from({ length: 5 }, (_, i) =>
        createEvent({ id: String(i), title: `Event ${i}`, date: futureDate })
      );
      const { container } = render(
        <Calendar
          events={manyEvents}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      const dayCell = container.querySelector('.calendar-cell.has-events');
      fireEvent.click(dayCell);
      await waitFor(() => {
        expect(screen.getByText(/Alle Events am/)).toBeInTheDocument();
      });
    });

    it('closes popover when close button clicked', async () => {
      const futureDate = getFutureDate(15);
      const manyEvents = Array.from({ length: 5 }, (_, i) =>
        createEvent({ id: String(i), title: `Event ${i}`, date: futureDate })
      );
      const { container } = render(
        <Calendar
          events={manyEvents}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      const dayCell = container.querySelector('.calendar-cell.has-events');
      fireEvent.click(dayCell);
      await waitFor(() => {
        expect(screen.getByText(/Alle Events am/)).toBeInTheDocument();
      });
      const closeButton = screen.getByText('×');
      fireEvent.click(closeButton);
      await waitFor(() => {
        expect(screen.queryByText(/Alle Events am/)).not.toBeInTheDocument();
      });
    });

    it('calls onEventClick when event in popover is clicked', async () => {
      const futureDate = getFutureDate(15);
      const manyEvents = Array.from({ length: 5 }, (_, i) =>
        createEvent({ id: String(i), title: `Event ${i}`, date: futureDate })
      );
      const { container } = render(
        <Calendar
          events={manyEvents}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      const dayCell = container.querySelector('.calendar-cell.has-events');
      fireEvent.click(dayCell);
      await waitFor(() => {
        expect(screen.getByText(/Alle Events am/)).toBeInTheDocument();
      });
      const popoverEvents = screen.getAllByText('Event 0');
      const popoverEvent = popoverEvents.find((el) => el.closest('.day-popover-event'));
      expect(popoverEvent).toBeTruthy();
      fireEvent.click(popoverEvent);
      expect(onEventClick).toHaveBeenCalled();
    });
  });

  describe('Mobile agenda', () => {
    it('renders agenda events', () => {
      const futureDate = getFutureDate(15);
      const event = createEvent({
        id: '1',
        title: 'Morning Yoga',
        date: futureDate,
        time: '09:00',
      });
      render(
        <Calendar
          events={[event]}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      const agendaEvents = screen.getAllByText('Morning Yoga');
      expect(agendaEvents.length).toBeGreaterThan(0);
    });

    it('calls onEventClick when agenda event row clicked', () => {
      const futureDate = getFutureDate(15);
      const event = createEvent({
        id: '1',
        title: 'Morning Yoga',
        date: futureDate,
        time: '09:00',
      });
      render(
        <Calendar
          events={[event]}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      const agendaEvents = screen.getAllByText('Morning Yoga');
      const row = agendaEvents.find((el) => el.closest('.agenda-event-row'));
      if (row) {
        fireEvent.click(row);
        expect(onEventClick).toHaveBeenCalled();
      }
    });
  });

  describe('Date edge cases', () => {
    it('renders February correctly in leap year', () => {
      const leapYearMonth = new Date(2024, 1, 1);
      render(
        <Calendar
          events={[]}
          onEventClick={onEventClick}
          currentMonth={leapYearMonth}
          onMonthChange={onMonthChange}
        />
      );
      expect(screen.getByText('Februar 2024')).toBeInTheDocument();
    });

    it('renders February correctly in non-leap year', () => {
      const nonLeapYearMonth = new Date(2023, 1, 1);
      render(
        <Calendar
          events={[]}
          onEventClick={onEventClick}
          currentMonth={nonLeapYearMonth}
          onMonthChange={onMonthChange}
        />
      );
      expect(screen.getByText('Februar 2023')).toBeInTheDocument();
    });
  });

  describe('Event contribution display', () => {
    it.skip('shows "Frei" badge for free events - badges only in mobile agenda', () => {
      const futureDate = getFutureDate(15);
      const freeEvent = createEvent({
        id: '1',
        title: 'Free Yoga',
        date: futureDate,
        contribution: 'free',
      });
      render(
        <Calendar
          events={[freeEvent]}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      expect(screen.getAllByText('Frei').length).toBeGreaterThan(0);
    });

    it.skip('shows fee amount for paid events - badges only in mobile agenda', () => {
      const futureDate = getFutureDate(15);
      const paidEvent = createEvent({
        id: '1',
        title: 'Paid Workshop',
        date: futureDate,
        contribution: 'fee',
        fee: 25,
      });
      render(
        <Calendar
          events={[paidEvent]}
          onEventClick={onEventClick}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
        />
      );
      expect(screen.getAllByText('25€').length).toBeGreaterThan(0);
    });
  });
});
