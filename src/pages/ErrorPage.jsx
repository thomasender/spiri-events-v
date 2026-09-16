import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';
import './ErrorPage.css';

const REDIRECT_SECONDS = 8;

function NotFoundContent({ secondsLeft, onCancel }) {
  return (
    <p className="error-page-redirect" aria-live="polite">
      Du wirst in {secondsLeft} Sekunde{secondsLeft === 1 ? '' : 'n'} automatisch zur Startseite
      weitergeleitet.{' '}
      <button type="button" className="error-page-redirect-cancel" onClick={onCancel}>
        Abbrechen
      </button>
    </p>
  );
}

export default function ErrorPage({
  type = 'error',
  error = null,
  onRetry = null,
  redirectTo = '/',
  redirectSeconds = REDIRECT_SECONDS,
}) {
  const navigate = useNavigate();
  const [secondsLeft, setSecondsLeft] = useState(redirectSeconds);
  const [cancelled, setCancelled] = useState(false);
  const redirectedRef = useRef(false);

  const isNotFound = type === 'not-found';

  useEffect(() => {
    if (!isNotFound || cancelled || redirectedRef.current) return undefined;

    if (secondsLeft <= 0) {
      redirectedRef.current = true;
      navigate(redirectTo, { replace: true });
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setSecondsLeft((value) => value - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [isNotFound, cancelled, secondsLeft, navigate, redirectTo]);

  const cancelRedirect = () => setCancelled(true);

  const title = isNotFound ? 'Seite nicht gefunden' : 'Oops, da ist etwas schief gelaufen!';
  const description = isNotFound
    ? 'Die Seite, die du suchst, existiert nicht (mehr).'
    : 'Bitte versuche es später noch einmal.';
  const seoTitle = isNotFound ? 'Seite nicht gefunden' : 'Fehler';
  const seoDescription = isNotFound
    ? 'Die gesuchte Seite wurde nicht gefunden.'
    : 'Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es später noch einmal.';

  return (
    <div className="page-container error-page fade-enter" role="alert">
      <SeoMeta title={seoTitle} description={seoDescription} path={redirectTo} noindex />

      <div className="error-page-card">
        <span className="eyebrow">{isNotFound ? '404' : 'Fehler'}</span>
        <h1 className="error-page-title">{title}</h1>
        <p className="error-page-message">{description}</p>

        {!isNotFound && error?.message && import.meta.env.DEV && (
          <pre className="error-page-detail">{error.message}</pre>
        )}

        <div className="error-page-actions">
          <Link to={redirectTo} className="btn btn-primary">
            Zurück zur Startseite
          </Link>
          {!isNotFound && onRetry && (
            <button type="button" className="btn btn-secondary" onClick={onRetry}>
              Erneut versuchen
            </button>
          )}
        </div>

        {isNotFound && !cancelled && secondsLeft > 0 && (
          <NotFoundContent secondsLeft={secondsLeft} onCancel={cancelRedirect} />
        )}
      </div>
    </div>
  );
}
