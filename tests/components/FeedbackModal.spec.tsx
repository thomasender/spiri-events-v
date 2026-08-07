import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FeedbackModal from '../../src/components/FeedbackModal';

const submitFeedbackMock = vi.fn();
const resetMock = vi.fn();

vi.mock('../../src/hooks/useFeedback', () => ({
  useFeedback: vi.fn(),
  validateFeedback: (payload) => {
    const errors = {};
    if (!(payload.description || '').trim()) errors.description = 'Bitte beschreibe dein Anliegen.';
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

describe('FeedbackModal', () => {
  it('does not render when open is false', () => {
    render(<FeedbackModal open={false} onClose={() => {}} />);
    expect(screen.queryByTestId('feedback-modal')).not.toBeInTheDocument();
  });

  it('renders the modal with all form fields when open is true', () => {
    render(
      <FeedbackModal
        open
        onClose={() => {}}
        pageUrl="https://example.com/page"
        pageTitle="My Page"
      />
    );
    expect(screen.getByTestId('feedback-modal')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-description')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-name')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-email')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-submit')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-cancel')).toBeInTheDocument();
  });

  it('shows the page context when pageUrl is provided', () => {
    render(<FeedbackModal open onClose={() => {}} pageUrl="https://example.com/page" />);
    expect(screen.getByTestId('feedback-page-context')).toHaveTextContent(
      'https://example.com/page'
    );
  });

  it('does not show page context when pageUrl is missing', () => {
    render(<FeedbackModal open onClose={() => {}} />);
    expect(screen.queryByTestId('feedback-page-context')).not.toBeInTheDocument();
  });

  it('shows a validation error when description is empty and form is submitted', async () => {
    render(<FeedbackModal open onClose={() => {}} />);

    fireEvent.click(screen.getByTestId('feedback-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('feedback-description-error')).toBeInTheDocument();
    });
    expect(submitFeedbackMock).not.toHaveBeenCalled();
  });

  it('shows a validation error for an invalid email', async () => {
    render(<FeedbackModal open onClose={() => {}} />);

    fireEvent.change(screen.getByTestId('feedback-description'), {
      target: { value: 'Mein Feedback' },
    });
    fireEvent.change(screen.getByTestId('feedback-email'), {
      target: { value: 'kein-email' },
    });
    fireEvent.click(screen.getByTestId('feedback-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('feedback-email-error')).toBeInTheDocument();
    });
    expect(submitFeedbackMock).not.toHaveBeenCalled();
  });

  it('submits the feedback with the form values and page context', async () => {
    submitFeedbackMock.mockResolvedValue({ id: 'fb-1' });
    const onClose = vi.fn();
    render(
      <FeedbackModal open onClose={onClose} pageUrl="https://example.com/page" pageTitle="Page" />
    );

    fireEvent.change(screen.getByTestId('feedback-description'), {
      target: { value: 'Wunderschöne Plattform!' },
    });
    fireEvent.change(screen.getByTestId('feedback-name'), {
      target: { value: 'Peter' },
    });
    fireEvent.change(screen.getByTestId('feedback-email'), {
      target: { value: 'peter@example.com' },
    });
    fireEvent.click(screen.getByTestId('feedback-submit'));

    await waitFor(() => {
      expect(submitFeedbackMock).toHaveBeenCalled();
    });

    const payload = submitFeedbackMock.mock.calls[0][0];
    expect(payload.description).toBe('Wunderschöne Plattform!');
    expect(payload.name).toBe('Peter');
    expect(payload.email).toBe('peter@example.com');
    expect(payload.pageUrl).toBe('https://example.com/page');
    expect(payload.pageTitle).toBe('Page');
  });

  it('submits empty name and email when omitted (anonymous submission)', async () => {
    submitFeedbackMock.mockResolvedValue({ id: 'fb-1' });
    render(<FeedbackModal open onClose={() => {}} />);

    fireEvent.change(screen.getByTestId('feedback-description'), {
      target: { value: 'Anonymes Feedback' },
    });
    fireEvent.click(screen.getByTestId('feedback-submit'));

    await waitFor(() => {
      expect(submitFeedbackMock).toHaveBeenCalled();
    });

    const payload = submitFeedbackMock.mock.calls[0][0];
    expect(payload.name).toBe('');
    expect(payload.email).toBe('');
  });

  it('shows a success screen after successful submission', async () => {
    submitFeedbackMock.mockResolvedValue({ id: 'fb-1' });
    render(<FeedbackModal open onClose={() => {}} />);

    fireEvent.change(screen.getByTestId('feedback-description'), {
      target: { value: 'Danke!' },
    });
    fireEvent.click(screen.getByTestId('feedback-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('feedback-success')).toBeInTheDocument();
    });
  });

  it('renders a character counter for description', () => {
    render(<FeedbackModal open onClose={() => {}} />);
    expect(screen.getByText(`0 / 1000`)).toBeInTheDocument();
  });

  it('closes the modal when the cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<FeedbackModal open onClose={onClose} />);

    fireEvent.click(screen.getByTestId('feedback-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes the modal when clicking the close (X) button', () => {
    const onClose = vi.fn();
    render(<FeedbackModal open onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('Schließen'));
    expect(onClose).toHaveBeenCalled();
  });

  it('resets local form state when reopened', () => {
    const { rerender } = render(<FeedbackModal open onClose={() => {}} />);

    fireEvent.change(screen.getByTestId('feedback-description'), {
      target: { value: 'Some text' },
    });

    rerender(<FeedbackModal open={false} onClose={() => {}} />);
    rerender(<FeedbackModal open onClose={() => {}} />);

    expect(screen.getByTestId('feedback-description')).toHaveValue('');
  });

  it('shows a generic error message when submitFeedback fails', async () => {
    useFeedback.mockReturnValue({
      submitting: false,
      uploadProgress: 0,
      error: 'Feedback konnte nicht gesendet werden. Bitte versuche es erneut.',
      submitFeedback: submitFeedbackMock.mockRejectedValue(new Error('boom')),
      reset: resetMock,
    });

    render(<FeedbackModal open onClose={() => {}} />);
    expect(screen.getByTestId('feedback-error')).toHaveTextContent(
      /Feedback konnte nicht gesendet werden/
    );
  });
});
