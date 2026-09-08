import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeTokenInfoDialog from '../../src/components/ThemeTokenInfoDialog';

const sampleToken = {
  name: '--accent-primary',
  label: 'Akzent Primär (Terracotta)',
  group: 'Brand',
  defaultValue: '#c48e6a',
  currentValue: '#abcdef',
  usedIn: ['Buttons', 'Links', 'Input-Focus-Border'],
};

describe('ThemeTokenInfoDialog', () => {
  it('renders nothing when no token is provided', () => {
    const { container } = render(<ThemeTokenInfoDialog token={null} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the variable name, default, current value, and usage list', () => {
    render(<ThemeTokenInfoDialog token={sampleToken} onClose={() => {}} />);
    expect(screen.getByTestId('theme-info-name')).toHaveTextContent('--accent-primary');
    expect(screen.getByTestId('theme-info-default')).toHaveTextContent('#c48e6a');
    expect(screen.getByTestId('theme-info-current')).toHaveTextContent('#abcdef');

    const list = screen.getByTestId('theme-info-usage-list');
    expect(list.querySelectorAll('li').length).toBe(sampleToken.usedIn.length);
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<ThemeTokenInfoDialog token={sampleToken} onClose={onClose} />);
    // Click the overlay (the backdrop). The dialog has stopPropagation
    // so clicking inside the dialog must NOT close.
    fireEvent.click(screen.getByTestId('theme-info-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when the dialog itself is clicked', () => {
    const onClose = vi.fn();
    render(<ThemeTokenInfoDialog token={sampleToken} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('theme-info-dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<ThemeTokenInfoDialog token={sampleToken} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('theme-info-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<ThemeTokenInfoDialog token={sampleToken} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the unused notice for unused tokens instead of the usage list', () => {
    render(
      <ThemeTokenInfoDialog
        token={{ ...sampleToken, name: '--sound-healing', unused: true }}
        onClose={() => {}}
      />
    );
    expect(screen.queryByTestId('theme-info-usage-list')).toBeNull();
    // The unused notice is split across the inline `<code>var(...)</code>`
    // element, so we match against the dialog's container text content.
    const dialog = screen.getByTestId('theme-info-dialog');
    expect(dialog.textContent).toMatch(/aktuell nirgendwo im Code/i);
  });
});
