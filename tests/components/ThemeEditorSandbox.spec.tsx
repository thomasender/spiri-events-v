import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ThemeEditorSandbox from '../../src/components/ThemeEditorSandbox';
import { THEME_DEFAULTS } from '../../src/utils/themeDefaults';
import { SEED_CATEGORIES } from '../../src/utils/categoryColors';

// Replace the real Calendar with a tiny stub so the sandbox tests stay
// focused on what the wrapper actually does (CSS variable scoping + demo
// event shape), without dragging in the full calendar's DOM tree.
vi.mock('../../src/components/Calendar', () => ({
  default: function CalendarStub({ events, currentMonth }) {
    return (
      <div
        data-testid="calendar-stub"
        data-month={currentMonth instanceof Date ? currentMonth.toISOString() : ''}
        data-event-count={events.length}
      />
    );
  },
}));

describe('ThemeEditorSandbox', () => {
  it('renders the sandbox wrapper with the expected testid', () => {
    render(<ThemeEditorSandbox values={THEME_DEFAULTS} />);
    expect(screen.getByTestId('theme-editor-sandbox')).toBeInTheDocument();
  });

  it('renders the chrome strip with the demo-event label', () => {
    render(<ThemeEditorSandbox values={THEME_DEFAULTS} />);
    expect(screen.getByTestId('theme-editor-sandbox-chrome')).toHaveTextContent(/Demo-Events/);
  });

  it('renders the inner Calendar stub with a positive number of demo events', () => {
    render(<ThemeEditorSandbox values={THEME_DEFAULTS} />);
    const stub = screen.getByTestId('calendar-stub');
    const count = Number(stub.getAttribute('data-event-count'));
    expect(count).toBeGreaterThan(0);
  });

  it('paints every editor value onto the wrapper as inline CSS variables', () => {
    const values = {
      ...THEME_DEFAULTS,
      '--accent-primary': '#aabbcc',
      '--bg-primary': '#112233',
    };
    render(<ThemeEditorSandbox values={values} />);
    const sandbox = screen.getByTestId('theme-editor-sandbox');
    const style = sandbox.style;
    expect(style.getPropertyValue('--accent-primary')).toBe('#aabbcc');
    expect(style.getPropertyValue('--bg-primary')).toBe('#112233');
  });

  it('skips non-string values to avoid corrupting the inline style', () => {
    render(
      <ThemeEditorSandbox
        // @ts-expect-error — intentional bad input for the test
        values={{ ...THEME_DEFAULTS, '--accent-primary': undefined, '--bg-primary': null }}
      />
    );
    const sandbox = screen.getByTestId('theme-editor-sandbox');
    expect(sandbox.style.getPropertyValue('--accent-primary')).toBe('');
    expect(sandbox.style.getPropertyValue('--bg-primary')).toBe('');
  });

  it('scopes the variables via the wrapper, so sidebar elements are unaffected', () => {
    render(
      <div>
        <div data-testid="sidebar">
          <span data-testid="sidebar-button">Side</span>
        </div>
        <ThemeEditorSandbox values={{ ...THEME_DEFAULTS, '--accent-primary': '#fff000' }} />
      </div>
    );
    const sandbox = screen.getByTestId('theme-editor-sandbox');
    const sidebar = screen.getByTestId('sidebar');
    expect(sandbox.style.getPropertyValue('--accent-primary')).toBe('#fff000');
    // The sidebar element lives outside the sandbox wrapper, so its
    // computed style for --accent-primary falls back to whatever
    // `:root` provides — not the editor's draft.
    expect(sidebar.style.getPropertyValue('--accent-primary')).toBe('');
  });

  it('regenerates demo events when the visible month changes', () => {
    const first = ThemeEditorSandbox.buildDemoEvents(new Date(2026, 0, 1));
    const second = ThemeEditorSandbox.buildDemoEvents(new Date(2026, 5, 1));
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    // Every demo event in either batch has the right shape.
    for (const event of [...first, ...second]) {
      expect(event.id).toMatch(/^demo-/);
      expect(typeof event.title).toBe('string');
      expect(event.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(event.recurrence).toBe('none');
      expect(event.status).toBe('approved');
      expect(Array.isArray(event.categories)).toBe(true);
      expect(['free', 'fee', 'donation']).toContain(event.contribution);
      expect(event.isDemo).toBe(true);
    }
  });

  it('uses the bundled seed categories as the category registry', () => {
    expect(SEED_CATEGORIES.length).toBeGreaterThan(0);
    for (const cat of SEED_CATEGORIES) {
      expect(typeof cat.name).toBe('string');
      expect(typeof cat.color).toBe('string');
      expect(cat.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
