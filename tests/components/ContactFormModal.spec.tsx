import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContactFormModal from '../../src/components/ContactFormModal';

const submitFeedbackMock = vi.fn();
const resetMock = vi.fn();

vi.mock('../../src/hooks/useFeedback', () => ({
  useFeedback: vi.fn(),
  validateFeedback: (payload) => {
    const errors = {};
    const trimmed = (payload.description || '').trim();
    if (!trimmed) errors.description = 'Bitte beschreibe dein Anliegen.';
    if ((payload.email || '').trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
      errors.email = 'Bitte gib eine gültige E-Mail-Adresse an.';
    }
    return errors;
  },
  MAX_FEEDBACK_DESCRIPTION_LENGTH: 1000,
  MAX_FEEDBACK_NAME_LENGTH: 80,
  MAX_FEEDBACK_EMAIL_LENGTH: 120,
}));

import { useFeedback } from '../../src/hooks/useFeedback';

beforeEach(() => {
  submitFeedbackMock.mockReset();
  resetMock.mockReset();
  useFeedback.mockReturnValue({
    submitting: false,
    uploadProgress: 0,
    error: '',
    submitFeedback: submitFeedbackMock,
    reset: resetMock,
  });
});

describe('ContactFormModal', () => {
  it('does not render when open is false', () => {
    render(
      <ContactFormModal open={false} onClose={() => {}} defaultSubject="Hallo Tribe Vorarlberg" />
    );
    expect(screen.queryByTestId('contact-modal')).not.toBeInTheDocument();
  });

  it('renders the modal with all required fields when open', () => {
    render(
      <ContactFormModal
        open
        onClose={() => {}}
        defaultSubject="Hallo Tribe Vorarlberg"
        recipientEmail="admin@thetribe.at"
        pageUrl="/ueber-uns"
      />
    );
    expect(screen.getByTestId('contact-modal')).toBeInTheDocument();
    expect(screen.getByTestId('contact-name')).toBeInTheDocument();
    expect(screen.getByTestId('contact-email')).toBeInTheDocument();
    expect(screen.getByTestId('contact-subject')).toBeInTheDocument();
    expect(screen.getByTestId('contact-message')).toBeInTheDocument();
    expect(screen.getByTestId('contact-submit')).toBeInTheDocument();
    expect(screen.getByTestId('contact-cancel')).toBeInTheDocument();
  });

  it('prefills the subject with the provided default', () => {
    render(
      <ContactFormModal
        open
        onClose={() => {}}
        defaultSubject="Hallo Tribe Vorarlberg"
        recipientEmail="admin@thetribe.at"
      />
    );
    expect(screen.getByTestId('contact-subject')).toHaveValue('Hallo Tribe Vorarlberg');
  });

  it('shows a mailto fallback in the footer when recipientEmail is provided', () => {
    render(
      <ContactFormModal
        open
        onClose={() => {}}
        defaultSubject="Hallo Tribe Vorarlberg"
        recipientEmail="admin@thetribe.at"
      />
    );
    const link = screen.getByRole('link', { name: /admin@thetribe\.at/i });
    expect(link).toHaveAttribute('href', 'mailto:admin@thetribe.at');
  });

  it('blocks submission and shows errors when name, email, subject and message are empty', async () => {
    render(<ContactFormModal open onClose={() => {}} defaultSubject="" />);

    fireEvent.click(screen.getByTestId('contact-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('contact-name-error')).toBeInTheDocument();
      expect(screen.getByTestId('contact-email-error')).toBeInTheDocument();
      expect(screen.getByTestId('contact-subject-error')).toBeInTheDocument();
      expect(screen.getByTestId('contact-message-error')).toBeInTheDocument();
    });
    expect(submitFeedbackMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed email address', async () => {
    render(<ContactFormModal open onClose={() => {}} defaultSubject="Hallo Tribe Vorarlberg" />);

    fireEvent.change(screen.getByTestId('contact-name'), { target: { value: 'Peter' } });
    fireEvent.change(screen.getByTestId('contact-email'), { target: { value: 'kein-email' } });
    fireEvent.change(screen.getByTestId('contact-message'), {
      target: { value: 'Hallo zusammen' },
    });
    fireEvent.click(screen.getByTestId('contact-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('contact-email-error')).toBeInTheDocument();
    });
    expect(submitFeedbackMock).not.toHaveBeenCalled();
  });

  it('submits the contact form with subject prepended to the message', async () => {
    submitFeedbackMock.mockResolvedValue({ id: 'fb-1' });
    const onClose = vi.fn();
    render(
      <ContactFormModal
        open
        onClose={onClose}
        defaultSubject="Hallo Tribe Vorarlberg"
        recipientEmail="admin@thetribe.at"
        pageUrl="/ueber-uns"
      />
    );

    fireEvent.change(screen.getByTestId('contact-name'), { target: { value: 'Peter' } });
    fireEvent.change(screen.getByTestId('contact-email'), {
      target: { value: 'peter@example.com' },
    });
    fireEvent.change(screen.getByTestId('contact-subject'), {
      target: { value: 'Eigener Betreff' },
    });
    fireEvent.change(screen.getByTestId('contact-message'), {
      target: { value: 'Ich hätte gerne mehr Info.' },
    });
    fireEvent.click(screen.getByTestId('contact-submit'));

    await waitFor(() => {
      expect(submitFeedbackMock).toHaveBeenCalled();
    });

    const payload = submitFeedbackMock.mock.calls[0][0];
    expect(payload.description).toBe('Betreff: Eigener Betreff\n\nIch hätte gerne mehr Info.');
    expect(payload.name).toBe('Peter');
    expect(payload.email).toBe('peter@example.com');
    expect(payload.pageUrl).toBe('/ueber-uns');
  });

  it('rejects a whitespace-only subject', async () => {
    render(<ContactFormModal open onClose={() => {}} defaultSubject="" recipientEmail="admin@…" />);

    fireEvent.change(screen.getByTestId('contact-name'), { target: { value: 'Peter' } });
    fireEvent.change(screen.getByTestId('contact-email'), {
      target: { value: 'peter@example.com' },
    });
    fireEvent.change(screen.getByTestId('contact-subject'), { target: { value: '   ' } });
    fireEvent.change(screen.getByTestId('contact-message'), {
      target: { value: 'Hallo zusammen' },
    });
    fireEvent.click(screen.getByTestId('contact-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('contact-subject-error')).toBeInTheDocument();
    });
    expect(submitFeedbackMock).not.toHaveBeenCalled();
  });

  it('shows the success screen after a successful submission', async () => {
    submitFeedbackMock.mockResolvedValue({ id: 'fb-1' });
    render(<ContactFormModal open onClose={() => {}} defaultSubject="Hallo Tribe Vorarlberg" />);

    fireEvent.change(screen.getByTestId('contact-name'), { target: { value: 'Peter' } });
    fireEvent.change(screen.getByTestId('contact-email'), {
      target: { value: 'peter@example.com' },
    });
    fireEvent.change(screen.getByTestId('contact-message'), {
      target: { value: 'Hallo zusammen' },
    });
    fireEvent.click(screen.getByTestId('contact-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('contact-success')).toBeInTheDocument();
    });
  });

  it('renders a character counter for the message field', () => {
    render(<ContactFormModal open onClose={() => {}} defaultSubject="Hallo Tribe Vorarlberg" />);
    expect(screen.getByText('0 / 1000')).toBeInTheDocument();
  });

  it('closes the modal when the cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<ContactFormModal open onClose={onClose} defaultSubject="Hallo Tribe Vorarlberg" />);

    fireEvent.click(screen.getByTestId('contact-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes the modal when the close (X) button is clicked', () => {
    const onClose = vi.fn();
    render(<ContactFormModal open onClose={onClose} defaultSubject="Hallo Tribe Vorarlberg" />);

    fireEvent.click(screen.getByLabelText('Schließen'));
    expect(onClose).toHaveBeenCalled();
  });

  it('resets the form when reopened', () => {
    const { rerender } = render(
      <ContactFormModal open onClose={() => {}} defaultSubject="Hallo Tribe Vorarlberg" />
    );

    fireEvent.change(screen.getByTestId('contact-name'), { target: { value: 'Peter' } });
    fireEvent.change(screen.getByTestId('contact-message'), {
      target: { value: 'Dirty state' },
    });

    rerender(
      <ContactFormModal open={false} onClose={() => {}} defaultSubject="Hallo Tribe Vorarlberg" />
    );
    rerender(<ContactFormModal open onClose={() => {}} defaultSubject="Hallo Tribe Vorarlberg" />);

    expect(screen.getByTestId('contact-name')).toHaveValue('');
    expect(screen.getByTestId('contact-message')).toHaveValue('');
    expect(screen.getByTestId('contact-subject')).toHaveValue('Hallo Tribe Vorarlberg');
  });

  it('shows a generic error message when submitFeedback fails', () => {
    useFeedback.mockReturnValue({
      submitting: false,
      uploadProgress: 0,
      error: 'Nachricht konnte nicht gesendet werden. Bitte versuche es erneut.',
      submitFeedback: submitFeedbackMock.mockRejectedValue(new Error('boom')),
      reset: resetMock,
    });

    render(<ContactFormModal open onClose={() => {}} defaultSubject="Hallo Tribe Vorarlberg" />);
    expect(screen.getByTestId('contact-error')).toHaveTextContent(
      /Nachricht konnte nicht gesendet werden/
    );
  });
});
