import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SaveThemeDialog from '../../src/components/SaveThemeDialog';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SaveThemeDialog', () => {
  it('does not render when closed', () => {
    render(<SaveThemeDialog open={false} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('save-theme-dialog')).toBeNull();
  });

  it('pre-fills the name from the defaultName prop', () => {
    render(<SaveThemeDialog open defaultName="Wald (Kopie)" onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('save-theme-name')).toHaveValue('Wald (Kopie)');
  });

  it('disables the submit button when the name is empty', () => {
    render(<SaveThemeDialog open defaultName="" onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('save-theme-confirm')).toBeDisabled();
  });

  it('submits with the trimmed name and description', async () => {
    const onSave = vi.fn(async () => 'new-id');
    render(<SaveThemeDialog open onSave={onSave} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('save-theme-name'), {
      target: { value: '   Sommerregen   ' },
    });
    fireEvent.change(screen.getByTestId('save-theme-description'), {
      target: { value: '  Kurze Notiz  ' },
    });
    fireEvent.click(screen.getByTestId('save-theme-confirm'));
    expect(onSave).toHaveBeenCalledWith({ name: 'Sommerregen', description: 'Kurze Notiz' });
  });

  it('shows an inline error if onSave rejects', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('Name zu kurz');
    });
    render(<SaveThemeDialog open onSave={onSave} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('save-theme-name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('save-theme-confirm'));
    expect(await screen.findByTestId('save-theme-error')).toHaveTextContent('Name zu kurz');
  });

  it('invokes onClose when the cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<SaveThemeDialog open onSave={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('save-theme-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('invokes onClose when the X button is clicked', () => {
    const onClose = vi.fn();
    render(<SaveThemeDialog open onSave={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('save-theme-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close via backdrop while saving', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <SaveThemeDialog open loading onSave={vi.fn()} onClose={onClose} />
    );
    fireEvent.click(screen.getByTestId('save-theme-overlay'));
    expect(onClose).not.toHaveBeenCalled();
    rerender(<SaveThemeDialog open={false} loading onSave={vi.fn()} onClose={onClose} />);
  });
});
