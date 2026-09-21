import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { applyActionCode } from 'firebase/auth';
import { auth, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../hooks/useAuth';
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

export default function AuthActionPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshEmailVerified } = useAuth();
  const [status, setStatus] = useState(STATUS.APPLYING);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState(null);

  const mode = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (mode !== 'verifyEmail' || !oobCode) {
        setStatus(STATUS.INVALID);
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

  const isSuccess = status === STATUS.SUCCESS || status === STATUS.ALREADY_VERIFIED;
  const isFailure =
    status === STATUS.EXPIRED || status === STATUS.INVALID || status === STATUS.ERROR;

  return (
    <>
      <SeoMeta title="E-Mail bestätigen" path="/auth-action" noindex />
      <div className="auth-action-page">
        <div className="auth-action-card">
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
        </div>
      </div>
    </>
  );
}
