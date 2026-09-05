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
