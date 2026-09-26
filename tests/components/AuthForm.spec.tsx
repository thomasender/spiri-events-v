import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuthForm from '../../src/components/AuthForm';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  loginWithGoogle: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    login: mocks.login,
    register: mocks.register,
    loginWithGoogle: mocks.loginWithGoogle,
    resetPassword: mocks.resetPassword,
  }),
  authErrorMessage: (err: { code?: string } | null | undefined) => {
    if (!err) return 'Ein Fehler ist aufgetreten.';
    if (err.code === 'auth/popup-closed-by-user') return 'Anmeldung abgebrochen.';
    if (err.code === 'auth/popup-blocked') return 'Popup blockiert.';
    if (err.code === 'auth/unauthorized-domain') return 'Domain nicht freigegeben.';
    if (err.code === 'auth/operation-not-allowed') return 'Google-Anmeldung nicht verfügbar.';
    return 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.';
  },
  MIN_PASSWORD_LENGTH: 8,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

function renderForm() {
  return render(
    <MemoryRouter>
      <AuthForm />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.login.mockReset();
  mocks.register.mockReset();
  mocks.loginWithGoogle.mockReset();
  mocks.resetPassword.mockReset();
});

describe('AuthForm Google sign-in', () => {
  it('renders a "Mit Google anmelden" button on the login tab', () => {
    renderForm();

    const googleBtn = screen.getByTestId('auth-google-signin');
    expect(googleBtn).toBeInTheDocument();
    expect(googleBtn).toHaveTextContent(/Mit Google anmelden/i);
  });

  it('renders an "Mit Google registrieren" button on the register tab', () => {
    renderForm();

    fireEvent.click(screen.getByTestId('auth-tab-register'));

    const googleBtn = screen.getByTestId('auth-google-signin');
    expect(googleBtn).toBeInTheDocument();
    expect(googleBtn).toHaveTextContent(/Mit Google registrieren/i);
  });

  it('shows a divider labeled "oder" between the form and the Google button', () => {
    renderForm();

    expect(screen.getByText(/^oder$/i)).toBeInTheDocument();
  });

  it('does not show the Google button while in forgot-password mode', () => {
    renderForm();

    fireEvent.click(screen.getByText(/Passwort vergessen\?/i));

    expect(screen.queryByTestId('auth-google-signin')).not.toBeInTheDocument();
  });

  it('calls loginWithGoogle and navigates on success', async () => {
    mocks.loginWithGoogle.mockResolvedValueOnce({ user: { uid: 'g-uid' } });

    renderForm();

    fireEvent.click(screen.getByTestId('auth-google-signin'));

    await waitFor(() => {
      expect(mocks.loginWithGoogle).toHaveBeenCalledTimes(1);
    });
  });

  it('displays a friendly German error when the popup is closed by the user', async () => {
    mocks.loginWithGoogle.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });

    renderForm();

    fireEvent.click(screen.getByTestId('auth-google-signin'));

    await waitFor(() => {
      expect(screen.getByText(/Anmeldung abgebrochen/i)).toBeInTheDocument();
    });
  });

  it('displays a friendly German error when the popup is blocked by the browser', async () => {
    mocks.loginWithGoogle.mockRejectedValueOnce({ code: 'auth/popup-blocked' });

    renderForm();

    fireEvent.click(screen.getByTestId('auth-google-signin'));

    await waitFor(() => {
      expect(screen.getByText(/Popup blockiert/i)).toBeInTheDocument();
    });
  });

  it('displays a friendly German error when the domain is not authorized for Google sign-in', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.loginWithGoogle.mockRejectedValueOnce({ code: 'auth/unauthorized-domain' });

    renderForm();

    fireEvent.click(screen.getByTestId('auth-google-signin'));

    await waitFor(() => {
      expect(screen.getByText(/Domain nicht freigegeben/i)).toBeInTheDocument();
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Google sign-in failed:',
      expect.objectContaining({ code: 'auth/unauthorized-domain' })
    );
    consoleErrorSpy.mockRestore();
  });

  it('logs the raw error to the console so the actual error code is visible', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rawError = { code: 'auth/something-new-and-unmapped', message: 'raw message' };
    mocks.loginWithGoogle.mockRejectedValueOnce(rawError);

    renderForm();

    fireEvent.click(screen.getByTestId('auth-google-signin'));

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Google sign-in failed:', rawError);
    });
    consoleErrorSpy.mockRestore();
  });

  it('disables the Google button while the email/password submit is loading', async () => {
    let resolveLogin: ((value?: unknown) => void) | undefined;
    mocks.login.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLogin = resolve;
      })
    );

    renderForm();

    fireEvent.change(screen.getByLabelText('E-Mail'), {
      target: { value: 'someone@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Passwort', { exact: true }), {
      target: { value: 'somepassword' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));

    await waitFor(() => {
      expect(screen.getByTestId('auth-google-signin')).toBeDisabled();
    });

    resolveLogin?.();
  });
});

describe('AuthForm newsletter opt-in during registration', () => {
  async function fillRegistrationBasics({ tickNewsletter = false } = {}) {
    fireEvent.click(screen.getByTestId('auth-tab-register'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Peter' } });
    fireEvent.change(screen.getByLabelText('E-Mail'), {
      target: { value: 'peter@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Passwort', { exact: true }), {
      target: { value: 'supergeheim123' },
    });
    fireEvent.change(screen.getByLabelText('Passwort bestätigen'), {
      target: { value: 'supergeheim123' },
    });
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    if (tickNewsletter) {
      fireEvent.click(screen.getByTestId('auth-newsletter-opt-in'));
    }
  }

  it('renders a newsletter opt-in checkbox on the registration form, checked off by default', () => {
    renderForm();

    fireEvent.click(screen.getByTestId('auth-tab-register'));

    const checkbox = screen.getByTestId('auth-newsletter-opt-in');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
    expect(checkbox.parentElement?.textContent ?? '').toMatch(/Newsletter/i);
  });

  it('does not render the newsletter checkbox on the login form', () => {
    renderForm();

    expect(screen.queryByTestId('auth-newsletter-opt-in')).not.toBeInTheDocument();
  });

  it('forwards subscribeNewsletter=false when the checkbox stays unchecked', async () => {
    mocks.register.mockResolvedValueOnce({ user: { uid: 'p1' } });

    renderForm();
    await fillRegistrationBasics();

    fireEvent.click(screen.getByRole('button', { name: 'Registrieren' }));

    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalledTimes(1);
    });
    expect(mocks.register).toHaveBeenCalledWith(
      'peter@example.com',
      'supergeheim123',
      'Peter',
      false
    );
  });

  it('forwards subscribeNewsletter=true after the user ticks the checkbox', async () => {
    mocks.register.mockResolvedValueOnce({ user: { uid: 'p2' } });

    renderForm();
    await fillRegistrationBasics({ tickNewsletter: true });

    expect(screen.getByTestId('auth-newsletter-opt-in')).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Registrieren' }));

    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalledTimes(1);
    });
    expect(mocks.register).toHaveBeenCalledWith(
      'peter@example.com',
      'supergeheim123',
      'Peter',
      true
    );
  });
});

describe('AuthForm password reset', () => {
  it('calls resetPassword and shows the "E-Mail gesendet" confirmation', async () => {
    mocks.resetPassword.mockResolvedValueOnce(undefined);

    renderForm();

    fireEvent.click(screen.getByText(/Passwort vergessen\?/i));

    fireEvent.change(screen.getByLabelText('E-Mail'), {
      target: { value: 'peter@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Link senden/i }));

    await waitFor(() => {
      expect(mocks.resetPassword).toHaveBeenCalledWith('peter@example.com');
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Bitte überprüfe dein Postfach und folge dem Link/i)
      ).toBeInTheDocument();
    });
  });

  it('surfaces a friendly error when resetPassword rejects with too-many-requests', async () => {
    mocks.resetPassword.mockRejectedValueOnce({
      code: 'auth/too-many-requests',
      message: 'Bitte warte 2 Minuten.',
    });

    renderForm();

    fireEvent.click(screen.getByText(/Passwort vergessen\?/i));
    fireEvent.change(screen.getByLabelText('E-Mail'), {
      target: { value: 'peter@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Link senden/i }));

    await waitFor(() => {
      expect(screen.getByText(/Bitte warte 2 Minuten/i)).toBeInTheDocument();
    });
  });

  it('shows a generic error for any other resetPassword failure', async () => {
    mocks.resetPassword.mockRejectedValueOnce({ code: 'functions/internal' });

    renderForm();

    fireEvent.click(screen.getByText(/Passwort vergessen\?/i));
    fireEvent.change(screen.getByLabelText('E-Mail'), {
      target: { value: 'peter@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Link senden/i }));

    await waitFor(() => {
      expect(screen.getByText(/Ein Fehler ist aufgetreten/i)).toBeInTheDocument();
    });
  });
});
