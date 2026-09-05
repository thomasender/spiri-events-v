import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, authErrorMessage } from '../hooks/useAuth';
import { Mail, Lock, User } from 'lucide-react';
import './AuthForm.css';

function GoogleIcon() {
  return (
    <svg
      className="google-icon"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export default function AuthForm() {
  const [mode, setMode] = useState('login');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [acceptDatenschutz, setAcceptDatenschutz] = useState(false);
  const [acceptNutzungsbedingungen, setAcceptNutzungsbedingungen] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [wobbling, setWobbling] = useState(false);
  const wobbleTimerRef = useRef(null);
  const { login, register, loginWithGoogle, resetPassword } = useAuth();
  const navigate = useNavigate();

  const isLogin = mode === 'login';

  const triggerWobble = () => {
    setWobbling(false);
    if (wobbleTimerRef.current) {
      clearTimeout(wobbleTimerRef.current);
    }
    requestAnimationFrame(() => {
      setWobbling(true);
      wobbleTimerRef.current = setTimeout(() => setWobbling(false), 850);
    });
  };

  const switchMode = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setIsForgotPassword(false);
    setError('');
    setErrorCode('');
    setPassword('');
    setConfirmPassword('');
    setDisplayName('');
    setAcceptDatenschutz(false);
    setAcceptNutzungsbedingungen(false);
    setWobbling(false);
    if (wobbleTimerRef.current) {
      clearTimeout(wobbleTimerRef.current);
      wobbleTimerRef.current = null;
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setErrorCode('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err) {
      console.error('Google sign-in failed:', err);
      setError(authErrorMessage(err));
      setErrorCode(err?.code || '');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setErrorCode('');

    if (!isLogin && !acceptDatenschutz) {
      setError('Bitte akzeptiere die Datenschutzerklärung.');
      triggerWobble();
      return;
    }

    if (!isLogin && !acceptNutzungsbedingungen) {
      setError('Bitte stimme den AGBs zu.');
      triggerWobble();
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein.');
      triggerWobble();
      return;
    }

    if (!isLogin && password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen haben.');
      triggerWobble();
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
      navigate('/');
    } catch (err) {
      const errorMessages = {
        'auth/email-already-in-use': 'Diese E-Mail-Adresse wird bereits verwendet.',
        'auth/invalid-email': 'Bitte gib eine gültige E-Mail-Adresse ein.',
        'auth/weak-password': 'Das Passwort ist zu schwach.',
        'auth/user-not-found': 'Kein Konto mit dieser E-Mail-Adresse gefunden.',
        'auth/wrong-password': 'Das Passwort ist falsch.',
        'auth/invalid-credential': 'E-Mail oder Passwort sind falsch.',
      };
      setError(errorMessages[err.code] || 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
      setErrorCode(err.code || '');
      triggerWobble();
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setErrorCode('');
    setLoading(true);

    try {
      await resetPassword(email);
      setResetSent(true);
    } catch {
      setError('Ein Fehler ist aufgetreten. Bitte überprüfe deine E-Mail-Adresse.');
      triggerWobble();
    } finally {
      setLoading(false);
    }
  };

  const showCreateAccountCta =
    isLogin &&
    error &&
    ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(errorCode) &&
    email.includes('@');

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-icon">
            <img src="/logo-mark.svg" alt="" aria-hidden="true" />
          </div>
          {isForgotPassword ? (
            resetSent ? (
              <>
                <h1>E-Mail gesendet</h1>
                <p>
                  Bitte überprüfe dein Postfach und folge dem Link, um dein Passwort zurückzusetzen.
                </p>
              </>
            ) : (
              <>
                <h1>Passwort vergessen</h1>
                <p>
                  Gib deine E-Mail-Adresse ein, um eine Anleitung zum Zurücksetzen deines Passworts
                  zu erhalten.
                </p>
              </>
            )
          ) : (
            <>
              <h1>{isLogin ? 'Willkommen zurück' : 'Konto erstellen'}</h1>
              <p>
                {isLogin
                  ? 'Melde dich an, um Events zu verwalten.'
                  : 'Registriere dich, um eigene Events zu erstellen.'}
              </p>
            </>
          )}
        </div>

        {!isForgotPassword && (
          <div className="auth-tabs" role="tablist" aria-label="Anmeldung oder Registrierung">
            <button
              type="button"
              role="tab"
              aria-selected={isLogin}
              className={`auth-tab ${isLogin ? 'is-active' : ''}`}
              onClick={() => switchMode('login')}
              data-testid="auth-tab-login"
            >
              Anmelden
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isLogin}
              className={`auth-tab ${!isLogin ? 'is-active' : ''}`}
              onClick={() => switchMode('register')}
              data-testid="auth-tab-register"
            >
              Registrieren
            </button>
          </div>
        )}

        {isForgotPassword ? (
          resetSent ? (
            <div className="auth-footer">
              <p>
                <button onClick={() => setIsForgotPassword(false)} className="link-btn">
                  Zurück zur Anmeldung
                </button>
              </p>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="auth-form">
              <div className="form-group">
                <label htmlFor="email">E-Mail</label>
                <div className="input-wrapper">
                  <Mail size={18} className="input-icon" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="deine@email.de"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              {error && <p className="error-text">{error}</p>}

              <button
                type="submit"
                className={`btn btn-primary btn-submit ${wobbling ? 'btn-wobble' : ''}`}
                disabled={loading}
                data-testid="auth-submit"
                onAnimationEnd={() => wobbling && setWobbling(false)}
              >
                {loading ? (
                  <span className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                ) : (
                  <span>Link senden</span>
                )}
              </button>
            </form>
          )
        ) : (
          <>
            <form onSubmit={handleSubmit} className="auth-form">
              {!isLogin && (
                <div className="form-group">
                  <label htmlFor="displayName">Name</label>
                  <div className="input-wrapper">
                    <User size={18} className="input-icon" />
                    <input
                      id="displayName"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Dein Name"
                      autoComplete="name"
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="email">E-Mail</label>
                <div className="input-wrapper">
                  <Mail size={18} className="input-icon" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="deine@email.de"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password">Passwort</label>
                <div className="input-wrapper">
                  <Lock size={18} className="input-icon" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                  />
                </div>
              </div>

              {!isLogin && (
                <div className="form-group">
                  <label htmlFor="confirmPassword">Passwort bestätigen</label>
                  <div className="input-wrapper">
                    <Lock size={18} className="input-icon" />
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              )}

              {!isLogin && (
                <div className="legal-checkboxes">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={acceptDatenschutz}
                      onChange={(e) => setAcceptDatenschutz(e.target.checked)}
                      aria-required="true"
                    />
                    <span>
                      Ich habe die{' '}
                      <Link to="/datenschutz" target="_blank" rel="noopener noreferrer">
                        Datenschutzerklärung
                      </Link>{' '}
                      gelesen und stimme dieser zu.
                    </span>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={acceptNutzungsbedingungen}
                      onChange={(e) => setAcceptNutzungsbedingungen(e.target.checked)}
                      aria-required="true"
                    />
                    <span>
                      Ich habe die{' '}
                      <Link to="/agbs" target="_blank" rel="noopener noreferrer">
                        AGBs
                      </Link>{' '}
                      gelesen und stimme diesen zu.
                    </span>
                  </label>
                </div>
              )}

              {error && <p className="error-text">{error}</p>}

              <button
                type="submit"
                className={`btn btn-primary btn-submit ${wobbling ? 'btn-wobble' : ''}`}
                disabled={loading}
                data-testid="auth-submit"
                onAnimationEnd={() => wobbling && setWobbling(false)}
              >
                {loading ? (
                  <span className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                ) : (
                  <span>{isLogin ? 'Anmelden' : 'Registrieren'}</span>
                )}
              </button>
            </form>

            <div className="auth-divider" role="separator" aria-label="oder">
              <span>oder</span>
            </div>

            <button
              type="button"
              className="btn btn-google btn-submit"
              onClick={handleGoogleSignIn}
              disabled={loading || googleLoading}
              data-testid="auth-google-signin"
            >
              <GoogleIcon />
              <span>{isLogin ? 'Mit Google anmelden' : 'Mit Google registrieren'}</span>
            </button>

            {showCreateAccountCta && (
              <div className="auth-create-cta" data-testid="auth-create-cta">
                <p>
                  Noch kein Konto? Erstelle jetzt eines mit <strong>{email}</strong>.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-submit"
                  onClick={() => switchMode('register')}
                  data-testid="auth-create-cta-button"
                >
                  Konto erstellen
                </button>
              </div>
            )}

            {!showCreateAccountCta && (
              <div className="auth-footer">
                {isLogin && (
                  <p className="forgot-password">
                    <button
                      onClick={() => {
                        setIsForgotPassword(true);
                        setResetSent(false);
                        setError('');
                        setErrorCode('');
                      }}
                      className="link-btn"
                    >
                      Passwort vergessen?
                    </button>
                  </p>
                )}
                {!isLogin && (
                  <p>
                    Bereits ein Konto?{' '}
                    <button onClick={() => switchMode('login')} className="link-btn">
                      Zur Anmeldung
                    </button>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
