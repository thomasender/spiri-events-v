import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OccurrencePickerDialog from '../../src/components/OccurrencePickerDialog';

const mockGetEventOccurrences = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/eventOccurrences', () => ({
  getEventOccurrences: (...args) => mockGetEventOccurrences(...args),
}));

const today = new Date();
today.setHours(12, 0, 0, 0);
const todayStr = today.toISOString().split('T')[0];

const makeOccurrence = (daysFromNow) => {
  const d = new Date(today);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
};

const mockEvent = {
  id: 'recurring-1',
  title: 'Weekly Yoga Series',
  date: todayStr,
  time: '10:00',
  place: 'Studio A',
  recurrence: 'weekly',
  recurrenceEndDate: '2027-12-31',
};

describe('OccurrencePickerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when not open', () => {
    render(
      <OccurrencePickerDialog
        isOpen={false}
        event={mockEvent}
        initialOccurrenceDate={todayStr}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByText('Termin auswählen')).not.toBeInTheDocument();
  });

  it('renders dialog title and event name when open', () => {
    mockGetEventOccurrences.mockReturnValue([]);

    render(
      <MemoryRouter>
        <OccurrencePickerDialog
          isOpen={true}
          event={mockEvent}
          initialOccurrenceDate={todayStr}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Termin auswählen')).toBeInTheDocument();
    expect(screen.getByText(/Weekly Yoga Series/i)).toBeInTheDocument();
  });

  it('shows Weiter button disabled when no occurrence selected', () => {
    mockGetEventOccurrences.mockReturnValue([]);

    render(
      <MemoryRouter>
        <OccurrencePickerDialog
          isOpen={true}
          event={mockEvent}
          initialOccurrenceDate={null}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>
    );

    const weiterBtn = screen.getByRole('button', { name: 'Weiter' });
    expect(weiterBtn).toBeDisabled();
  });

  it('shows occurrences list from getEventOccurrences', () => {
    const d1 = makeOccurrence(1);
    const d2 = makeOccurrence(8);
    mockGetEventOccurrences.mockReturnValue([
      { ...mockEvent, date: d1 },
      { ...mockEvent, date: d2 },
    ]);

    render(
      <MemoryRouter>
        <OccurrencePickerDialog
          isOpen={true}
          event={mockEvent}
          initialOccurrenceDate={d1}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>
    );

    const buttons = screen.getAllByRole('button');
    const occurrenceButtons = buttons.filter((b) => b.classList.contains('occurrence-option'));
    expect(occurrenceButtons).toHaveLength(2);
  });

  it('calls onConfirm with selected date when Weiter is clicked', () => {
    const d1 = makeOccurrence(1);
    mockGetEventOccurrences.mockReturnValue([{ ...mockEvent, date: d1 }]);

    const onConfirm = vi.fn();

    render(
      <MemoryRouter>
        <OccurrencePickerDialog
          isOpen={true}
          event={mockEvent}
          initialOccurrenceDate={d1}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      </MemoryRouter>
    );

    const weiterBtn = screen.getByRole('button', { name: 'Weiter' });
    fireEvent.click(weiterBtn);

    expect(onConfirm).toHaveBeenCalledWith(d1);
  });

  it('calls onCancel when Abbrechen is clicked', () => {
    const onCancel = vi.fn();
    mockGetEventOccurrences.mockReturnValue([]);

    render(
      <MemoryRouter>
        <OccurrencePickerDialog
          isOpen={true}
          event={mockEvent}
          initialOccurrenceDate={todayStr}
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />
      </MemoryRouter>
    );

    const abbrechenBtn = screen.getByRole('button', { name: 'Abbrechen' });
    fireEvent.click(abbrechenBtn);

    expect(onCancel).toHaveBeenCalled();
  });

  it('pre-selects initialOccurrenceDate', () => {
    const d1 = makeOccurrence(1);
    mockGetEventOccurrences.mockReturnValue([{ ...mockEvent, date: d1 }]);

    render(
      <MemoryRouter>
        <OccurrencePickerDialog
          isOpen={true}
          event={mockEvent}
          initialOccurrenceDate={d1}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>
    );

    const selectedBtn = screen.getByText('✓');
    expect(selectedBtn).toBeInTheDocument();
  });
});
