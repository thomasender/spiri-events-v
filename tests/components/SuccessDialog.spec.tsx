import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SuccessDialog from '../../src/components/SuccessDialog';

describe('SuccessDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <SuccessDialog
        isOpen={false}
        title="Vielen Dank!"
        message="Event eingereicht."
        onConfirm={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the title, message and confirm button when open', () => {
    render(
      <SuccessDialog
        isOpen
        title="Vielen Dank!"
        message="Dein Event wurde erfolgreich eingereicht."
        details="Wartezeit bis zu 24 Stunden."
        confirmLabel="Zur Verwaltung"
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vielen Dank!' })).toBeInTheDocument();
    expect(screen.getByText('Dein Event wurde erfolgreich eingereicht.')).toBeInTheDocument();
    expect(screen.getByText('Wartezeit bis zu 24 Stunden.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zur Verwaltung' })).toBeInTheDocument();
  });

  it('calls onConfirm when the primary button is clicked', () => {
    const onConfirm = vi.fn();

    render(<SuccessDialog isOpen title="Vielen Dank!" message="X" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Verstanden' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not render the CTA block when no cta prop is passed', () => {
    render(<SuccessDialog isOpen title="Vielen Dank!" message="X" onConfirm={vi.fn()} />);
    expect(screen.queryByTestId('success-dialog-cta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('success-dialog-cta-button')).not.toBeInTheDocument();
  });

  it('renders the CTA block with text and button when cta is provided', () => {
    render(
      <SuccessDialog
        isOpen
        title="Vielen Dank!"
        message="X"
        cta={{
          text: 'Lege jetzt dein Profil an, damit andere dich finden können.',
          label: 'Profil ausfüllen',
          onClick: vi.fn(),
        }}
        onConfirm={vi.fn()}
      />
    );

    const cta = screen.getByTestId('success-dialog-cta');
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveTextContent('Lege jetzt dein Profil an, damit andere dich finden können.');
    expect(screen.getByTestId('success-dialog-cta-button')).toHaveTextContent('Profil ausfüllen');
  });

  it('calls cta.onClick when the CTA button is clicked and does not invoke onConfirm', () => {
    const onConfirm = vi.fn();
    const onCtaClick = vi.fn();

    render(
      <SuccessDialog
        isOpen
        title="Vielen Dank!"
        message="X"
        cta={{
          text: 'Lege jetzt dein Profil an.',
          label: 'Profil ausfüllen',
          onClick: onCtaClick,
        }}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByTestId('success-dialog-cta-button'));
    expect(onCtaClick).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes when Escape is pressed', () => {
    const onConfirm = vi.fn();

    render(<SuccessDialog isOpen title="Vielen Dank!" message="X" onConfirm={onConfirm} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
