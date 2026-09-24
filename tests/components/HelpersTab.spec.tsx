import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HelpersTab from '../../src/components/HelpersTab';

const mockHelpers = vi.hoisted(() => ({
  helpers: [],
  loading: false,
  error: null,
  isAdmin: true,
  addHelper: vi.fn(),
  updateHelper: vi.fn(),
  deleteHelper: vi.fn(),
  reorderHelpers: vi.fn(async (orderedIds) => {
    const map = new Map(mockHelpers.helpers.map((h) => [h.id, h]));
    mockHelpers.helpers = orderedIds
      .map((id, index) => {
        const h = map.get(id);
        return h ? { ...h, order: index * 100 } : null;
      })
      .filter(Boolean);
  }),
}));

vi.mock('../../src/hooks/useHelpers', () => ({
  useHelpers: () => mockHelpers,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockHelpers.helpers = [];
  mockHelpers.loading = false;
  mockHelpers.error = null;
  mockHelpers.isAdmin = true;
});

const SEED = [
  {
    id: 'h1',
    name: 'Anna Müller',
    profileSlug: '/anna',
    website: 'https://anna.example',
    photoURL: '/anna.jpg',
    description: 'Hilft bei Events.',
    createdBy: 'admin',
  },
  {
    id: 'h2',
    name: 'Bernd Berger',
    description: 'Webmaster.',
    createdBy: 'admin',
  },
];

describe('HelpersTab', () => {
  it('shows a loading spinner while the registry loads', () => {
    mockHelpers.loading = true;
    render(<HelpersTab />);
    expect(screen.getByTestId('helpers-tab-loading')).toBeInTheDocument();
  });

  it('shows an error message when the registry fails', () => {
    mockHelpers.error = 'Netzwerk kaputt';
    render(<HelpersTab />);
    expect(screen.getByTestId('helpers-tab-error')).toHaveTextContent('Netzwerk kaputt');
  });

  it('shows an empty state when there are no helpers', () => {
    render(<HelpersTab />);
    expect(screen.getByTestId('helpers-tab-empty')).toBeInTheDocument();
  });

  it('lists helpers with name, photo and description', () => {
    mockHelpers.helpers = SEED;
    render(<HelpersTab />);
    const rows = screen.getAllByTestId('helper-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Anna Müller');
    expect(rows[0]).toHaveTextContent('Hilft bei Events.');
    expect(rows[0].querySelector('.helper-row-photo')).not.toBeNull();
    expect(rows[1]).toHaveTextContent('Bernd Berger');
    expect(rows[1].querySelector('.helper-row-photo-placeholder')).not.toBeNull();
  });

  it('opens the edit dialog when Bearbeiten is clicked and seeds the form', () => {
    mockHelpers.helpers = SEED;
    render(<HelpersTab />);
    fireEvent.click(screen.getAllByTestId('helper-row-edit')[0]);
    const dialog = screen.getByTestId('helper-edit-dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId('helper-edit-name')).toHaveValue('Anna Müller');
    expect(screen.getByTestId('helper-edit-description')).toHaveValue('Hilft bei Events.');
  });

  it('calls addHelper when a new helper is saved', async () => {
    mockHelpers.helpers = SEED;
    render(<HelpersTab />);
    fireEvent.click(screen.getByTestId('helpers-tab-add'));
    fireEvent.change(screen.getByTestId('helper-edit-name'), {
      target: { value: 'Carla Costa' },
    });
    fireEvent.change(screen.getByTestId('helper-edit-description'), {
      target: { value: 'Designerin.' },
    });
    fireEvent.click(screen.getByTestId('helper-edit-save'));

    await waitFor(() => {
      expect(mockHelpers.addHelper).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Carla Costa',
          description: 'Designerin.',
        })
      );
    });
  });

  it('calls updateHelper when an existing helper is saved', async () => {
    mockHelpers.helpers = SEED;
    render(<HelpersTab />);
    fireEvent.click(screen.getAllByTestId('helper-row-edit')[0]);
    fireEvent.change(screen.getByTestId('helper-edit-name'), {
      target: { value: 'Anna Müller-Schmidt' },
    });
    fireEvent.click(screen.getByTestId('helper-edit-save'));

    await waitFor(() => {
      expect(mockHelpers.updateHelper).toHaveBeenCalledWith(
        'h1',
        expect.objectContaining({ name: 'Anna Müller-Schmidt' })
      );
    });
  });

  it('requires confirmation before deleting a helper', async () => {
    mockHelpers.helpers = SEED;
    render(<HelpersTab />);
    fireEvent.click(screen.getAllByTestId('helper-row-delete')[0]);
    expect(screen.getByText(/wirklich aus der Helferliste entfernt/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => {
      expect(mockHelpers.deleteHelper).toHaveBeenCalledWith('h1');
    });
  });

  it('caps the description at 120 characters', () => {
    render(<HelpersTab />);
    fireEvent.click(screen.getByTestId('helpers-tab-add'));
    const textarea = screen.getByTestId('helper-edit-description');
    const long = 'x'.repeat(200);
    fireEvent.change(textarea, { target: { value: long } });
    expect(textarea).toHaveValue('x'.repeat(120));
    expect(screen.getByTestId('helper-edit-description-count')).toHaveTextContent('120/120');
  });

  it('calls reorderHelpers when down is clicked', async () => {
    mockHelpers.helpers = SEED;
    render(<HelpersTab />);
    fireEvent.click(screen.getAllByTestId('helper-row-down')[0]);
    await waitFor(() => {
      expect(mockHelpers.reorderHelpers).toHaveBeenCalledWith(['h2', 'h1']);
    });
  });
});
