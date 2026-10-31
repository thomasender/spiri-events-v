import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { getDocs } from 'firebase/firestore';
import OrganizerEvents from '../../src/components/OrganizerEvents';

vi.mock('../../src/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({
    docs: [
      {
        id: 'e1',
        data: () => ({ title: 'Kakao', date: '2999-01-01', category: 'Yoga', status: 'approved' }),
      },
    ],
  }),
}));
vi.mock('../../src/hooks/useCategoryRegistry', () => ({
  useCategoryRegistry: () => ({ colorByName: new Map() }),
}));
vi.mock('../../src/components/EventCard', () => ({
  default: ({ event }: { event: { title: string; date: string } }) => (
    <div data-testid="event-card-mock">
      {event.title} {event.date}
    </div>
  ),
}));

const isoInDays = (days: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('OrganizerEvents', () => {
  it('shows the heading and events but no category badge', async () => {
    render(<OrganizerEvents organizerUid="u1" organizerName="Max" />);
    expect(await screen.findByText('Weitere Events dieses Veranstalters')).toBeTruthy();
    expect(screen.getByTestId('event-card-mock')).toBeTruthy();
    expect(screen.queryByTestId('organizer-events-category-badge')).toBeNull();
    expect(screen.queryByText('Yoga')).toBeNull();
  });

  it('shows a running series whose first date is already past, at its next date', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        {
          id: 'yoga',
          data: () => ({ title: 'Yoga', date: '2999-01-01', category: 'Yoga', status: 'approved' }),
        },
        {
          id: 'kreis',
          data: () => ({
            title: 'Männerkreis',
            date: isoInDays(-14),
            recurrence: 'weekly',
            recurrenceEndDate: isoInDays(60),
            category: 'Kreis',
            status: 'approved',
          }),
        },
      ],
    } as never);
    render(<OrganizerEvents organizerUid="u1" organizerName="Peter" />);
    const cards = await screen.findAllByTestId('event-card-mock');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toBe(`Männerkreis ${isoInDays(0)}`);
    expect(cards[1].textContent).toContain('Yoga');
  });
});
