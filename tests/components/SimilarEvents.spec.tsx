import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGetDocs = vi.hoisted(() => vi.fn());
const mockDocs = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; data: Record<string, unknown> }>,
}));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    getDocs: (...args) => mockGetDocs(...args),
    collection: () => ({ type: 'collection' }),
    query: () => ({ type: 'query' }),
    where: () => ({ type: 'where' }),
  };
});

vi.mock('../../src/lib/firebase', () => ({
  db: {},
}));

vi.mock('../../src/hooks/useCategoryRegistry', () => ({
  useCategoryRegistry: () => ({
    categories: [],
    colorByName: new Map(),
    nameExists: () => false,
    loading: false,
    error: null,
    isAdmin: false,
    addCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  }),
}));

vi.mock('../../src/utils/eventFallbacks', () => ({
  getEventFallbackImage: () => '/event-fallbacks/yoga.jpg',
}));

import SimilarEvents from '../../src/components/SimilarEvents';

function makeDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

beforeEach(() => {
  mockDocs.docs = [];
  mockGetDocs.mockReset();
  mockGetDocs.mockImplementation(async () => mockDocs);
});

describe('SimilarEvents — same-district prioritization (P4ujxIxF)', () => {
  it('renders events from the same district before events from other districts', async () => {
    mockDocs.docs = [
      makeDoc('bregenz-yoga-1', {
        title: 'Bregenz Yoga früh',
        date: todayPlus(2),
        category: 'Yoga',
        bezirk: 'Bregenz',
        status: 'approved',
      }),
      makeDoc('dornbirn-yoga-1', {
        title: 'Dornbirn Yoga früh',
        date: todayPlus(3),
        category: 'Yoga',
        bezirk: 'Dornbirn',
        status: 'approved',
      }),
      makeDoc('dornbirn-yoga-2', {
        title: 'Dornbirn Yoga spät',
        date: todayPlus(8),
        category: 'Yoga',
        bezirk: 'Dornbirn',
        status: 'approved',
      }),
      makeDoc('feldkirch-yoga-1', {
        title: 'Feldkirch Yoga mittel',
        date: todayPlus(5),
        category: 'Yoga',
        bezirk: 'Feldkirch',
        status: 'approved',
      }),
    ];

    render(
      <MemoryRouter>
        <SimilarEvents
          currentEvent={{
            id: 'current-dornbirn',
            title: 'Aktuelles Yoga',
            category: 'Yoga',
            bezirk: 'Dornbirn',
            date: todayPlus(0),
            status: 'approved',
          }}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('similar-event-card')).toHaveLength(4);
    });

    const titles = within(screen.getByTestId('similar-events-slider'))
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);

    expect(titles).toEqual([
      'Dornbirn Yoga früh',
      'Dornbirn Yoga spät',
      'Bregenz Yoga früh',
      'Feldkirch Yoga mittel',
    ]);
  });

  it('keeps the 5-card cap while still prioritizing same-district events', async () => {
    mockDocs.docs = [
      makeDoc('a', {
        title: 'A Bregenz',
        date: todayPlus(1),
        category: 'Yoga',
        bezirk: 'Bregenz',
        status: 'approved',
      }),
      makeDoc('b', {
        title: 'B Dornbirn',
        date: todayPlus(2),
        category: 'Yoga',
        bezirk: 'Dornbirn',
        status: 'approved',
      }),
      makeDoc('c', {
        title: 'C Dornbirn',
        date: todayPlus(3),
        category: 'Yoga',
        bezirk: 'Dornbirn',
        status: 'approved',
      }),
      makeDoc('d', {
        title: 'D Dornbirn',
        date: todayPlus(4),
        category: 'Yoga',
        bezirk: 'Dornbirn',
        status: 'approved',
      }),
      makeDoc('e', {
        title: 'E Bregenz',
        date: todayPlus(5),
        category: 'Yoga',
        bezirk: 'Bregenz',
        status: 'approved',
      }),
      makeDoc('f', {
        title: 'F Feldkirch',
        date: todayPlus(6),
        category: 'Yoga',
        bezirk: 'Feldkirch',
        status: 'approved',
      }),
      makeDoc('g', {
        title: 'G Bregenz',
        date: todayPlus(7),
        category: 'Yoga',
        bezirk: 'Bregenz',
        status: 'approved',
      }),
    ];

    render(
      <MemoryRouter>
        <SimilarEvents
          currentEvent={{
            id: 'current',
            title: 'Yoga aktuell',
            category: 'Yoga',
            bezirk: 'Dornbirn',
            date: todayPlus(0),
            status: 'approved',
          }}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('similar-event-card')).toHaveLength(5);
    });

    const titles = within(screen.getByTestId('similar-events-slider'))
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);

    expect(titles).toEqual(['B Dornbirn', 'C Dornbirn', 'D Dornbirn', 'A Bregenz', 'E Bregenz']);
  });

  it('sorts by date ascending when the current event has no district (online)', async () => {
    mockDocs.docs = [
      makeDoc('bregenz', {
        title: 'Bregenz Yoga',
        date: todayPlus(5),
        category: 'Yoga',
        bezirk: 'Bregenz',
        isOnline: false,
        status: 'approved',
      }),
      makeDoc('online', {
        title: 'Online Yoga',
        date: todayPlus(2),
        category: 'Yoga',
        bezirk: '',
        isOnline: true,
        status: 'approved',
      }),
      makeDoc('dornbirn', {
        title: 'Dornbirn Yoga',
        date: todayPlus(3),
        category: 'Yoga',
        bezirk: 'Dornbirn',
        isOnline: false,
        status: 'approved',
      }),
    ];

    render(
      <MemoryRouter>
        <SimilarEvents
          currentEvent={{
            id: 'current-online',
            title: 'Yoga online jetzt',
            category: 'Yoga',
            bezirk: '',
            isOnline: true,
            date: todayPlus(0),
            status: 'approved',
          }}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('similar-event-card')).toHaveLength(3);
    });

    const titles = within(screen.getByTestId('similar-events-slider'))
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);

    expect(titles).toEqual(['Online Yoga', 'Dornbirn Yoga', 'Bregenz Yoga']);
  });

  it('still excludes the current event from the results', async () => {
    mockDocs.docs = [
      makeDoc('self', {
        title: 'Selbst Yoga',
        date: todayPlus(1),
        category: 'Yoga',
        bezirk: 'Dornbirn',
        status: 'approved',
      }),
      makeDoc('other', {
        title: 'Anderes Yoga',
        date: todayPlus(2),
        category: 'Yoga',
        bezirk: 'Dornbirn',
        status: 'approved',
      }),
    ];

    render(
      <MemoryRouter>
        <SimilarEvents
          currentEvent={{
            id: 'self',
            title: 'Selbst Yoga',
            category: 'Yoga',
            bezirk: 'Dornbirn',
            date: todayPlus(0),
            status: 'approved',
          }}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('similar-event-card')).toHaveLength(1);
    });

    expect(
      within(screen.getByTestId('similar-events-slider').children[0]).getByRole('heading', {
        level: 3,
      }).textContent
    ).toBe('Anderes Yoga');
  });

  it('renders nothing when no other event shares the category', async () => {
    mockDocs.docs = [
      makeDoc('other-category', {
        title: 'Meditation',
        date: todayPlus(2),
        category: 'Meditation',
        bezirk: 'Dornbirn',
        status: 'approved',
      }),
    ];

    render(
      <MemoryRouter>
        <SimilarEvents
          currentEvent={{
            id: 'current-yoga',
            title: 'Yoga aktuell',
            category: 'Yoga',
            bezirk: 'Dornbirn',
            date: todayPlus(0),
            status: 'approved',
          }}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('similar-events')).toBeNull();
    });
  });
});
