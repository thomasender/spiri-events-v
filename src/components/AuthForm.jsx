import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Mail, Lock, User } from 'lucide-react';
import './AuthForm.css';

export default function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [acceptDatenschutz, setAcceptDatenschutz] = useState(false);
  const [acceptNutzungsbedingungen, setAcceptNutzungsbedingungen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { login, register, resetPassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isLogin && !acceptDatenschutz) {
      setError('Bitte akzeptiere die Datenschutzerklärung.');
      return;
    }

    if (!isLogin && !acceptNutzungsbedingungen) {
      setError('Bitte stimme den AGBs zu.');
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    if (!isLogin && password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen haben.');
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
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setIsForgotPassword(false);
    setError('');
    setAcceptDatenschutz(false);
    setAcceptNutzungsbedingungen(false);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err) {
      setError('Ein Fehler ist aufgetreten. Bitte überprüfe deine E-Mail-Adresse.');
    } finally {
      setLoading(false);
    }
  };

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
                  Bitte überprüfe dein Postfach und folge dem Link, um dein Passwort
                  zurückzusetzen.
                </p>
              </>
            ) : (
              <>
                <h1>Passwort vergessen</h1>
                <p>
                  Gib deine E-Mail-Adresse ein, um eine Anleitung zum Zurücksetzen deines
                  Passworts zu erhalten.
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

              <button type="submit" className="btn btn-primary btn-submit" disabled={loading}>
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
                      required
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
                      required
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

              <button type="submit" className="btn btn-primary btn-submit" disabled={loading}>
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

            <div className="auth-footer">
              {isLogin && (
                <p className="forgot-password">
                  <button
                    onClick={() => {
                      setIsForgotPassword(true);
                      setResetSent(false);
                      setError('');
                    }}
                    className="link-btn"
                  >
                    Passwort vergessen?
                  </button>
                </p>
              )}
              <p>
                {isLogin ? 'Noch kein Konto?' : 'Bereits ein Konto?'}
                <button onClick={toggleMode} className="link-btn">
                  {isLogin ? 'Registrieren' : 'Anmelden'}
                </button>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
