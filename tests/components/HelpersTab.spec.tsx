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

const mockUserSearch = vi.hoisted(() => ({
  query: '',
  setQuery: vi.fn(),
  results: [],
  loading: false,
  error: null,
  reset: vi.fn(),
}));

const mockUploadHelperImage = vi.hoisted(() => vi.fn());

vi.mock('../../src/hooks/useHelpers', () => ({
  useHelpers: () => mockHelpers,
}));

vi.mock('../../src/hooks/useUserSearch', () => ({
  useUserSearch: () => mockUserSearch,
}));

vi.mock('../../src/lib/imageUpload', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    uploadHelperImage: (...args) => mockUploadHelperImage(...args),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockHelpers.helpers = [];
  mockHelpers.loading = false;
  mockHelpers.error = null;
  mockHelpers.isAdmin = true;
  mockUserSearch.query = '';
  mockUserSearch.results = [];
  mockUserSearch.loading = false;
  mockUserSearch.error = null;
  mockUploadHelperImage.mockResolvedValue('https://storage.example.com/uploaded-helper.jpg');
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

  it('prepends https:// to a bare website URL', async () => {
    render(<HelpersTab />);
    fireEvent.click(screen.getByTestId('helpers-tab-add'));
    fireEvent.change(screen.getByTestId('helper-edit-name'), {
      target: { value: 'Carla Costa' },
    });
    fireEvent.change(screen.getByTestId('helper-edit-website'), {
      target: { value: 'carla.example' },
    });
    fireEvent.click(screen.getByTestId('helper-edit-save'));

    await waitFor(() => {
      expect(mockHelpers.addHelper).toHaveBeenCalledWith(
        expect.objectContaining({ website: 'https://carla.example' })
      );
    });
  });

  it('upgrades http:// to https:// when saving a website URL', async () => {
    render(<HelpersTab />);
    fireEvent.click(screen.getByTestId('helpers-tab-add'));
    fireEvent.change(screen.getByTestId('helper-edit-name'), {
      target: { value: 'Carla Costa' },
    });
    fireEvent.change(screen.getByTestId('helper-edit-website'), {
      target: { value: 'http://carla.example/about' },
    });
    fireEvent.click(screen.getByTestId('helper-edit-save'));

    await waitFor(() => {
      expect(mockHelpers.addHelper).toHaveBeenCalledWith(
        expect.objectContaining({ website: 'https://carla.example/about' })
      );
    });
  });

  it('keeps an existing https:// website URL unchanged', async () => {
    render(<HelpersTab />);
    fireEvent.click(screen.getByTestId('helpers-tab-add'));
    fireEvent.change(screen.getByTestId('helper-edit-name'), {
      target: { value: 'Carla Costa' },
    });
    fireEvent.change(screen.getByTestId('helper-edit-website'), {
      target: { value: 'https://carla.example/about' },
    });
    fireEvent.click(screen.getByTestId('helper-edit-save'));

    await waitFor(() => {
      expect(mockHelpers.addHelper).toHaveBeenCalledWith(
        expect.objectContaining({ website: 'https://carla.example/about' })
      );
    });
  });

  it('keeps a leading-slash photo URL as a project path', async () => {
    render(<HelpersTab />);
    fireEvent.click(screen.getByTestId('helpers-tab-add'));
    fireEvent.change(screen.getByTestId('helper-edit-name'), {
      target: { value: 'Carla Costa' },
    });
    fireEvent.change(screen.getByTestId('helper-edit-photo'), {
      target: { value: '/photos/carla.jpg' },
    });
    fireEvent.click(screen.getByTestId('helper-edit-save'));

    await waitFor(() => {
      expect(mockHelpers.addHelper).toHaveBeenCalledWith(
        expect.objectContaining({ photoURL: '/photos/carla.jpg' })
      );
    });
  });

  it('prepends https:// to a bare photo URL', async () => {
    render(<HelpersTab />);
    fireEvent.click(screen.getByTestId('helpers-tab-add'));
    fireEvent.change(screen.getByTestId('helper-edit-name'), {
      target: { value: 'Carla Costa' },
    });
    fireEvent.change(screen.getByTestId('helper-edit-photo'), {
      target: { value: 'carla.example/photo.jpg' },
    });
    fireEvent.click(screen.getByTestId('helper-edit-save'));

    await waitFor(() => {
      expect(mockHelpers.addHelper).toHaveBeenCalledWith(
        expect.objectContaining({ photoURL: 'https://carla.example/photo.jpg' })
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

  it('shows the user search field only when creating a new helper', () => {
    render(<HelpersTab />);
    fireEvent.click(screen.getByTestId('helpers-tab-add'));
    expect(screen.getByTestId('helper-user-search')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('helper-edit-cancel'));
    expect(screen.queryByTestId('helper-user-search')).not.toBeInTheDocument();

    mockHelpers.helpers = SEED;
    render(<HelpersTab />);
    fireEvent.click(screen.getAllByTestId('helper-row-edit')[0]);
    expect(screen.queryByTestId('helper-user-search')).not.toBeInTheDocument();
  });

  it('prefills the draft from the selected user search result', () => {
    mockUserSearch.query = 'anna';
    mockUserSearch.results = [
      {
        uid: 'user-1',
        username: 'anna.schmidt',
        displayName: 'Anna Schmidt',
        photoURL: 'https://example.com/anna.jpg',
        slug: 'anna-schmidt',
      },
    ];

    render(<HelpersTab />);
    fireEvent.click(screen.getByTestId('helpers-tab-add'));
    fireEvent.focus(screen.getByTestId('helper-user-search-input'));
    const options = screen.getAllByTestId('helper-user-search-option');
    fireEvent.mouseDown(options[0]);

    expect(screen.getByTestId('helper-edit-name')).toHaveValue('Anna Schmidt');
    expect(screen.getByTestId('helper-edit-profile-slug')).toHaveValue('/anna-schmidt');
    expect(screen.getByTestId('helper-edit-photo')).toHaveValue('https://example.com/anna.jpg');
    expect(screen.getByTestId('helper-photo-preview')).toHaveAttribute(
      'src',
      'https://example.com/anna.jpg'
    );
  });

  it('leaves the photo untouched when the selected user has no profile photo', () => {
    mockUserSearch.query = 'jane';
    mockUserSearch.results = [
      {
        uid: 'user-2',
        username: 'jane.doe',
        displayName: 'Jane Doe',
        photoURL: null,
        slug: 'jane-doe',
      },
    ];

    render(<HelpersTab />);
    fireEvent.click(screen.getByTestId('helpers-tab-add'));
    fireEvent.focus(screen.getByTestId('helper-user-search-input'));
    fireEvent.mouseDown(screen.getAllByTestId('helper-user-search-option')[0]);

    expect(screen.getByTestId('helper-edit-name')).toHaveValue('Jane Doe');
    expect(screen.getByTestId('helper-edit-profile-slug')).toHaveValue('/jane-doe');
    expect(screen.getByTestId('helper-edit-photo')).toHaveValue('');
    expect(screen.getByTestId('helper-photo-placeholder-empty')).toHaveTextContent('Kein Foto');
  });

  it('writes the uploaded photo URL into the form and the save payload', async () => {
    render(<HelpersTab />);
    fireEvent.click(screen.getByTestId('helpers-tab-add'));
    fireEvent.change(screen.getByTestId('helper-edit-name'), { target: { value: 'Doris' } });

    const fileInput = screen.getByTestId('helper-photo-upload-input');
    const file = new File(['fake'], 'doris.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockUploadHelperImage).toHaveBeenCalledWith(file);
    });
    await waitFor(() => {
      expect(screen.getByTestId('helper-edit-photo')).toHaveValue(
        'https://storage.example.com/uploaded-helper.jpg'
      );
    });

    fireEvent.click(screen.getByTestId('helper-edit-save'));
    await waitFor(() => {
      expect(mockHelpers.addHelper).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Doris',
          photoURL: 'https://storage.example.com/uploaded-helper.jpg',
        })
      );
    });
  });

  it('clears the photo URL when the admin removes the uploaded photo', () => {
    render(<HelpersTab />);
    fireEvent.click(screen.getByTestId('helpers-tab-add'));
    fireEvent.change(screen.getByTestId('helper-edit-photo'), {
      target: { value: '/photos/doris.jpg' },
    });
    expect(screen.getByTestId('helper-edit-photo')).toHaveValue('/photos/doris.jpg');
    fireEvent.click(screen.getByTestId('helper-photo-remove'));
    expect(screen.getByTestId('helper-edit-photo')).toHaveValue('');
  });
});
