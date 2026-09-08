import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeTab from '../../src/components/ThemeTab';
import { THEME_DEFAULTS, THEME_VARIABLES } from '../../src/utils/themeDefaults';

const mockTheme = vi.hoisted(() => ({
  // Seeded in beforeEach from the real THEME_DEFAULTS / THEME_VARIABLES
  // — can't reference those imports here because vi.hoisted runs before
  // module-level imports are resolved, so anything we read at this point
  // must be a literal value.
  settings: {} as Record<string, string>,
  groupedVariables: [] as Array<{ group: string; variables: typeof THEME_VARIABLES }>,
  loading: false,
  error: null,
  isAdmin: true,
  isModified: vi.fn(() => false),
  modifiedCount: 0,
  updateVariable: vi.fn(async () => {}),
  resetToDefault: vi.fn(async () => {}),
  resetAllToDefaults: vi.fn(async () => {}),
}));

vi.mock('../../src/hooks/useThemeSettings', () => ({
  useThemeSettings: () => mockTheme,
}));

function setupGroupedVariables() {
  const groups = new Map<string, typeof THEME_VARIABLES>();
  for (const variable of THEME_VARIABLES) {
    if (!groups.has(variable.group)) groups.set(variable.group, []);
    groups.get(variable.group)!.push(variable);
  }
  mockTheme.groupedVariables = Array.from(groups.entries()).map(([group, variables]) => ({
    group,
    variables,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTheme.settings = { ...THEME_DEFAULTS };
  mockTheme.loading = false;
  mockTheme.error = null;
  mockTheme.isAdmin = true;
  mockTheme.isModified.mockReturnValue(false);
  mockTheme.modifiedCount = 0;
  setupGroupedVariables();
});

describe('ThemeTab', () => {
  it('shows a loading spinner while the theme is loading', () => {
    mockTheme.loading = true;
    render(<ThemeTab />);
    expect(screen.getByTestId('theme-tab-loading')).toBeInTheDocument();
  });

  it('shows an error message when the theme fails to load', () => {
    mockTheme.error = 'Firestore weg';
    render(<ThemeTab />);
    expect(screen.getByTestId('theme-tab-error')).toHaveTextContent('Firestore weg');
  });

  it('renders every group and every variable by default', () => {
    render(<ThemeTab />);
    const groups = screen.getAllByTestId('theme-tab-group');
    expect(groups.length).toBe(mockTheme.groupedVariables.length);
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
    mockTheme.isAdmin = false;
    render(<ThemeTab />);
    expect(screen.getByTestId('theme-tab-readonly')).toBeInTheDocument();
    // No ColorPicker when not admin — instead a static hex value.
    const readonlyValue = screen.getAllByTestId('theme-row-readonly-value');
    expect(readonlyValue.length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('color-picker-native').length).toBe(0);
  });

  it('calls updateVariable when the color picker changes a value', () => {
    render(<ThemeTab />);
    const hexInputs = screen.getAllByTestId('color-picker-hex');
    // First variable is --bg-primary (per THEME_VARIABLES order).
    fireEvent.change(hexInputs[0], { target: { value: '#abcdef' } });
    expect(mockTheme.updateVariable).toHaveBeenCalledWith('--bg-primary', '#abcdef');
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
    mockTheme.isModified.mockReturnValue(false);
    render(<ThemeTab />);
    const resetButtons = screen.getAllByTestId('theme-row-reset');
    expect(resetButtons[0]).toBeDisabled();
  });

  it('calls resetToDefault when a per-row reset button is clicked', () => {
    mockTheme.isModified.mockImplementation((name: string) => name === '--accent-primary');
    render(<ThemeTab />);
    const row = screen
      .getAllByTestId('theme-row')
      .find((el) => el.getAttribute('data-variable-name') === '--accent-primary');
    const resetBtn = row!.querySelector('[data-testid="theme-row-reset"]') as HTMLElement;
    fireEvent.click(resetBtn);
    expect(mockTheme.resetToDefault).toHaveBeenCalledWith('--accent-primary');
  });

  it('disables the global "Reset all" button when nothing is modified', () => {
    mockTheme.modifiedCount = 0;
    render(<ThemeTab />);
    expect(screen.getByTestId('theme-tab-reset-all')).toBeDisabled();
  });

  it('shows a modified-count badge and a confirm dialog when "Reset all" is clicked', () => {
    mockTheme.modifiedCount = 3;
    render(<ThemeTab />);
    expect(screen.getByTestId('theme-tab-modified-count').textContent).toContain('3 Variablen');
    fireEvent.click(screen.getByTestId('theme-tab-reset-all'));
    expect(screen.getByText(/Alle Theme-Variablen zurücksetzen/)).toBeInTheDocument();
  });

  it('calls resetAllToDefaults when the confirm dialog is confirmed', () => {
    mockTheme.modifiedCount = 2;
    render(<ThemeTab />);
    fireEvent.click(screen.getByTestId('theme-tab-reset-all'));
    // ConfirmDialog renders the confirm button with the confirmLabel.
    const confirmButton = screen.getByRole('button', { name: 'Zurücksetzen' });
    fireEvent.click(confirmButton);
    expect(mockTheme.resetAllToDefaults).toHaveBeenCalled();
  });

  it('shows an inline error when updateVariable rejects', async () => {
    mockTheme.updateVariable.mockRejectedValueOnce(new Error('Boom'));
    render(<ThemeTab />);
    const hexInputs = screen.getAllByTestId('color-picker-hex');
    fireEvent.change(hexInputs[0], { target: { value: '#abcdef' } });
    // Wait for the rejected promise to resolve.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId('theme-tab-form-error')).toHaveTextContent('Boom');
  });
});
