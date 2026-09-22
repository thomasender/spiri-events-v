import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth, MIN_PASSWORD_LENGTH } from '../hooks/useAuth';
import SeoMeta from '../components/SeoMeta';
import './AuthActionPage.css';

const STATUS = {
  APPLYING: 'applying',
  SUCCESS: 'success',
  ALREADY_VERIFIED: 'already-verified',
  EXPIRED: 'expired',
  INVALID: 'invalid',
  ERROR: 'error',
};

const RESET_STATUS = {
  LOADING: 'loading',
  READY: 'ready',
  VERIFYING: 'verifying',
  SUCCESS: 'success',
  EXPIRED: 'expired',
  INVALID: 'invalid',
  ERROR: 'error',
};

function statusToMessage(status) {
  switch (status) {
    case STATUS.APPLYING:
      return 'Bestätige deine E-Mail-Adresse …';
    case STATUS.SUCCESS:
      return 'E-Mail-Adresse bestätigt!';
    case STATUS.ALREADY_VERIFIED:
      return 'Deine E-Mail-Adresse ist bereits bestätigt.';
    case STATUS.EXPIRED:
      return 'Dieser Link ist abgelaufen.';
    case STATUS.INVALID:
      return 'Dieser Link ist ungültig.';
    case STATUS.ERROR:
    default:
      return 'Bestätigung fehlgeschlagen.';
  }
}

function resetTitle(status) {
  switch (status) {
    case RESET_STATUS.LOADING:
      return 'Link wird geprüft …';
    case RESET_STATUS.READY:
      return 'Neues Passwort vergeben';
    case RESET_STATUS.VERIFYING:
      return 'Passwort wird gespeichert …';
    case RESET_STATUS.SUCCESS:
      return 'Passwort aktualisiert!';
    case RESET_STATUS.EXPIRED:
      return 'Dieser Link ist abgelaufen.';
    case RESET_STATUS.INVALID:
      return 'Dieser Link ist ungültig.';
    case RESET_STATUS.ERROR:
    default:
      return 'Zurücksetzen fehlgeschlagen.';
  }
}

export default function AuthActionPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshEmailVerified } = useAuth();
  const [status, setStatus] = useState(STATUS.APPLYING);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState(null);

  const [resetStatus, setResetStatus] = useState(RESET_STATUS.LOADING);
  const [resetEmail, setResetEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [resetCancelled, setResetCancelled] = useState(false);

  const mode = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (mode !== 'verifyEmail' || !oobCode) {
        return;
      }
      try {
        await applyActionCode(auth, oobCode);
        if (cancelled) return;
        setStatus(STATUS.SUCCESS);
        await refreshEmailVerified();
        setTimeout(() => navigate('/', { replace: true }), 2500);
      } catch (err) {
        if (cancelled) return;
        const code = err?.code ?? '';
        if (code === 'auth/email-already-verified') {
          setStatus(STATUS.ALREADY_VERIFIED);
        } else if (code === 'auth/invalid-action-code') {
          setStatus(STATUS.EXPIRED);
        } else if (code === 'auth/missing-action-code') {
          setStatus(STATUS.INVALID);
        } else {
          setStatus(STATUS.ERROR);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [mode, oobCode, navigate, refreshEmailVerified]);

  useEffect(() => {
    let cancelled = false;
    setResetCancelled(false);

    async function run() {
      if (mode !== 'resetPassword' || !oobCode) {
        return;
      }
      try {
        const email = await verifyPasswordResetCode(auth, oobCode);
        if (cancelled) return;
        setResetEmail(email);
        setResetStatus(RESET_STATUS.READY);
      } catch (err) {
        if (cancelled) return;
        const code = err?.code ?? '';
        if (code === 'auth/invalid-action-code') {
          setResetStatus(RESET_STATUS.EXPIRED);
        } else if (code === 'auth/missing-action-code') {
          setResetStatus(RESET_STATUS.INVALID);
        } else {
          setResetStatus(RESET_STATUS.ERROR);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [mode, oobCode]);

  const handleResend = async () => {
    const current = auth.currentUser;
    if (!current) {
      setResendMessage('Bitte melde dich an, um eine neue Bestätigungs-E-Mail anzufordern.');
      return;
    }
    setResending(true);
    setResendMessage(null);
    try {
      const fn = httpsCallable(functions, 'sendVerificationEmail');
      await fn({ userId: current.uid });
      setResendMessage('Eine neue Bestätigungs-E-Mail wurde versendet.');
    } catch (err) {
      setResendMessage('Versand fehlgeschlagen. Bitte versuche es später erneut.');
    } finally {
      setResending(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!oobCode) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`);
      return;
    }
    if (password !== confirm) {
      setFormError('Die Passwörter stimmen nicht überein.');
      return;
    }
    setSubmitting(true);
    setResetStatus(RESET_STATUS.VERIFYING);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      if (resetCancelled) return;
      setResetStatus(RESET_STATUS.SUCCESS);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      const code = err?.code ?? '';
      if (code === 'auth/invalid-action-code') {
        setResetStatus(RESET_STATUS.EXPIRED);
      } else if (code === 'auth/weak-password') {
        setFormError('Das Passwort ist zu schwach.');
        setResetStatus(RESET_STATUS.READY);
      } else {
        setResetStatus(RESET_STATUS.ERROR);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isVerifyMode = mode === 'verifyEmail';
  const isResetMode = mode === 'resetPassword';
  const isSuccess = status === STATUS.SUCCESS || status === STATUS.ALREADY_VERIFIED;
  const isFailure =
    status === STATUS.EXPIRED || status === STATUS.INVALID || status === STATUS.ERROR;

  const pageTitle = useMemo(() => {
    if (isVerifyMode) return 'E-Mail bestätigen';
    if (isResetMode) return 'Passwort zurücksetzen';
    return 'Auth-Aktion';
  }, [isVerifyMode, isResetMode]);

  return (
    <>
      <SeoMeta title={pageTitle} path="/auth-action" noindex />
      <div className="auth-action-page">
        <div className="auth-action-card">
          {isVerifyMode && (
            <>
              <h1>{statusToMessage(status)}</h1>
              {status === STATUS.APPLYING && (
                <div className="loading-spinner" aria-label="Wird geladen" />
              )}
              {isSuccess && <p>Du wirst gleich weitergeleitet …</p>}
              {isFailure && (
                <>
                  <p>
                    Fordere unten einen neuen Bestätigungslink an und prüfe auch deinen Spam-Ordner.
                  </p>
                  <button type="button" onClick={handleResend} disabled={resending}>
                    {resending ? 'Wird gesendet …' : 'Neuen Link anfordern'}
                  </button>
                  {resendMessage && <p className="auth-action-resend-message">{resendMessage}</p>}
                </>
              )}
            </>
          )}

          {isResetMode && (
            <>
              <h1>{resetTitle(resetStatus)}</h1>
              {resetStatus === RESET_STATUS.LOADING && (
                <div className="loading-spinner" aria-label="Wird geladen" />
              )}
              {resetStatus === RESET_STATUS.READY && (
                <>
                  <p>
                    Vergib ein neues Passwort für <strong>{resetEmail}</strong>.
                  </p>
                  <form className="auth-action-form" onSubmit={handleResetSubmit}>
                    <label>
                      Neues Passwort
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD_LENGTH}
                        required
                        disabled={submitting}
                      />
                    </label>
                    <label>
                      Passwort bestätigen
                      <input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD_LENGTH}
                        required
                        disabled={submitting}
                      />
                    </label>
                    {formError && <p className="auth-action-error">{formError}</p>}
                    <button type="submit" disabled={submitting}>
                      {submitting ? 'Wird gespeichert …' : 'Passwort speichern'}
                    </button>
                  </form>
                </>
              )}
              {resetStatus === RESET_STATUS.VERIFYING && (
                <div className="loading-spinner" aria-label="Wird gespeichert" />
              )}
              {resetStatus === RESET_STATUS.SUCCESS && (
                <p>Du kannst dich jetzt mit dem neuen Passwort anmelden.</p>
              )}
              {(resetStatus === RESET_STATUS.EXPIRED ||
                resetStatus === RESET_STATUS.INVALID ||
                resetStatus === RESET_STATUS.ERROR) && (
                <p className="auth-action-login-cta">
                  <Link to="/login">Zur Anmeldung</Link>
                </p>
              )}
            </>
          )}

          {!isVerifyMode && !isResetMode && (
            <>
              <h1>Dieser Link ist ungültig.</h1>
              <p>
                <Link to="/login">Zur Anmeldung</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
