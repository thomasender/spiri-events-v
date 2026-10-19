import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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
  default: () => <div data-testid="event-card-mock" />,
}));

describe('OrganizerEvents', () => {
  it('shows the heading and events but no category badge', async () => {
    render(<OrganizerEvents organizerUid="u1" organizerName="Max" />);
    expect(await screen.findByText('Weitere Events dieses Veranstalters')).toBeTruthy();
    expect(screen.getByTestId('event-card-mock')).toBeTruthy();
    expect(screen.queryByTestId('organizer-events-category-badge')).toBeNull();
    expect(screen.queryByText('Yoga')).toBeNull();
  });
});
