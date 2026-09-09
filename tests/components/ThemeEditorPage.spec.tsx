import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ThemeEditorPage from '../../src/pages/ThemeEditorPage';
import { THEME_DEFAULTS, THEME_VARIABLES } from '../../src/utils/themeDefaults';

const mockHook = vi.hoisted(() => ({
  settings: {} as Record<string, string>,
  groupedVariables: [] as Array<{ group: string; variables: typeof THEME_VARIABLES }>,
  editorBase: { kind: 'active' as 'active' | 'saved' },
  editorBaseValues: {} as Record<string, string>,
  activeThemeId: null as string | null,
  activeThemeName: null as string | null,
  themes: [] as Array<{
    id: string;
    name: string;
    description?: string | null;
    values: Record<string, string>;
  }>,
  loading: false,
  error: null as string | null,
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

// Stub SeoMeta so the page doesn't need a HelmetProvider wrapper in the
// test environment — the editor's SEO contract is exercised by the
// integration tests against the real provider.
vi.mock('../../src/components/SeoMeta', () => ({
  default: () => null,
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

beforeEach(() => {
  vi.clearAllMocks();
  mockHook.settings = { ...THEME_DEFAULTS };
  mockHook.editorBaseValues = { ...THEME_DEFAULTS };
  mockHook.editorBase = { kind: 'active' };
  mockHook.activeThemeId = null;
  mockHook.activeThemeName = null;
  mockHook.themes = [];
  mockHook.loading = false;
  mockHook.error = null;
  mockHook.isAdmin = true;
  mockHook.isModified.mockReturnValue(false);
  mockHook.modifiedCount = 0;
  setupGroupedVariables();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/theme-editor']}>
      <ThemeEditorPage />
    </MemoryRouter>
  );
}

describe('ThemeEditorPage', () => {
  it('shows a loading state while the theme is loading', () => {
    mockHook.loading = true;
    renderPage();
    expect(screen.getByTestId('theme-editor-page-loading')).toBeInTheDocument();
  });

  it('shows an error state when the theme fails to load', () => {
    mockHook.error = 'Firestore weg';
    renderPage();
    const errorBox = screen.getByTestId('theme-editor-page-error');
    expect(errorBox).toHaveTextContent('Firestore weg');
  });

  it('renders the workspace, sidebar groups and sandbox on success', () => {
    renderPage();
    expect(screen.getByTestId('theme-editor-page')).toBeInTheDocument();
    expect(screen.getByTestId('theme-editor-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('theme-editor-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('theme-editor-preview')).toBeInTheDocument();
    expect(screen.getByTestId('theme-editor-sandbox')).toBeInTheDocument();
  });

  it('renders every variable as a sidebar row with the variable name as data attribute', () => {
    renderPage();
    const rows = screen.getAllByTestId('theme-editor-row');
    expect(rows.length).toBe(THEME_VARIABLES.length);
    const namesInDom = new Set(
      rows.map((row) => row.getAttribute('data-variable-name')).filter(Boolean)
    );
    for (const variable of THEME_VARIABLES) {
      expect(namesInDom.has(variable.name)).toBe(true);
    }
  });

  it('renders one group per THEME_GROUPS entry', () => {
    renderPage();
    const groups = screen.getAllByTestId('theme-editor-group');
    expect(groups.length).toBe(mockHook.groupedVariables.length);
  });

  it('shows the back-to-admin link', () => {
    renderPage();
    const link = screen.getByTestId('theme-editor-back-link');
    expect(link).toHaveAttribute('href', '/admin');
    expect(link).toHaveTextContent('Zurück zur Verwaltung');
  });

  it('shows the active theme name in the topbar', () => {
    mockHook.activeThemeName = 'Waldfrühling';
    renderPage();
    expect(screen.getByTestId('theme-editor-active-theme-name')).toHaveTextContent('Waldfrühling');
  });

  it('falls back to placeholder text when no saved theme is active', () => {
    mockHook.activeThemeId = null;
    mockHook.activeThemeName = null;
    renderPage();
    const name = screen.getByTestId('theme-editor-active-theme-name');
    expect(name).toHaveTextContent('Unbenannt (Standard)');
    expect(name.className).toMatch(/placeholder/);
  });

  it('shows "Aktives Theme" as the editor source by default', () => {
    renderPage();
    const source = screen.getByTestId('theme-editor-editor-source');
    expect(source).toHaveTextContent('Aktives Theme');
  });

  it('shows the loaded theme name and "aktiv" tag when the editor mirrors the active saved theme', () => {
    mockHook.editorBase = { kind: 'saved', themeId: 'wald', name: 'Waldfrühling' };
    mockHook.activeThemeId = 'wald';
    renderPage();
    const source = screen.getByTestId('theme-editor-editor-source');
    expect(source).toHaveTextContent('Waldfrühling');
    expect(source).toHaveTextContent('aktiv');
  });

  it('shows the modified badge when modifiedCount > 0', () => {
    mockHook.modifiedCount = 3;
    renderPage();
    expect(screen.getByTestId('theme-editor-modified-count')).toHaveTextContent(
      '3 Variablen abgeändert'
    );
  });

  it('uses singular wording in the modified badge for a single change', () => {
    mockHook.modifiedCount = 1;
    renderPage();
    expect(screen.getByTestId('theme-editor-modified-count')).toHaveTextContent(
      '1 Variable abgeändert'
    );
  });

  it('disables Speichern by default (no saved theme loaded)', () => {
    renderPage();
    expect(screen.getByTestId('theme-editor-save')).toBeDisabled();
  });

  it('disables Verwerfen when the editor is not modified', () => {
    renderPage();
    expect(screen.getByTestId('theme-editor-discard')).toBeDisabled();
  });

  it('disables Aktivieren when nothing changed', () => {
    renderPage();
    expect(screen.getByTestId('theme-editor-activate')).toBeDisabled();
  });

  it('enables Verwerfen and Aktivieren after a variable is modified', () => {
    mockHook.modifiedCount = 2;
    mockHook.isModified.mockImplementation((name) => name === '--accent-primary');
    renderPage();
    expect(screen.getByTestId('theme-editor-discard')).not.toBeDisabled();
    expect(screen.getByTestId('theme-editor-activate')).not.toBeDisabled();
  });

  it('enables Speichern when a saved theme is loaded and modified', () => {
    mockHook.editorBase = { kind: 'saved', themeId: 'wald', name: 'Waldfrühling' };
    mockHook.modifiedCount = 1;
    mockHook.isModified.mockReturnValue(true);
    renderPage();
    expect(screen.getByTestId('theme-editor-save')).not.toBeDisabled();
  });

  it('disables the library Aktivieren button for the currently active saved theme', () => {
    mockHook.themes = [
      {
        id: 'wald',
        name: 'Waldfrühling',
        description: 'Grüntöne',
        values: { ...THEME_DEFAULTS },
      },
    ];
    mockHook.activeThemeId = 'wald';
    renderPage();
    const activateBtn = screen.getByTestId('theme-editor-library-activate');
    expect(activateBtn).toBeDisabled();
  });

  it('marks the active theme row with data-active="true" and "aktiv" tag', () => {
    mockHook.themes = [
      {
        id: 'wald',
        name: 'Waldfrühling',
        description: 'Grüntöne',
        values: { ...THEME_DEFAULTS },
      },
    ];
    mockHook.activeThemeId = 'wald';
    renderPage();
    const row = screen.getByTestId('theme-editor-library-row');
    expect(row).toHaveAttribute('data-active', 'true');
    expect(within(row).getByTestId('theme-editor-library-active-tag')).toHaveTextContent('aktiv');
  });

  it('shows the empty-state copy when no themes are saved', () => {
    renderPage();
    expect(screen.getByTestId('theme-editor-library').textContent).toMatch(
      /Noch keine Themes gespeichert/
    );
  });

  it('calls updateVariable when a color picker hex changes', () => {
    renderPage();
    const row = document.querySelector(
      '[data-testid="theme-editor-row"][data-variable-name="--accent-primary"]'
    );
    expect(row).not.toBeNull();
    const hex = within(row).getByTestId('color-picker-hex');
    fireEvent.change(hex, { target: { value: '#abcdef' } });
    expect(mockHook.updateVariable).toHaveBeenCalledWith('--accent-primary', '#abcdef');
  });

  it('calls resetToDefault when the per-row reset button is clicked', () => {
    mockHook.isModified.mockImplementation((name) => name === '--accent-primary');
    renderPage();
    const row = document.querySelector(
      '[data-testid="theme-editor-row"][data-variable-name="--accent-primary"]'
    );
    const reset = within(row).getByTestId('theme-editor-row-reset');
    fireEvent.click(reset);
    expect(mockHook.resetToDefault).toHaveBeenCalledWith('--accent-primary');
  });

  it('marks modified rows via data-modified="true"', () => {
    mockHook.isModified.mockImplementation((name) => name === '--accent-primary');
    renderPage();
    const modifiedRow = document.querySelector(
      '[data-testid="theme-editor-row"][data-variable-name="--accent-primary"]'
    );
    expect(modifiedRow).toHaveAttribute('data-modified', 'true');
    const otherRow = document.querySelector(
      '[data-testid="theme-editor-row"][data-variable-name="--bg-primary"]'
    );
    expect(otherRow).toHaveAttribute('data-modified', 'false');
  });

  it('opens the info dialog when the info button is clicked', () => {
    renderPage();
    const row = document.querySelector(
      '[data-testid="theme-editor-row"][data-variable-name="--accent-primary"]'
    );
    const info = within(row).getByTestId('theme-editor-row-info');
    fireEvent.click(info);
    expect(screen.getByTestId('theme-info-overlay')).toBeInTheDocument();
  });

  it('collapses and expands a group when its header is clicked', () => {
    renderPage();
    const group = screen.getAllByTestId('theme-editor-group')[0];
    const toggle = within(group).getByTestId('theme-editor-group-toggle');
    // Initially expanded → body is present.
    expect(within(group).queryByTestId('theme-editor-group-body')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(within(group).queryByTestId('theme-editor-group-body')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(within(group).queryByTestId('theme-editor-group-body')).toBeInTheDocument();
  });

  it('opens the SaveThemeDialog when "Als neues Theme speichern" is clicked', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('theme-editor-save-as-new'));
    // SaveThemeDialog renders into a portal under <body>, so search the
    // document rather than screen.
    expect(document.querySelector('[role="dialog"]')).toBeInTheDocument();
  });

  it('opens the reset-all confirm dialog when "Auf Standard zurücksetzen" is clicked', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('theme-editor-reset-all'));
    expect(document.querySelector('.confirm-dialog')).toBeInTheDocument();
  });

  it('opens the delete confirm dialog when a library delete button is clicked', () => {
    mockHook.themes = [
      {
        id: 'demo',
        name: 'Demo',
        description: null,
        values: { ...THEME_DEFAULTS },
      },
    ];
    renderPage();
    fireEvent.click(screen.getByTestId('theme-editor-library-delete'));
    expect(document.querySelector('.confirm-dialog')).toBeInTheDocument();
  });

  it('calls activateEditor when Aktivieren is clicked', () => {
    mockHook.modifiedCount = 1;
    mockHook.isModified.mockReturnValue(true);
    renderPage();
    fireEvent.click(screen.getByTestId('theme-editor-activate'));
    expect(mockHook.activateEditor).toHaveBeenCalledTimes(1);
  });

  it('calls activateEditor with the linked saved-theme id when a saved theme is loaded', () => {
    mockHook.editorBase = { kind: 'saved', themeId: 'wald', name: 'Waldfrühling' };
    mockHook.modifiedCount = 2;
    mockHook.isModified.mockReturnValue(true);
    renderPage();
    fireEvent.click(screen.getByTestId('theme-editor-activate'));
    expect(mockHook.activateEditor).toHaveBeenCalledWith('wald');
  });

  it('calls activateEditor with null when no saved theme is loaded', () => {
    mockHook.modifiedCount = 1;
    mockHook.isModified.mockReturnValue(true);
    renderPage();
    fireEvent.click(screen.getByTestId('theme-editor-activate'));
    expect(mockHook.activateEditor).toHaveBeenCalledWith(null);
  });

  it('calls resetEditorToBase when Verwerfen is clicked', () => {
    mockHook.modifiedCount = 1;
    mockHook.isModified.mockReturnValue(true);
    renderPage();
    fireEvent.click(screen.getByTestId('theme-editor-discard'));
    expect(mockHook.resetEditorToBase).toHaveBeenCalledTimes(1);
  });

  it('calls saveLoadedTheme when Speichern is clicked (loaded saved theme is dirty)', () => {
    mockHook.editorBase = { kind: 'saved', themeId: 'wald', name: 'Waldfrühling' };
    mockHook.modifiedCount = 1;
    mockHook.isModified.mockReturnValue(true);
    renderPage();
    fireEvent.click(screen.getByTestId('theme-editor-save'));
    expect(mockHook.saveLoadedTheme).toHaveBeenCalledTimes(1);
  });

  it('calls loadIntoEditor when a library "Laden" button is clicked', () => {
    mockHook.themes = [
      {
        id: 'demo',
        name: 'Demo',
        description: null,
        values: { ...THEME_DEFAULTS },
      },
    ];
    renderPage();
    fireEvent.click(screen.getByTestId('theme-editor-library-load'));
    expect(mockHook.loadIntoEditor).toHaveBeenCalledWith('saved', 'demo');
  });

  it('calls activateSavedTheme when a library "Aktivieren" button is clicked', () => {
    mockHook.themes = [
      {
        id: 'demo',
        name: 'Demo',
        description: null,
        values: { ...THEME_DEFAULTS },
      },
    ];
    renderPage();
    fireEvent.click(screen.getByTestId('theme-editor-library-activate'));
    expect(mockHook.activateSavedTheme).toHaveBeenCalledWith('demo');
  });

  it('shows the live sandbox values mirror the editor values via inline style', () => {
    mockHook.settings = {
      ...THEME_DEFAULTS,
      '--accent-primary': '#c0ffee',
      '--bg-primary': '#abcdef',
    };
    renderPage();
    const sandbox = screen.getByTestId('theme-editor-sandbox');
    const style = (sandbox as HTMLElement).style;
    expect(style.getPropertyValue('--accent-primary')).toBe('#c0ffee');
    expect(style.getPropertyValue('--bg-primary')).toBe('#abcdef');
  });

  it('passes editor values to the sandbox once on mount and on every change', () => {
    const { rerender } = renderPage();
    expect(mockHook.broadcastEditorValues).toHaveBeenCalled();
    mockHook.broadcastEditorValues.mockClear();
    mockHook.settings = { ...THEME_DEFAULTS, '--accent-primary': '#fedcba' };
    rerender(
      <MemoryRouter initialEntries={['/admin/theme-editor']}>
        <ThemeEditorPage />
      </MemoryRouter>
    );
    expect(mockHook.broadcastEditorValues).toHaveBeenCalled();
  });
});
