import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ChangeEmailForm from '../../src/components/ChangeEmailForm';
import DeleteAccountSection from '../../src/components/DeleteAccountSection';

describe('ChangeEmailForm', () => {
  it('shows the current email address', () => {
    render(<ChangeEmailForm currentEmail="alice@example.com" onChangeEmail={vi.fn()} />);

    expect(screen.getByTestId('current-email')).toHaveTextContent('alice@example.com');
  });

  it('rejects an invalid new email', async () => {
    const onChangeEmail = vi.fn();
    render(<ChangeEmailForm currentEmail="alice@example.com" onChangeEmail={onChangeEmail} />);

    fireEvent.change(screen.getByTestId('change-email-new'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.change(screen.getByTestId('change-email-password'), {
      target: { value: 'secret123' },
    });
    fireEvent.submit(screen.getByTestId('change-email-form'));

    await waitFor(() => {
      expect(screen.getByTestId('change-email-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('change-email-error').textContent).toMatch(/E-Mail-Adresse/i);
    expect(onChangeEmail).not.toHaveBeenCalled();
  });

  it('rejects a new email identical to the current one', async () => {
    const onChangeEmail = vi.fn();
    render(<ChangeEmailForm currentEmail="alice@example.com" onChangeEmail={onChangeEmail} />);

    fireEvent.change(screen.getByTestId('change-email-new'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByTestId('change-email-password'), {
      target: { value: 'secret123' },
    });
    fireEvent.submit(screen.getByTestId('change-email-form'));

    await waitFor(() => {
      expect(screen.getByTestId('change-email-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('change-email-error').textContent).toMatch(/identisch/i);
    expect(onChangeEmail).not.toHaveBeenCalled();
  });

  it('requires a password', async () => {
    const onChangeEmail = vi.fn();
    render(<ChangeEmailForm currentEmail="alice@example.com" onChangeEmail={onChangeEmail} />);

    fireEvent.change(screen.getByTestId('change-email-new'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.submit(screen.getByTestId('change-email-form'));

    await waitFor(() => {
      expect(screen.getByTestId('change-email-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('change-email-error').textContent).toMatch(/Passwort/i);
    expect(onChangeEmail).not.toHaveBeenCalled();
  });

  it('calls onChangeEmail with the trimmed new email and password', async () => {
    const onChangeEmail = vi.fn().mockResolvedValue(undefined);
    render(<ChangeEmailForm currentEmail="alice@example.com" onChangeEmail={onChangeEmail} />);

    fireEvent.change(screen.getByTestId('change-email-new'), {
      target: { value: '  new@example.com  ' },
    });
    fireEvent.change(screen.getByTestId('change-email-password'), {
      target: { value: 'secret123' },
    });
    fireEvent.submit(screen.getByTestId('change-email-form'));

    await waitFor(() => expect(onChangeEmail).toHaveBeenCalled());
    expect(onChangeEmail).toHaveBeenCalledWith('new@example.com', 'secret123');
  });

  it('shows a friendly error from a wrong-password failure', async () => {
    const onChangeEmail = vi.fn().mockRejectedValue({ code: 'auth/wrong-password' });
    render(<ChangeEmailForm currentEmail="alice@example.com" onChangeEmail={onChangeEmail} />);

    fireEvent.change(screen.getByTestId('change-email-new'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByTestId('change-email-password'), {
      target: { value: 'wrong' },
    });
    fireEvent.submit(screen.getByTestId('change-email-form'));

    await waitFor(() => {
      expect(screen.getByTestId('change-email-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('change-email-error').textContent).toMatch(/Passwort ist falsch/i);
  });
});

describe('DeleteAccountSection', () => {
  it('requires a password before submitting', async () => {
    const onDelete = vi.fn();
    render(
      <MemoryRouter>
        <DeleteAccountSection onDelete={onDelete} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('delete-account-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('delete-account-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('delete-account-error').textContent).toMatch(/Passwort/i);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('opens the confirmation dialog when password is present', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <DeleteAccountSection onDelete={onDelete} />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('delete-account-password'), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByTestId('delete-account-trigger'));

    await waitFor(() => {
      expect(screen.getByText(/Konto wirklich löschen/i)).toBeInTheDocument();
    });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('calls onDelete when the user confirms in the modal', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <DeleteAccountSection onDelete={onDelete} />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('delete-account-password'), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByTestId('delete-account-trigger'));

    await waitFor(() => {
      expect(screen.getByText(/Konto wirklich löschen/i)).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /endgültig löschen/i });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('secret123'));
  });

  it('surfaces a friendly error if delete fails', async () => {
    const onDelete = vi.fn().mockRejectedValue({ code: 'auth/wrong-password' });
    render(
      <MemoryRouter>
        <DeleteAccountSection onDelete={onDelete} />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('delete-account-password'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByTestId('delete-account-trigger'));

    await waitFor(() => {
      expect(screen.getByText(/Konto wirklich löschen/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /endgültig löschen/i }));

    await waitFor(() => {
      expect(screen.getByTestId('delete-account-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('delete-account-error').textContent).toMatch(/Passwort ist falsch/i);
  });
});
