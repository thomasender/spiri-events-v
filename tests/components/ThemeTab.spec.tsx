import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ThemeTab from '../../src/components/ThemeTab';
import { THEME_DEFAULTS, THEME_VARIABLES } from '../../src/utils/themeDefaults';

const mockHook = vi.hoisted(() => ({
  // Editor values — defaults to bundled defaults so the "modified" badge
  // starts at zero and rows render with the expected starting swatches.
  settings: {} as Record<string, string>,
  groupedVariables: [] as Array<{ group: string; variables: typeof THEME_VARIABLES }>,
  editorBase: { kind: 'active' as 'active' | 'saved' },
  editorBaseValues: {} as Record<string, string>,
  activeThemeId: null,
  activeThemeName: null,
  themes: [] as Array<{
    id: string;
    name: string;
    description?: string | null;
    values: Record<string, string>;
  }>,
  loading: false,
  error: null,
  isAdmin: true,
  isModified: vi.fn(() => false),
  modifiedCount: 0,
  updateVariable: vi.fn(),
  resetToDefault: vi.fn(),
  resetAllToDefaults: vi.fn(),
  loadIntoEditor: vi.fn(),
  resetEditorToBase: vi.fn(),
  saveAsNewTheme: vi.fn(async () => 'new-id'),
  saveLoadedTheme: vi.fn(async () => {}),
  renameTheme: vi.fn(async () => {}),
  deleteTheme: vi.fn(async () => {}),
  activateEditor: vi.fn(async () => {}),
  activateSavedTheme: vi.fn(async () => {}),
  broadcastEditorValues: vi.fn(),
}));

vi.mock('../../src/hooks/useThemeSettings', () => ({
  useThemeSettings: () => mockHook,
}));

function setupGroupedVariables() {
  const groups = new Map<string, typeof THEME_VARIABLES>();
  for (const variable of THEME_VARIABLES) {
    if (!groups.has(variable.group)) groups.set(variable.group, []);
    groups.get(variable.group)!.push(variable);
  }
  mockHook.groupedVariables = Array.from(groups.entries()).map(([group, variables]) => ({
    group,
    variables,
  }));
}

function setupEditorBase() {
  mockHook.editorBaseValues = { ...THEME_DEFAULTS };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHook.settings = { ...THEME_DEFAULTS };
  setupEditorBase();
  mockHook.editorBase = { kind: 'active' };
  mockHook.activeThemeId = null;
  mockHook.activeThemeName = null;
  mockHook.themes = [];
  mockHook.loading = false;
  mockHook.error = null;
  mockHook.isAdmin = true;
  mockHook.isModified.mockReturnValue(false);
  mockHook.modifiedCount = 0;
  mockHook.broadcastEditorValues = vi.fn();
  setupGroupedVariables();
});

describe('ThemeTab', () => {
  it('shows a loading spinner while the theme is loading', () => {
    mockHook.loading = true;
    render(<ThemeTab />);
    expect(screen.getByTestId('theme-tab-loading')).toBeInTheDocument();
  });

  it('shows an error message when the theme fails to load', () => {
    mockHook.error = 'Firestore weg';
    render(<ThemeTab />);
    expect(screen.getByTestId('theme-tab-error')).toHaveTextContent('Firestore weg');
  });

  it('renders every group and every variable by default', () => {
    render(<ThemeTab />);
    const groups = screen.getAllByTestId('theme-tab-group');
    expect(groups.length).toBe(mockHook.groupedVariables.length);
    const rows = screen.getAllByTestId('theme-row');
    expect(rows.length).toBe(THEME_VARIABLES.length);
  });

  it('shows the variable name and label', () => {
    render(<ThemeTab />);
    const row = screen
      .getAllByTestId('theme-row')
      .find((el) => el.getAttribute('data-variable-name') === '--accent-primary');
    expect(row).toBeDefined();
    expect(row!.textContent).toContain('--accent-primary');
    expect(row!.textContent).toContain('Akzent Primär');
  });

  it('tags unused variables with the "ungenutzt" badge', () => {
    render(<ThemeTab />);
    const unusedRow = screen
      .getAllByTestId('theme-row')
      .find((el) => el.getAttribute('data-variable-name') === '--sound-healing');
    expect(unusedRow).toBeDefined();
    expect(unusedRow!.querySelector('[data-testid="theme-row-unused-badge"]')).not.toBeNull();
  });

  it('renders a readonly hex code when the user is not admin', () => {
    mockHook.isAdmin = false;
    render(<ThemeTab />);
    expect(screen.getByTestId('theme-tab-readonly')).toBeInTheDocument();
    const readonlyValue = screen.getAllByTestId('theme-row-readonly-value');
    expect(readonlyValue.length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('color-picker-native').length).toBe(0);
  });

  it('updates the editor when the color picker changes a value', () => {
    render(<ThemeTab />);
    const hexInputs = screen.getAllByTestId('color-picker-hex');
    fireEvent.change(hexInputs[0], { target: { value: '#abcdef' } });
    expect(mockHook.updateVariable).toHaveBeenCalledWith('--bg-primary', '#abcdef');
  });

  it('opens the info dialog with usage details when "Info" is clicked', () => {
    render(<ThemeTab />);
    const infoButtons = screen.getAllByTestId('theme-row-info');
    fireEvent.click(infoButtons[0]);
    expect(screen.getByTestId('theme-info-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('theme-info-name').textContent).toContain('--bg-primary');
    const usageList = screen.queryByTestId('theme-info-usage-list');
    expect(usageList).not.toBeNull();
  });

  it('shows a "currently unused" note for unused tokens in the info dialog', () => {
    render(<ThemeTab />);
    const unusedRow = screen
      .getAllByTestId('theme-row')
      .find((el) => el.getAttribute('data-variable-name') === '--free-bg');
    const infoButton = unusedRow!.querySelector('[data-testid="theme-row-info"]') as HTMLElement;
    fireEvent.click(infoButton);
    expect(screen.getByTestId('theme-info-dialog').textContent).toMatch(
      /aktuell nirgendwo im Code/i
    );
  });

  it('disables the per-row reset button when the token is not modified', () => {
    mockHook.isModified.mockReturnValue(false);
    render(<ThemeTab />);
    const resetButtons = screen.getAllByTestId('theme-row-reset');
    expect(resetButtons[0]).toBeDisabled();
  });

  it('calls resetToDefault when a per-row reset button is clicked', () => {
    mockHook.isModified.mockImplementation((name: string) => name === '--accent-primary');
    render(<ThemeTab />);
    const row = screen
      .getAllByTestId('theme-row')
      .find((el) => el.getAttribute('data-variable-name') === '--accent-primary');
    const resetBtn = row!.querySelector('[data-testid="theme-row-reset"]') as HTMLElement;
    fireEvent.click(resetBtn);
    expect(mockHook.resetToDefault).toHaveBeenCalledWith('--accent-primary');
  });

  it('disables the "Auf Standard zurücksetzen" button when nothing is modified', () => {
    mockHook.modifiedCount = 0;
    render(<ThemeTab />);
    expect(screen.getByTestId('theme-tab-reset-all')).toBeDisabled();
  });

  it('shows a modified-count badge and a confirm dialog when "Auf Standard zurücksetzen" is clicked', () => {
    mockHook.modifiedCount = 3;
    render(<ThemeTab />);
    expect(screen.getByTestId('theme-tab-modified-count').textContent).toContain('3 Variablen');
    fireEvent.click(screen.getByTestId('theme-tab-reset-all'));
    expect(screen.getByText(/alle theme-variablen auf standard zurücksetzen/i)).toBeInTheDocument();
  });

  it('calls resetAllToDefaults when the reset confirm dialog is confirmed', () => {
    mockHook.modifiedCount = 2;
    render(<ThemeTab />);
    fireEvent.click(screen.getByTestId('theme-tab-reset-all'));
    const confirmButton = screen.getByRole('button', { name: 'Zurücksetzen' });
    fireEvent.click(confirmButton);
    expect(mockHook.resetAllToDefaults).toHaveBeenCalled();
  });

  it('shows an inline error when updateVariable throws', () => {
    mockHook.updateVariable.mockImplementationOnce(() => {
      throw new Error('Boom');
    });
    render(<ThemeTab />);
    const hexInputs = screen.getAllByTestId('color-picker-hex');
    fireEvent.change(hexInputs[0], { target: { value: '#abcdef' } });
    expect(screen.getByTestId('theme-tab-form-error')).toHaveTextContent('Boom');
  });

  it('disables the "Aktivieren" button when the editor matches the live theme', () => {
    render(<ThemeTab />);
    const activate = screen.getByTestId('theme-tab-activate');
    expect(activate).toBeDisabled();
  });

  it('enables and calls activateEditor when the editor has unsaved changes', async () => {
    mockHook.modifiedCount = 2;
    mockHook.isModified.mockReturnValue(true);
    render(<ThemeTab />);
    const activate = screen.getByTestId('theme-tab-activate');
    expect(activate).not.toBeDisabled();
    fireEvent.click(activate);
    expect(mockHook.activateEditor).toHaveBeenCalledWith(null);
  });

  it('links the activated theme to the currently loaded saved theme', async () => {
    mockHook.modifiedCount = 1;
    mockHook.isModified.mockReturnValue(true);
    mockHook.editorBase = { kind: 'saved', themeId: 'theme-abc', name: 'Waldfrühling' };
    render(<ThemeTab />);
    fireEvent.click(screen.getByTestId('theme-tab-activate'));
    expect(mockHook.activateEditor).toHaveBeenCalledWith('theme-abc');
  });

  it('hides the "Speichern" button when editing the live theme and shows it for a loaded saved theme', () => {
    mockHook.modifiedCount = 2;
    mockHook.isModified.mockReturnValue(true);
    const { rerender } = render(<ThemeTab />);
    expect(screen.queryByTestId('theme-tab-save-loaded')).toBeNull();

    mockHook.editorBase = { kind: 'saved', themeId: 'theme-abc', name: 'Waldfrühling' };
    rerender(<ThemeTab />);
    expect(screen.getByTestId('theme-tab-save-loaded')).toBeInTheDocument();
  });

  it('calls saveLoadedTheme when "Speichern" is clicked', () => {
    mockHook.editorBase = { kind: 'saved', themeId: 'theme-abc', name: 'Waldfrühling' };
    mockHook.modifiedCount = 1;
    mockHook.isModified.mockReturnValue(true);
    render(<ThemeTab />);
    fireEvent.click(screen.getByTestId('theme-tab-save-loaded'));
    expect(mockHook.saveLoadedTheme).toHaveBeenCalled();
  });

  it('opens the save-as-new dialog and forwards the entered name', async () => {
    render(<ThemeTab />);
    fireEvent.click(screen.getByTestId('theme-tab-save-as-new'));
    const dialog = screen.getByTestId('save-theme-dialog');
    expect(dialog).toBeInTheDocument();
    fireEvent.change(within(dialog).getByTestId('save-theme-name'), {
      target: { value: 'Mein Theme' },
    });
    fireEvent.click(within(dialog).getByTestId('save-theme-confirm'));
    expect(mockHook.saveAsNewTheme).toHaveBeenCalledWith({
      name: 'Mein Theme',
      description: '',
    });
  });

  it('renders an empty state in the saved themes library', () => {
    render(<ThemeTab />);
    expect(screen.getByTestId('theme-tab-library-empty')).toBeInTheDocument();
  });

  it('renders each saved theme with load/activate/rename/delete actions', () => {
    mockHook.themes = [
      {
        id: 'theme-a',
        name: 'Waldfrühling',
        description: 'Frische Grüntöne',
        values: { ...THEME_DEFAULTS, '--accent-primary': '#3f523c' },
      },
      {
        id: 'theme-b',
        name: 'Sonnenuntergang',
        description: null,
        values: { ...THEME_DEFAULTS, '--accent-primary': '#c48e6a' },
      },
    ];
    render(<ThemeTab />);
    const rows = screen.getAllByTestId('theme-library-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Waldfrühling');
  });

  it('tags the active theme with the "aktiv" badge', () => {
    mockHook.themes = [
      {
        id: 'theme-a',
        name: 'Waldfrühling',
        description: null,
        values: { ...THEME_DEFAULTS },
      },
    ];
    mockHook.activeThemeId = 'theme-a';
    mockHook.activeThemeName = 'Waldfrühling';
    render(<ThemeTab />);
    const row = screen.getByTestId('theme-library-row');
    expect(row).toHaveAttribute('data-active', 'true');
    expect(within(row).getByTestId('theme-library-row-active-badge')).toBeInTheDocument();
  });

  it('calls loadIntoEditor when "Laden" is clicked on a theme row', () => {
    mockHook.themes = [
      {
        id: 'theme-a',
        name: 'Waldfrühling',
        description: null,
        values: { ...THEME_DEFAULTS },
      },
    ];
    render(<ThemeTab />);
    fireEvent.click(screen.getByTestId('theme-library-row-load'));
    expect(mockHook.loadIntoEditor).toHaveBeenCalledWith('saved', 'theme-a');
  });

  it('calls activateSavedTheme when "Aktivieren" is clicked on a theme row', () => {
    mockHook.themes = [
      {
        id: 'theme-a',
        name: 'Waldfrühling',
        description: null,
        values: { ...THEME_DEFAULTS },
      },
    ];
    render(<ThemeTab />);
    fireEvent.click(screen.getByTestId('theme-library-row-activate'));
    expect(mockHook.activateSavedTheme).toHaveBeenCalledWith('theme-a');
  });

  it('opens inline rename and commits the new name', async () => {
    mockHook.themes = [
      {
        id: 'theme-a',
        name: 'Waldfrühling',
        description: null,
        values: { ...THEME_DEFAULTS },
      },
    ];
    render(<ThemeTab />);
    fireEvent.click(screen.getByTestId('theme-library-row-rename'));
    const input = screen.getByTestId('theme-library-rename-input');
    fireEvent.change(input, { target: { value: 'Sommerregen' } });
    fireEvent.click(screen.getByTestId('theme-library-rename-confirm'));
    expect(mockHook.renameTheme).toHaveBeenCalledWith('theme-a', 'Sommerregen');
  });

  it('opens the delete confirm dialog and calls deleteTheme on confirm', () => {
    mockHook.themes = [
      {
        id: 'theme-a',
        name: 'Waldfrühling',
        description: null,
        values: { ...THEME_DEFAULTS },
      },
    ];
    render(<ThemeTab />);
    fireEvent.click(screen.getByTestId('theme-library-row-delete'));
    const dialogs = screen.getAllByText(/Theme löschen/i);
    expect(dialogs.length).toBeGreaterThan(0);
    // ConfirmDialog renders a "Löschen" button — there are multiple so
    // grab the last one which is the confirm action.
    const buttons = screen.getAllByRole('button', { name: 'Löschen' });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(mockHook.deleteTheme).toHaveBeenCalledWith('theme-a');
  });

  it('renders the calendar preview link', () => {
    render(<ThemeTab />);
    const link = screen.getByTestId('theme-tab-preview-link');
    expect(link.getAttribute('href')).toBe('/');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('displays the active theme name in the editor header', () => {
    mockHook.activeThemeName = 'Waldfrühling';
    render(<ThemeTab />);
    expect(screen.getByTestId('theme-tab-active-theme-name').textContent).toContain('Waldfrühling');
  });

  it('broadcasts editor values to the preview channel on mount and after edits', () => {
    const { rerender } = render(<ThemeTab />);
    // Initial mount broadcasts the current editor state so a freshly opened
    // preview tab gets the latest values without having to wait for the
    // admin to touch anything.
    expect(mockHook.broadcastEditorValues).toHaveBeenCalledWith(THEME_DEFAULTS);

    mockHook.settings = { ...THEME_DEFAULTS, '--accent-primary': '#abcdef' };
    rerender(<ThemeTab />);
    expect(mockHook.broadcastEditorValues).toHaveBeenCalledWith(
      expect.objectContaining({ '--accent-primary': '#abcdef' })
    );
  });
});
