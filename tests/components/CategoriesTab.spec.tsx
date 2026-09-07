import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CategoriesTab from '../../src/components/CategoriesTab';

const mockRegistry = vi.hoisted(() => ({
  categories: [],
  colorByName: new Map(),
  nameExists: vi.fn(() => false),
  loading: false,
  error: null,
  isAdmin: true,
  addCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

const mockEvents = vi.hoisted(() => ({ events: [] }));

vi.mock('../../src/hooks/useCategoryRegistry', () => ({
  useCategoryRegistry: () => mockRegistry,
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useAllEvents: () => mockEvents,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRegistry.categories = [];
  mockRegistry.colorByName = new Map();
  mockRegistry.loading = false;
  mockRegistry.error = null;
  mockRegistry.isAdmin = true;
  mockRegistry.nameExists.mockReturnValue(false);
  mockEvents.events = [];
});

const SEED_CATS = [
  { id: 'breathwork', name: 'Breathwork', color: '#bf5b4e' },
  { id: 'meditation', name: 'Meditation', color: '#5c6b3f' },
  { id: 'yoga', name: 'Yoga', color: '#c48e6a' },
];

describe('CategoriesTab', () => {
  it('shows a loading spinner while the registry is loading', () => {
    mockRegistry.loading = true;
    render(<CategoriesTab />);
    expect(screen.getByTestId('categories-tab-loading')).toBeInTheDocument();
  });

  it('shows an error message when the registry fails', () => {
    mockRegistry.error = 'Netzwerk kaputt';
    render(<CategoriesTab />);
    expect(screen.getByTestId('categories-tab-error')).toHaveTextContent('Netzwerk kaputt');
  });

  it('shows an empty-state when the registry is empty', () => {
    render(<CategoriesTab />);
    expect(screen.getByTestId('categories-tab-empty')).toBeInTheDocument();
  });

  it('lists categories with their color and the count of approved events', () => {
    mockRegistry.categories = SEED_CATS;
    mockEvents.events = [
      { status: 'approved', category: 'Yoga' },
      { status: 'approved', category: 'Yoga' },
      { status: 'pending', category: 'Yoga' },
      { status: 'approved', category: 'Meditation' },
    ];
    render(<CategoriesTab />);

    const rows = screen.getAllByTestId('category-row');
    expect(rows).toHaveLength(3);

    expect(rows[0]).toHaveAttribute('data-category-id', 'breathwork');
    expect(rows[0].textContent).toContain('0 Events');
    expect(rows[1].textContent).toContain('1 Event'); // no pluralization for 1
    expect(rows[2].textContent).toContain('2 Events');
  });

  it('opens the edit dialog when "Bearbeiten" is clicked and seeds the form', () => {
    mockRegistry.categories = SEED_CATS;
    render(<CategoriesTab />);
    fireEvent.click(screen.getAllByTestId('category-row-edit')[0]);
    expect(screen.getByTestId('category-edit-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('category-edit-name')).toHaveValue('Breathwork');
  });

  it('calls updateCategory when an existing category is saved', async () => {
    mockRegistry.categories = SEED_CATS;
    render(<CategoriesTab />);

    fireEvent.click(screen.getAllByTestId('category-row-edit')[2]); // Yoga
    fireEvent.change(screen.getByTestId('category-edit-name'), { target: { value: 'Yoga' } });
    fireEvent.change(screen.getByTestId('color-picker-hex'), { target: { value: '#ffffff' } });
    fireEvent.click(screen.getByTestId('category-edit-save'));

    await waitFor(() => {
      expect(mockRegistry.updateCategory).toHaveBeenCalledWith('yoga', {
        name: 'Yoga',
        color: '#ffffff',
      });
    });
  });

  it('calls addCategory when a new category is saved', async () => {
    mockRegistry.categories = SEED_CATS;
    render(<CategoriesTab />);

    fireEvent.click(screen.getByTestId('categories-tab-add'));
    fireEvent.change(screen.getByTestId('category-edit-name'), { target: { value: 'Pilates' } });
    fireEvent.change(screen.getByTestId('color-picker-hex'), { target: { value: '#4a7572' } });
    fireEvent.click(screen.getByTestId('category-edit-save'));

    await waitFor(() => {
      expect(mockRegistry.addCategory).toHaveBeenCalledWith({
        name: 'Pilates',
        color: '#4a7572',
      });
    });
  });

  it('requires confirmation before deleting a category', async () => {
    mockRegistry.categories = SEED_CATS;
    render(<CategoriesTab />);

    fireEvent.click(screen.getAllByTestId('category-row-delete')[0]); // Breathwork, 0 events
    expect(screen.getByText(/wirklich gelöscht werden/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => {
      expect(mockRegistry.deleteCategory).toHaveBeenCalledWith('breathwork');
    });
  });

  it('warns about event usage before deleting a category that is in use', async () => {
    mockRegistry.categories = SEED_CATS;
    mockEvents.events = [
      { status: 'approved', category: 'Yoga' },
      { status: 'approved', category: 'Yoga' },
    ];
    render(<CategoriesTab />);

    fireEvent.click(screen.getAllByTestId('category-row-delete')[2]); // Yoga, 2 events
    expect(screen.getByText(/2 Events verwendet/)).toBeInTheDocument();
    expect(
      screen.getByText(/Beim Löschen verlieren diese Events ihre Kategorie-Zuordnung/)
    ).toBeInTheDocument();
  });
});
