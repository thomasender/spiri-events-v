import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EmailVerificationModal from '../../src/components/EmailVerificationModal';

const mocks = vi.hoisted(() => ({
  resendVerificationEmail: vi.fn(),
  refreshEmailVerified: vi.fn(),
}));

const mockAuth = vi.hoisted(() => ({
  user: null as { uid: string; email: string; emailVerified: boolean } | null,
  resendVerificationEmail: mocks.resendVerificationEmail,
  refreshEmailVerified: mocks.refreshEmailVerified,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
  authErrorMessage: (err: { code?: string } | null | undefined) => {
    if (!err) return 'Ein Fehler ist aufgetreten.';
    if (err.code === 'auth/too-many-requests') return 'Zu viele Anfragen.';
    return 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.';
  },
}));

function renderModal(props: { open?: boolean; onClose?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  return render(
    <MemoryRouter>
      <EmailVerificationModal open={props.open ?? true} onClose={onClose} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.resendVerificationEmail.mockReset();
  mocks.refreshEmailVerified.mockReset();
  mockAuth.user = {
    uid: 'uid-123',
    email: 'unverified@test.local',
    emailVerified: false,
  };
});

describe('EmailVerificationModal', () => {
  it('does not render anything when open is false', () => {
    renderModal({ open: false });
    expect(screen.queryByTestId('email-verification-modal')).not.toBeInTheDocument();
  });

  it('renders the modal with the user email and action buttons when open', () => {
    renderModal();

    expect(screen.getByTestId('email-verification-modal')).toBeInTheDocument();
    expect(screen.getByTestId('email-verification-modal-email')).toHaveTextContent(
      'unverified@test.local'
    );
    expect(screen.getByTestId('email-verification-modal-resend')).toBeInTheDocument();
    expect(screen.getByTestId('email-verification-modal-refresh')).toBeInTheDocument();
    expect(screen.getByTestId('email-verification-modal-profile')).toBeInTheDocument();
  });

  it('does not render when the user is already verified', () => {
    mockAuth.user = { uid: 'uid-123', email: 'verified@test.local', emailVerified: true };
    renderModal();
    expect(screen.queryByTestId('email-verification-modal')).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByRole('button', { name: /schließen/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when clicking the overlay backdrop', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByTestId('email-verification-modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the modal content', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByTestId('email-verification-modal'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when the Escape key is pressed', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('triggers resendVerificationEmail and shows success feedback', async () => {
    mocks.resendVerificationEmail.mockResolvedValueOnce(undefined);
    renderModal();

    fireEvent.click(screen.getByTestId('email-verification-modal-resend'));

    await waitFor(() => {
      expect(mocks.resendVerificationEmail).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('email-verification-modal-feedback')).toHaveTextContent(
      'Verifizierungs-E-Mail wurde erneut gesendet.'
    );
  });

  it('shows an error feedback when resend fails', async () => {
    mocks.resendVerificationEmail.mockRejectedValueOnce({ code: 'auth/too-many-requests' });
    renderModal();

    fireEvent.click(screen.getByTestId('email-verification-modal-resend'));

    await waitFor(() => {
      expect(screen.getByTestId('email-verification-modal-feedback')).toHaveTextContent(
        'Zu viele Anfragen.'
      );
    });
  });

  it('triggers refreshEmailVerified when the check-again button is clicked', async () => {
    mocks.refreshEmailVerified.mockResolvedValueOnce(undefined);
    renderModal();

    fireEvent.click(screen.getByTestId('email-verification-modal-refresh'));

    await waitFor(() => {
      expect(mocks.refreshEmailVerified).toHaveBeenCalledTimes(1);
    });
  });

  it('locks the close button while a request is in flight', async () => {
    let resolveResend: () => void = () => {};
    mocks.resendVerificationEmail.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveResend = resolve;
      })
    );
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByTestId('email-verification-modal-resend'));

    await waitFor(() => {
      expect(mocks.resendVerificationEmail).toHaveBeenCalled();
    });

    const closeBtn = screen.getByRole('button', { name: /schließen/i });
    expect(closeBtn).toBeDisabled();
    fireEvent.click(closeBtn);
    expect(onClose).not.toHaveBeenCalled();

    resolveResend();
  });
});
